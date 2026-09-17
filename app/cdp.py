"""Minimal, dependency-light Chrome DevTools Protocol client.

Used to turn the very same HTML/CSS that the editor previews into a
pixel-identical PNG (long image) or a vector PDF, via headless Edge/Chrome.
"""
from __future__ import annotations

import base64
import json
import os
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import urllib.parse
import urllib.request

import websocket  # websocket-client

BROWSER_CANDIDATES = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
]


class CDPError(RuntimeError):
    pass


def find_browser() -> str:
    """Return the path of an installed Chromium based browser."""
    env = os.environ.get("RESUME_BROWSER")
    if env and os.path.exists(env):
        return env
    for path in BROWSER_CANDIDATES:
        if path and os.path.exists(path):
            return path
    for name in ("msedge", "chrome", "chromium", "google-chrome"):
        found = shutil.which(name)
        if found:
            return found
    raise CDPError("未找到 Edge/Chrome 浏览器，请设置环境变量 RESUME_BROWSER 指向浏览器可执行文件")


def _free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


class Page:
    """A single CDP page (tab)."""

    def __init__(self, ws_url: str, timeout: float = 60.0):
        self._ws = websocket.create_connection(ws_url, timeout=timeout, max_size=512 * 1024 * 1024)
        self._id = 0
        self._lock = threading.Lock()
        self.send("Page.enable")
        self.send("Runtime.enable")

    def send(self, method: str, params=None) -> dict:
        with self._lock:
            self._id += 1
            mid = self._id
            self._ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
            while True:
                raw = self._ws.recv()
                if not raw:
                    raise CDPError("浏览器连接已断开")
                msg = json.loads(raw)
                if msg.get("id") == mid:
                    if "error" in msg:
                        raise CDPError("%s -> %s" % (method, json.dumps(msg["error"], ensure_ascii=False)))
                    return msg.get("result", {})

    # -- high level helpers -------------------------------------------------
    def set_viewport(self, width: int, height: int, scale: float = 1.0):
        self.send("Emulation.setDeviceMetricsOverride", {
            "width": width, "height": height, "deviceScaleFactor": scale, "mobile": False,
        })

    def navigate(self, url: str, wait: bool = True, timeout: float = 30.0):
        self.send("Page.navigate", {"url": url})
        if wait:
            deadline = time.time() + timeout
            while time.time() < deadline:
                try:
                    state = self.eval("document.readyState")
                except CDPError:
                    time.sleep(0.1)
                    continue
                if state == "complete":
                    return
                time.sleep(0.1)

    def eval(self, expression: str, await_promise: bool = False):
        res = self.send("Runtime.evaluate", {
            "expression": expression,
            "returnByValue": True,
            "awaitPromise": await_promise,
        })
        if "exceptionDetails" in res:
            raise CDPError(json.dumps(res["exceptionDetails"], ensure_ascii=False)[:500])
        return res.get("result", {}).get("value")

    def wait_for(self, expression: str, timeout: float = 30.0, interval: float = 0.1):
        deadline = time.time() + timeout
        last = None
        while time.time() < deadline:
            try:
                last = self.eval(expression)
            except CDPError as exc:  # page still loading
                last = str(exc)
            if last:
                return last
            time.sleep(interval)
        raise CDPError("等待条件超时: %s (最后结果=%r)" % (expression, last))

    def metrics(self) -> dict:
        m = self.send("Page.getLayoutMetrics")
        return m.get("cssContentSize") or m.get("contentSize")

    def screenshot_png(self, clip: dict | None = None, scale: float = 2.0) -> bytes:
        params = {"format": "png", "captureBeyondViewport": True, "fromSurface": True}
        if clip:
            params["clip"] = dict(clip, scale=scale)
        res = self.send("Page.captureScreenshot", params)
        return base64.b64decode(res["data"])

    def print_pdf(self, **options) -> bytes:
        opts = {
            "printBackground": True,
            "preferCSSPageSize": True,
            "marginTop": 0, "marginBottom": 0, "marginLeft": 0, "marginRight": 0,
        }
        opts.update(options)
        res = self.send("Page.printToPDF", opts)
        return base64.b64decode(res["data"])

    def close(self):
        try:
            self.send("Page.close")
        except Exception:
            pass
        try:
            self._ws.close()
        except Exception:
            pass


class Browser:
    """Owns one headless browser process, shared by all export jobs."""

    def __init__(self, exe: str | None = None, user_data_dir: str | None = None):
        self.exe = exe or find_browser()
        self.port = _free_port()
        self._tmp = user_data_dir or tempfile.mkdtemp(prefix="resume-cdp-")
        self._owns_tmp = user_data_dir is None
        self.proc: subprocess.Popen | None = None

    @property
    def version_url(self) -> str:
        return "http://127.0.0.1:%d/json/version" % self.port

    def start(self, timeout: float = 30.0):
        if self.proc and self.proc.poll() is None:
            return self
        args = [
            self.exe,
            "--headless=new",
            "--disable-gpu",
            "--hide-scrollbars",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-extensions",
            "--disable-background-networking",
            "--disable-sync",
            "--mute-audio",
            "--remote-allow-origins=*",
            "--force-device-scale-factor=1",
            "--disable-lcd-text",
            "--allow-file-access-from-files",
            "--remote-debugging-port=%d" % self.port,
            "--user-data-dir=%s" % self._tmp,
            "about:blank",
        ]
        creation = 0
        if os.name == "nt":
            creation = 0x08000000  # CREATE_NO_WINDOW
        self.proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                     creationflags=creation)
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                urllib.request.urlopen(self.version_url, timeout=1).read()
                return self
            except Exception:
                if self.proc.poll() is not None:
                    raise CDPError("浏览器进程启动失败 (exit=%s)" % self.proc.returncode)
                time.sleep(0.2)
        raise CDPError("浏览器调试端口未就绪")

    def new_page(self, url: str = "about:blank") -> Page:
        self.start()
        req = urllib.request.Request(
            "http://127.0.0.1:%d/json/new?%s" % (self.port, urllib.parse.quote(url, safe="")),
            method="PUT")
        try:
            info = json.load(urllib.request.urlopen(req, timeout=15))
        except urllib.error.HTTPError:
            # older builds only accept GET
            info = json.load(urllib.request.urlopen(
                "http://127.0.0.1:%d/json/new?%s" % (self.port, urllib.parse.quote(url, safe="")), timeout=15))
        return Page(info["webSocketDebuggerUrl"])

    def stop(self):
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=5)
            except Exception:
                self.proc.kill()
        self.proc = None
        if self._owns_tmp:
            shutil.rmtree(self._tmp, ignore_errors=True)

    def __enter__(self):
        return self.start()

    def __exit__(self, *exc):
        self.stop()
