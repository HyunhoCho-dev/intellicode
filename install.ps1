# IntelliCode — One-line PowerShell installer
#
# Usage (run in PowerShell as Administrator or regular user):
#   iex (iwr -useb https://raw.githubusercontent.com/HyunhoCho-dev/intellicode/main/install.ps1).Content
#
# What this script does:
#   1. Checks for Node.js (>= 18), npm, and git
#   2. Clones the repository to a temporary directory
#   3. Installs intellicode globally via "npm install -g ." from the local clone
#      (this strategy avoids the TAR_ENTRY_ERROR / ENOENT failures that occur
#       when npm tries to extract a GitHub tarball on Windows)
#   4. Verifies the installation
#
# NOTE: All exit paths use 'return' (not 'exit') so this script is safe to run
# via iex without closing the calling PowerShell session.

function Install-Intellicode {
[CmdletBinding()]
param()

$Repo  = "HyunhoCho-dev/intellicode"
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

# ─── Check prerequisites ──────────────────────────────────────────────────────

Write-Step "Checking prerequisites..."

$nodePath = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodePath) {
    Write-Fail "Node.js is not installed."
    Write-Host ""
    Write-Host "  Please install Node.js 18 or later from:" -ForegroundColor Yellow
    Write-Host "  https://nodejs.org/" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "  Press Enter to close"
    return
}

$nodeVersion = & node --version 2>&1
$nodeMajor   = [int]($nodeVersion -replace "^v(\d+)\..*", '$1')
if ($nodeMajor -lt 18) {
    Write-Fail "Node.js $nodeVersion is too old. Version 18+ is required."
    Write-Host ""
    Write-Host "  Please upgrade Node.js from: https://nodejs.org/" -ForegroundColor Yellow
    Read-Host "  Press Enter to close"
    return
}
Write-Success "Node.js $nodeVersion detected"

$npmPath = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npmPath) {
    Write-Fail "npm is not found. Please reinstall Node.js."
    Read-Host "  Press Enter to close"
    return
}
$npmVersion = & npm --version 2>&1
Write-Success "npm v$npmVersion detected"

$gitPath = Get-Command git -ErrorAction SilentlyContinue
if (-not $gitPath) {
    Write-Fail "git is not installed."
    Write-Host ""
    Write-Host "  Please install Git from: https://git-scm.com/download/win" -ForegroundColor Yellow
    Write-Host "  Then re-run this installer." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "  Press Enter to close"
    return
}
$gitVersion = & git --version 2>&1
Write-Success "$gitVersion detected"

# ─── Uninstall any previous version ──────────────────────────────────────────

$existingCmd = Get-Command $Cmd -ErrorAction SilentlyContinue
if ($existingCmd) {
    Write-Step "Removing previous installation..."
    & npm uninstall -g intellicode 2>&1 | Out-Null
    Write-Success "Previous version removed"
}

# ─── Clone repository to a temporary directory ───────────────────────────────
#
# Using "git clone + npm install -g ." instead of "npm install -g github:..."
# avoids TAR_ENTRY_ERROR / ENOENT failures on Windows, where npm's tarball
# extractor can fail to create nested subdirectories (e.g. dist/tools/).

$tempDir = Join-Path $env:TEMP "intellicode-install-$([System.IO.Path]::GetRandomFileName())"

Write-Step "Cloning repository..."
Write-Host "  (Cloning: https://github.com/$Repo)" -ForegroundColor DarkGray
Write-Host ""

$cloneOutput = & git clone --depth=1 "https://github.com/$Repo.git" $tempDir 2>&1
$cloneOutput | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Fail "Failed to clone repository (exit code $LASTEXITCODE)."
    Write-Host ""
    Write-Host "  Make sure you have an internet connection and try again." -ForegroundColor Yellow
    if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue }
    Read-Host "  Press Enter to close"
    return
}
Write-Success "Repository cloned to temporary directory"

# ─── Install from local clone ─────────────────────────────────────────────────

Write-Step "Installing intellicode..."
Write-Host "  (Running: npm install -g . from local clone)" -ForegroundColor DarkGray
Write-Host ""

$installFailed = $false
try {
    Push-Location $tempDir
    $npmOutput = & npm install -g . 2>&1
    $npmOutput | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
    if ($LASTEXITCODE -ne 0) {
        $installFailed = $true
    }
} catch {
    Pop-Location
    Write-Host ""
    Write-Fail "Installation failed: $_"
    Write-Host ""
    Write-Host "  If you see permission errors, try running as Administrator." -ForegroundColor Yellow
    if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue }
    Read-Host "  Press Enter to close"
    return
} finally {
    if ((Get-Location).Path -eq $tempDir) { Pop-Location }
}

# Clean up temporary clone regardless of install outcome
if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue }

if ($installFailed) {
    Write-Host ""
    Write-Fail "npm exited with code $LASTEXITCODE"
    Write-Host ""
    Write-Host "  Common fixes:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  1. Run PowerShell as Administrator and try again." -ForegroundColor Yellow
    Write-Host "  2. If you see EACCES/EPERM errors, fix npm permissions:" -ForegroundColor Yellow
    Write-Host "       https://docs.npmjs.com/resolving-eacces-permissions-errors" -ForegroundColor Yellow
    Write-Host "  3. If you see network errors, check your internet connection." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "  Press Enter to close"
    return
}

# ─── Refresh PATH so the new binary is visible in this session ────────────────

# On Windows, npm places global bin scripts directly in the prefix directory.
# 'npm config get prefix' works with all npm versions (unlike the deprecated 'npm bin -g').
$npmGlobalBin = (& npm config get prefix 2>$null | Out-String).Trim()
if ($npmGlobalBin -and (Test-Path $npmGlobalBin)) {
    if (($env:PATH -split ';') -notcontains $npmGlobalBin) {
        $env:PATH = "$npmGlobalBin;$env:PATH"
    }
}

# ─── Verify ───────────────────────────────────────────────────────────────────

Write-Step "Verifying installation..."

# Verify that the dist/index.js entry point is present in the installed package.
$npmGlobalModules = (& npm config get prefix 2>$null | Out-String).Trim()
if ($npmGlobalModules -and (Test-Path $npmGlobalModules)) {
    $entryPoint = Join-Path $npmGlobalModules "node_modules" "intellicode" "dist" "index.js"
    if (-not (Test-Path $entryPoint)) {
        Write-Fail "Entry point not found: $entryPoint"
        Write-Host ""
        Write-Host "  The dist/index.js file is missing from the installed package." -ForegroundColor Yellow
        Write-Host "  Try running this installer again, or install manually:" -ForegroundColor Yellow
        Write-Host "    git clone https://github.com/$Repo.git" -ForegroundColor Cyan
        Write-Host "    cd intellicode" -ForegroundColor Cyan
        Write-Host "    npm install -g ." -ForegroundColor Cyan
        Read-Host "  Press Enter to close"
        return
    }
    Write-Success "Entry point verified: dist/index.js"
}

$intellicodePath = Get-Command $Cmd -ErrorAction SilentlyContinue
if (-not $intellicodePath) {
    Write-Fail "intellicode command not found in PATH after installation."
    Write-Host ""
    Write-Host "  The package was installed but the command is not in your PATH." -ForegroundColor Yellow
    Write-Host "  Run the following to find the npm global directory:" -ForegroundColor Yellow
    Write-Host "    npm config get prefix" -ForegroundColor Cyan
    Write-Host "  Then add that directory to your PATH environment variable," -ForegroundColor Yellow
    Write-Host "  or open a new PowerShell window and try 'intellicode --help'." -ForegroundColor Yellow
    Read-Host "  Press Enter to close"
    return
}

Write-Success "intellicode installed at $($intellicodePath.Source)"

# Confirm intellicode --version actually works (catches MODULE_NOT_FOUND at this point)
$versionOutput = & intellicode --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Fail "intellicode --version failed: $versionOutput"
    Write-Host ""
    Write-Host "  The command was installed but cannot run. Try:" -ForegroundColor Yellow
    Write-Host "    npm uninstall -g intellicode" -ForegroundColor Cyan
    Write-Host "    git clone https://github.com/$Repo.git && cd intellicode && npm install -g ." -ForegroundColor Cyan
    Read-Host "  Press Enter to close"
    return
}
Write-Success "intellicode --version: $versionOutput"

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

} # end function Install-Intellicode

Install-Intellicode
