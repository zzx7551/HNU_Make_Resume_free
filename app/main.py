# -*- coding: utf-8 -*-
"""简历制作 1.0 —— 本地简历编辑器（仿“超级简历”式模板，可导出 PDF / 长图）。"""
from __future__ import annotations

import json
import socket
import sys
import threading
import webbrowser
from pathlib import Path

import uvicorn
from fastapi import Body, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

if __package__ in (None, ""):  # 允许 python app/main.py 直接运行
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from app.exporter import Exporter
    from app.sample import blank_resume, sample_resume
    from app.store import EXPORT_DIR, ROOT, Store, UPLOAD_DIR
else:
    from .exporter import Exporter
    from .sample import blank_resume, sample_resume
    from .store import EXPORT_DIR, ROOT, Store, UPLOAD_DIR

WEB_DIR = ROOT / "web"
DATA_DIR = ROOT / "data"

store = Store(sample_factory=sample_resume)
app = FastAPI(title="简历制作 1.0", docs_url="/api/docs", redoc_url=None)

BASE_URL = {"value": "http://127.0.0.1:8765"}
exporter = Exporter(BASE_URL["value"])


def _refresh_base_url(port: int = 8765):
    BASE_URL["value"] = "http://127.0.0.1:%d" % port
    exporter.base_url = BASE_URL["value"].rstrip("/")


# --------------------------------------------------------------------- 静态
app.mount("/static", StaticFiles(directory=str(WEB_DIR)), name="static")
app.mount("/data", StaticFiles(directory=str(DATA_DIR)), name="data")
app.mount("/exports", StaticFiles(directory=str(EXPORT_DIR)), name="exports")


@app.get("/", response_class=HTMLResponse)
def index():
    return (WEB_DIR / "index.html").read_text(encoding="utf-8")


@app.get("/export/view/{rid}", response_class=HTMLResponse)
def export_view(rid: str, print: int = Query(0)):
    try:
        store.get(rid)
    except FileNotFoundError:
        raise HTTPException(404, "简历不存在")
    return (WEB_DIR / "export.html").read_text(encoding="utf-8")


@app.get("/print/{rid}")
def print_view(rid: str):
    return RedirectResponse("/export/view/%s?print=1" % rid)


# --------------------------------------------------------------------- 简历
@app.get("/api/resumes")
def api_list():
    return {"items": store.list()}


@app.get("/api/resume/{rid}")
def api_get(rid: str):
    try:
        return store.get(rid)
    except FileNotFoundError:
        raise HTTPException(404, "简历不存在")


@app.put("/api/resume/{rid}")
def api_put(rid: str, payload: dict = Body(...)):
    try:
        return store.save(rid, payload)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@app.post("/api/resume")
def api_create(payload: dict = Body(default={})):
    """新建简历：默认给一份带示例内容的模板简历；mode='blank' 时给空白模板。"""
    data = payload.get("data")
    if data is None:
        data = blank_resume() if payload.get("mode") == "blank" else sample_resume()
    return store.create(name=payload.get("name"), data=data)


@app.post("/api/resume/{rid}/duplicate")
def api_duplicate(rid: str):
    try:
        return store.duplicate(rid)
    except FileNotFoundError:
        raise HTTPException(404, "简历不存在")


@app.delete("/api/resume/{rid}")
def api_delete(rid: str):
    store.delete(rid)
    return {"ok": True}


@app.get("/api/default")
def api_default():
    data = store.ensure_default()
    return {"id": data.get("id"), "resume": data}


# --------------------------------------------------------------------- 上传
@app.post("/api/upload")
async def api_upload(file: UploadFile = File(...)):
    content = await file.read()
    if len(content) > 8 * 1024 * 1024:
        raise HTTPException(400, "图片不能超过 8MB")
    url = store.save_upload(file.filename or "avatar.png", content)
    return {"url": url}


# --------------------------------------------------------------------- 导出
@app.post("/api/export/{rid}")
def api_export(rid: str, payload: dict = Body(default={})):
    fmt = (payload.get("format") or "pdf").lower()
    try:
        store.get(rid)
    except FileNotFoundError:
        raise HTTPException(404, "简历不存在")
    try:
        if fmt == "png":
            scale = float(payload.get("scale") or 2)
            info = exporter.export_png(rid, scale=scale)
            return {"ok": True, "format": "png",
                    "url": "/exports/" + info["filename"],
                    "filename": info["filename"],
                    "width": info["width"], "height": info["height"]}
        if fmt == "pdf":
            info = exporter.export_pdf(rid)
            return {"ok": True, "format": "pdf",
                    "url": "/exports/" + info["filename"],
                    "filename": info["filename"], "size": info["size"]}
        if fmt == "html":
            html = exporter.html_snapshot(rid)
            name = "resume_%s.html" % rid
            (EXPORT_DIR / name).write_text(html, encoding="utf-8")
            return {"ok": True, "format": "html", "url": "/exports/" + name, "filename": name}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, "导出失败：%s" % exc)
    raise HTTPException(400, "不支持的导出格式")


@app.get("/api/export/download/{filename}")
def api_download(filename: str):
    path = EXPORT_DIR / Path(filename).name
    if not path.exists():
        raise HTTPException(404, "文件不存在")
    return FileResponse(str(path), filename=path.name)


@app.get("/api/health")
def api_health():
    from .cdp import find_browser
    try:
        browser = find_browser()
    except Exception as exc:  # noqa: BLE001
        browser = "未找到浏览器: %s" % exc
    return {"ok": True, "browser": browser, "baseUrl": BASE_URL["value"]}


def pick_port(preferred: int = 8765) -> int:
    for port in [preferred, 8766, 8767, 8768, 8899, 0]:
        try:
            s = socket.socket()
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind(("127.0.0.1", port))
            got = s.getsockname()[1]
            s.close()
            return got
        except OSError:
            continue
    return preferred


def run(port: int = 8765, open_browser: bool = True):
    import os
    if os.environ.get("RESUME_NO_BROWSER") == "1":
        open_browser = False
    port = pick_port(port)
    _refresh_base_url(port)
    store.ensure_default()
    url = "http://127.0.0.1:%d" % port
    print("=" * 60)
    print("  简历制作 1.0  已启动")
    print("  访问地址: %s" % url)
    print("  （关闭本窗口即退出程序）")
    print("=" * 60)
    if open_browser:
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    run()
