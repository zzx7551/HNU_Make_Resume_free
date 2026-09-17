# -*- coding: utf-8 -*-
"""启动入口：双击 启动.bat 或运行 python run.py"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.main import run  # noqa: E402

if __name__ == "__main__":
    run()
