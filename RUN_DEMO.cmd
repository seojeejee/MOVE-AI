@echo off
chcp 65001 >nul
cd /d "%~dp0"
start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 1; Start-Process 'http://127.0.0.1:8001'"
python server.py
pause
