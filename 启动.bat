@echo off
chcp 65001 >nul
title 简历制作 1.0
cd /d "%~dp0"

set "PY="
if exist "%USERPROFILE%\.conda\envs\python3.12\python.exe" set "PY=%USERPROFILE%\.conda\envs\python3.12\python.exe"
if not defined PY if exist "D:\zzx_python\Anaconda\python.exe" set "PY=D:\zzx_python\Anaconda\python.exe"
if not defined PY set "PY=python"

echo 使用 Python: %PY%
"%PY%" -c "import fastapi, uvicorn, websocket, PIL" 2>nul
if errorlevel 1 (
  echo 正在安装依赖...
  "%PY%" -m pip install -r requirements.txt
)

"%PY%" "%~dp0run.py"
pause
