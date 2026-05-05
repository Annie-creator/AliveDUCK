@echo off
chcp 65001 >nul
title 板鸭留子 Alive · 推送 (纯 bat 版)

cd /d "%~dp0"

echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo   板鸭留子 Alive · 一键推送
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.

REM ── 检查是否在 git 仓库 ────────────────────────────────
if not exist ".git" (
    echo [错误] 当前目录不是 git 仓库
    echo 当前目录: %CD%
    echo.
    echo 请确认这个 bat 文件放在 banya-alive 项目根目录
    goto :end
)

REM ── 检查 git 是否可用 ──────────────────────────────────
git --version >nul 2>&1
if errorlevel 1 (
    echo [错误] git 命令不可用,请安装 git: https://git-scm.com/download/win
    goto :end
)

REM ── 显示当前修改 ──────────────────────────────────────
echo [1/4] 查看待推送的修改:
echo.
git status --short
echo.

REM ── 检查有没有修改 ────────────────────────────────────
git diff --quiet --cached
set CACHED=%errorlevel%
git diff --quiet
set UNTRACKED=%errorlevel%
git ls-files --others --exclude-standard --error-unmatch . >nul 2>&1
set NEW=%errorlevel%

if %CACHED%==0 if %UNTRACKED%==0 if not %NEW%==0 (
    echo 工作区干净,没有任何修改可推送。
    goto :end
)

REM ── 暂存 ──────────────────────────────────────────────
echo [2/4] 暂存修改 (git add .)...
git add .
if errorlevel 1 (
    echo [错误] git add 失败
    goto :end
)
echo       完成

REM ── 提交(自动消息带时间戳)────────────────────────────
echo [3/4] 提交变更...
for /f "tokens=2 delims==" %%I in ('"wmic os get localdatetime /value"') do set ldt=%%I
set MSG=Update %ldt:~0,4%-%ldt:~4,2%-%ldt:~6,2% %ldt:~8,2%:%ldt:~10,2%
git commit -m "%MSG%"
if errorlevel 1 (
    echo [提示] 没有可提交的内容,继续推送已有 commits
)

REM ── 推送 ──────────────────────────────────────────────
echo [4/4] 推送到 GitHub...
git push
if errorlevel 1 (
    echo.
    echo [错误] git push 失败
    echo.
    echo 可能原因:
    echo   1. 没有网络
    echo   2. GitHub 凭证过期 - 去 Windows 凭据管理器删 git: 开头的条目
    echo   3. 远端有别人改的内容,需要先 git pull
    goto :end
)

echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo   ✓ 推送成功! Vercel 1-2 分钟后上线
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

REM 打开 Vercel
start "" "https://vercel.com/dashboard"

:end
echo.
echo 按任意键关闭...
pause >nul
