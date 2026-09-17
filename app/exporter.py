# -*- coding: utf-8 -*-
"""导出服务：用无头浏览器把预览页渲染成 PDF / PNG（长图，多页自动合并）。"""
from __future__ import annotations

import base64
import io
import json
import re
import threading
import time
from pathlib import Path

from PIL import Image

from .cdp import Browser, CDPError
from .store import EXPORT_DIR

MAX_PNG_HEIGHT = 30000  # 生成单张长图的高度上限（CSS px），超过则自动降低倍率


def safe_name(text: str, fallback: str = "resume") -> str:
    text = re.sub(r"[\\/:*?\"<>|\r\n\t]+", "_", (text or "").strip())
    text = re.sub(r"\s+", "_", text)
    return (text or fallback)[:40]


class Exporter:
    """线程安全：所有导出串行执行，复用同一个浏览器进程。"""

    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self._browser: Browser | None = None
        self._lock = threading.Lock()

    # ---------------------------------------------------------------- 浏览器
    def _browser_instance(self) -> Browser:
        if self._browser is None:
            self._browser = Browser()
        self._browser.start()
        return self._browser

    def shutdown(self):
        if self._browser is not None:
            self._browser.stop()
            self._browser = None

    def _open(self, rid: str, media: str = "screen"):
        br = self._browser_instance()
        page = br.new_page()
        page.set_viewport(900, 1400, 1.0)
        if media == "print":
            page.send("Emulation.setEmulatedMedia", {"media": "print"})
        page.navigate("%s/export/view/%s" % (self.base_url, rid))
        page.wait_for("window.__READY__ === true", timeout=60)
        page.eval("document.fonts && document.fonts.ready ? document.fonts.ready.then(()=>1) : 1",
                  await_promise=True)
        page.wait_for("window.__LAYOUT_STABLE__ === true", timeout=30)
        return page

    @staticmethod
    def _paper_rect(page) -> dict:
        return page.eval(
            "(() => { const el = document.getElementById('paper');"
            " const r = el.getBoundingClientRect();"
            " return {x: r.left + window.scrollX, y: r.top + window.scrollY,"
            "         width: r.width, height: r.height}; })()")

    def _postprocess_png(self, raw: bytes, path: Path) -> tuple[int, int]:
        im = Image.open(io.BytesIO(raw))
        if im.mode not in ("RGB", "RGBA"):
            im = im.convert("RGB")
        im.save(path, format="PNG", optimize=True)
        return im.size

    # ---------------------------------------------------------------- 导出
    def export_png(self, rid: str, scale: float = 2.0) -> dict:
        with self._lock:
            page = None
            try:
                page = self._open(rid)
                rect = self._paper_rect(page)
                height = float(rect.get("height") or 0)
                if height * scale > MAX_PNG_HEIGHT:
                    scale = max(1.0, round(MAX_PNG_HEIGHT / height, 2))
                png = page.screenshot_png(clip={
                    "x": float(rect["x"]), "y": float(rect["y"]),
                    "width": float(rect["width"]), "height": height,
                }, scale=scale)
            finally:
                if page is not None:
                    page.close()
        stamp = time.strftime("%Y%m%d-%H%M%S")
        path = EXPORT_DIR / ("%s_%s.png" % (stamp, safe_name(rid)))
        w, h = self._postprocess_png(png, path)
        return {"path": path, "filename": path.name, "width": w, "height": h, "scale": scale}

    def export_pdf(self, rid: str) -> dict:
        with self._lock:
            page = None
            try:
                page = self._open(rid, media="print")
                pdf = page.print_pdf()
            finally:
                if page is not None:
                    page.close()
        stamp = time.strftime("%Y%m%d-%H%M%S")
        path = EXPORT_DIR / ("%s_%s.pdf" % (stamp, safe_name(rid)))
        path.write_bytes(pdf)
        return {"path": path, "filename": path.name, "size": len(pdf)}

    def html_snapshot(self, rid: str) -> str:
        """导出完整 HTML（带内联样式，可直接用浏览器打开/打印）。"""
        with self._lock:
            page = None
            try:
                page = self._open(rid)
                html = page.eval("document.documentElement.outerHTML")
            finally:
                if page is not None:
                    page.close()
        return "<!DOCTYPE html>\n" + (html or "")
