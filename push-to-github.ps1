# push-to-github.ps1
#
# 由 push-to-github.bat 调用。不要直接双击 ps1 文件本身。
#
# 流程:add → commit → push → 打开 Vercel
# 任何错误都通过 exit code 上报给 bat,由 bat 暂停窗口让用户看见。

param(
    [string]$Message = ""
)

# 切到脚本所在目录
Set-Location -Path $PSScriptRoot

# ── 美化输出 ──────────────────────────────────────────────
function Write-Step($emoji, $text) {
    Write-Host ""
    Write-Host "$emoji  $text" -ForegroundColor Cyan
}
function Write-Ok($text) {
    Write-Host "   [OK] $text" -ForegroundColor Green
}
function Write-Warn($text) {
    Write-Host "   [!]  $text" -ForegroundColor Yellow
}
function Write-Err($text) {
    Write-Host "   [X]  $text" -ForegroundColor Red
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host "  板鸭留子 Alive · 一键推送" -ForegroundColor White
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray

# ── 0. 验证环境 ──────────────────────────────────────────
Write-Step "🔍" "检查项目环境"

if (-not (Test-Path ".git")) {
    Write-Err "当前目录不是 git 仓库:"
    Write-Err "  $PWD"
    Write-Err "请把 push-to-github.bat 和 push-to-github.ps1 放在 banya-alive 项目根目录"
    exit 1
}

try {
    $null = & git --version 2>&1
    if ($LASTEXITCODE -ne 0) { throw "git not found" }
} catch {
    Write-Err "git 命令不可用,请先安装 git: https://git-scm.com/download/win"
    exit 1
}
Write-Ok "git 环境就绪"

# ── 1. 看一眼有什么变化 ───────────────────────────────────
Write-Step "📋" "查看待推送的修改"

$status = & git status --short 2>&1
if (-not $status) {
    Write-Warn "工作区干净,没有任何修改可推送"
    exit 0
}

Write-Host ""
$status | ForEach-Object {
    Write-Host "   $_" -ForegroundColor Gray
}

# ── 2. 加文件 ────────────────────────────────────────────
Write-Step "➕" "暂存修改 (git add .)"
& git add . 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Err "git add 失败"
    exit 1
}
Write-Ok "已暂存"

# ── 3. 提交 ──────────────────────────────────────────────
Write-Step "💾" "提交变更"

if (-not $Message) {
    $Message = "Update " + (Get-Date -Format "yyyy-MM-dd HH:mm")
}

$commitOutput = & git commit -m "$Message" 2>&1
if ($LASTEXITCODE -ne 0) {
    if ($commitOutput -match "nothing to commit") {
        Write-Warn "已是最新,无需提交"
    } else {
        Write-Err "git commit 失败:"
        Write-Host $commitOutput -ForegroundColor Red
        exit 1
    }
} else {
    Write-Ok "提交完成: $Message"
}

# ── 4. 推送 ──────────────────────────────────────────────
Write-Step "🚀" "推送到 GitHub"

$pushOutput = & git push 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Err "git push 失败:"
    Write-Host $pushOutput -ForegroundColor Red
    Write-Host ""
    Write-Host "可能原因:" -ForegroundColor Yellow
    Write-Host "  · 没有网络" -ForegroundColor Gray
    Write-Host "  · GitHub 凭证过期(去 Windows 凭据管理器删 git: 开头的条目,重新登录)" -ForegroundColor Gray
    Write-Host "  · 远端有别人改的内容,需要先 git pull" -ForegroundColor Gray
    exit 1
}
Write-Ok "推送成功"

# ── 5. 完成 + 打开 Vercel ─────────────────────────────────
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host "  ✓ 已发布。Vercel 1-2 分钟后自动上线" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host ""

# 打开 Vercel 看部署进度
try {
    Start-Process "https://vercel.com/dashboard"
    Write-Host "已打开 Vercel Dashboard。看到 Production 那一行变绿就是部署完成。" -ForegroundColor Gray
} catch {
    Write-Host "去 https://vercel.com/dashboard 看部署进度" -ForegroundColor Gray
}

exit 0
