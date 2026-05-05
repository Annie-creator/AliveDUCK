@echo off
chcp 65001 >nul
title 板鸭留子 Alive · 推送

REM 切到 bat 所在目录(无论从哪里启动都对)
cd /d "%~dp0"

REM 跑 PowerShell 脚本,绕过执行策略
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& '%~dp0push-to-github.ps1'"

REM 无论成功失败都先停下,让你看到所有输出
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo   按任意键关闭这个窗口
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
pause >nul
