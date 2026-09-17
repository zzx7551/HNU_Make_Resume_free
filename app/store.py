# -*- coding: utf-8 -*-
"""本地 JSON 文件存储：多份简历、头像上传、导出文件。"""
from __future__ import annotations

import json
import re
import shutil
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
RESUME_DIR = DATA_DIR / "resumes"
UPLOAD_DIR = DATA_DIR / "uploads"
EXPORT_DIR = ROOT / "exports"
BACKUP_DIR = DATA_DIR / "backups"

SAFE_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def _ensure_dirs():
    for d in (DATA_DIR, RESUME_DIR, UPLOAD_DIR, EXPORT_DIR, BACKUP_DIR):
        d.mkdir(parents=True, exist_ok=True)


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def _now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


class Store:
    def __init__(self, sample_factory=None):
        _ensure_dirs()
        self.sample_factory = sample_factory
        self._path_cache: dict[str, Path] = {}

    # ------------------------------------------------------------------ 简历
    def _path(self, rid: str) -> Path:
        if not SAFE_ID.match(rid or ""):
            raise ValueError("非法的简历 ID")
        return RESUME_DIR / ("%s.json" % rid)

    def list(self) -> list[dict]:
        items = []
        for p in sorted(RESUME_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                continue
            items.append({
                "id": p.stem,
                "name": data.get("name") or "未命名简历",
                "updatedAt": data.get("updatedAt") or time.strftime("%Y-%m-%d %H:%M:%S",
                                                                    time.localtime(p.stat().st_mtime)),
            })
        return items

    def get(self, rid: str) -> dict:
        path = self._path(rid)
        if not path.exists():
            raise FileNotFoundError(rid)
        return json.loads(path.read_text(encoding="utf-8"))

    def save(self, rid: str, data: dict) -> dict:
        path = self._path(rid)
        if path.exists():
            try:
                shutil.copyfile(path, BACKUP_DIR / ("%s.%s.bak" % (rid, time.strftime("%Y%m%d%H%M%S"))))
            except Exception:
                pass
        data = dict(data or {})
        data["id"] = rid
        data["updatedAt"] = _now()
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        return data

    def create(self, name: str | None = None, data: dict | None = None) -> dict:
        rid = new_id()
        if data is None and self.sample_factory is not None:
            data = self.sample_factory()
        data = dict(data or {})
        if name:
            data["name"] = name
        else:
            data.setdefault("name", "我的简历")
        return self.save(rid, data)

    def duplicate(self, rid: str) -> dict:
        data = self.get(rid)
        data["name"] = (data.get("name") or "简历") + " 副本"
        return self.create(data=data)

    def delete(self, rid: str) -> None:
        path = self._path(rid)
        if path.exists():
            try:
                shutil.copyfile(path, BACKUP_DIR / ("%s.%s.deleted.bak" % (rid, time.strftime("%Y%m%d%H%M%S"))))
            except Exception:
                pass
            path.unlink()

    def ensure_default(self) -> dict:
        """没有简历时自动创建一份示例简历，返回默认简历。"""
        items = self.list()
        if items:
            return self.get(items[0]["id"])
        return self.create()

    # ------------------------------------------------------------------ 文件
    def save_upload(self, filename: str, content: bytes) -> str:
        ext = Path(filename or "").suffix.lower()
        if ext not in (".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"):
            ext = ".png"
        name = "%s%s" % (new_id(), ext)
        (UPLOAD_DIR / name).write_bytes(content)
        return "/data/uploads/" + name
