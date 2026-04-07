# IntelliCode — One-line PowerShell installer
#
# Usage (run in PowerShell as Administrator or regular user):
#   iex (iwr -useb https://raw.githubusercontent.com/HyunhoCho-dev/intellicode/main/install.ps1).Content
#
# What this script does:
#   1. Checks for Node.js (>= 18) and npm
#   2. Installs intellicode globally via npm from the GitHub repository
#   3. Verifies the installation

$ErrorActionPreference = "Stop"

$Repo  = "HyunhoCho-dev/intellicode"
$Pkg   = "github:$Repo"
$Cmd   = "intellicode"

function Write-Step([string]$msg) {
    Write-Host ""
    Write-Host "  $msg" -ForegroundColor Cyan
}

function Write-Success([string]$msg) {
    Write-Host "  ✓ $msg" -ForegroundColor Green
}

function Write-Fail([string]$msg) {
    Write-Host "  ✗ $msg" -ForegroundColor Red
}

# ─── Banner ───────────────────────────────────────────────────────────────────

Clear-Host
Write-Host ""
Write-Host "  ___       _       _ _ _  _____          _      " -ForegroundColor Cyan
Write-Host " |_ _|_ __ | |_ ___| | (_)/ ____|___   __| | ___ " -ForegroundColor Cyan
Write-Host "  | || '_ \| __/ _ \ | | | |   / _ \ / _\` |/ _ \" -ForegroundColor Cyan
Write-Host "  | || | | | ||  __/ | | | |__| (_) | (_| |  __/" -ForegroundColor Cyan
Write-Host " |___|_| |_|\__\___|_|_|_|\_____\___/ \__,_|\___|" -ForegroundColor Cyan
Write-Host ""
Write-Host "  AI coding agent powered by GitHub Copilot" -ForegroundColor DarkGray
Write-Host ""

# ─── Check Node.js ────────────────────────────────────────────────────────────

Write-Step "Checking prerequisites..."

$nodePath = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodePath) {
    Write-Fail "Node.js is not installed."
    Write-Host ""
    Write-Host "  Please install Node.js 18 or later from:" -ForegroundColor Yellow
    Write-Host "  https://nodejs.org/" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

$nodeVersion = & node --version 2>&1
$nodeMajor   = [int]($nodeVersion -replace "^v(\d+)\..*", '$1')
if ($nodeMajor -lt 18) {
    Write-Fail "Node.js $nodeVersion is too old. Version 18+ is required."
    Write-Host ""
    Write-Host "  Please upgrade Node.js from: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}
Write-Success "Node.js $nodeVersion detected"

$npmPath = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npmPath) {
    Write-Fail "npm is not found. Please reinstall Node.js."
    exit 1
}
$npmVersion = & npm --version 2>&1
Write-Success "npm v$npmVersion detected"

# ─── Install ──────────────────────────────────────────────────────────────────

Write-Step "Installing intellicode..."
Write-Host "  (Running: npm install -g $Pkg)" -ForegroundColor DarkGray

try {
    & npm install -g $Pkg 2>&1 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
    if ($LASTEXITCODE -ne 0) { throw "npm exited with code $LASTEXITCODE" }
} catch {
    Write-Fail "Installation failed: $_"
    Write-Host ""
    Write-Host "  If you see permission errors, try running as Administrator." -ForegroundColor Yellow
    exit 1
}

# ─── Verify ───────────────────────────────────────────────────────────────────

Write-Step "Verifying installation..."

$intellicodePath = Get-Command $Cmd -ErrorAction SilentlyContinue
if (-not $intellicodePath) {
    Write-Fail "intellicode command not found in PATH after installation."
    Write-Host ""
    Write-Host "  Try running: npm bin -g" -ForegroundColor Yellow
    Write-Host "  And add that directory to your PATH." -ForegroundColor Yellow
    exit 1
}

Write-Success "intellicode installed at $($intellicodePath.Source)"

# ─── Done ─────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "  ─────────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "  Get started:" -ForegroundColor White
Write-Host ""
Write-Host "    1. Log in with GitHub Copilot:" -ForegroundColor White
Write-Host "       intellicode auth login" -ForegroundColor Cyan
Write-Host ""
Write-Host "    2. Start the interactive agent:" -ForegroundColor White
Write-Host "       intellicode" -ForegroundColor Cyan
Write-Host ""
Write-Host "    3. Or run a single command:" -ForegroundColor White
Write-Host '       intellicode "explain this project"' -ForegroundColor Cyan
Write-Host ""
Write-Host "  For help: intellicode --help" -ForegroundColor DarkGray
Write-Host ""
