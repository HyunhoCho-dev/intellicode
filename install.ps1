# IntelliCode — Git-clone based PowerShell installer
#
# Usage (run in PowerShell):
#   iex (iwr -useb https://raw.githubusercontent.com/HyunhoCho-dev/intellicode/main/install.ps1).Content
#
# What this script does:
#   1. Checks for Node.js (>= 18), npm, and git
#   2. Removes any previous global npm installation of intellicode
#   3. Clones the repository to ~/intellicode (or updates it if already present)
#   4. Runs "npm install" inside the cloned directory to get dependencies
#   5. Runs "npm run build" if dist/index.js is missing
#   6. Creates wrapper scripts (intellicode.cmd + intellicode.ps1) in ~/intellicode/bin/
#   7. Adds ~/intellicode/bin to the User PATH environment variable
#
# This strategy completely avoids "npm install -g" (and the TAR_ENTRY_ERROR /
# MODULE_NOT_FOUND failures it causes on Windows).
#
# NOTE: All exit paths use 'return' (not 'exit') so this script is safe to run
# via iex without closing the calling PowerShell session.

function Install-Intellicode {
[CmdletBinding()]
param()

$Repo       = "HyunhoCho-dev/intellicode"
$Cmd        = "intellicode"
$InstallDir = [System.IO.Path]::Combine($HOME, "intellicode")
$BinDir     = [System.IO.Path]::Combine($InstallDir, "bin")

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

# ─── Remove any previous global npm installation ──────────────────────────────
#
# Previous install attempts used "npm install -g github:..." or "npm install -g ."
# which caused TAR_ENTRY_ERROR / MODULE_NOT_FOUND on Windows.  Clean them up so
# the old broken wrapper does not shadow the new one.

$prevGlobal = & npm list -g --depth=0 intellicode 2>&1
if ($prevGlobal -match "intellicode@") {
    Write-Step "Removing previous global npm installation..."
    & npm uninstall -g intellicode 2>&1 | Out-Null
    Write-Success "Previous global version removed"
}

# ─── Clone or update the repository ──────────────────────────────────────────
#
# We clone to a *permanent* directory (~\intellicode) instead of a temp dir so
# that "npm install -g ." is never needed — wrapper scripts will call node
# directly against the local dist/index.js.

$gitDir = [System.IO.Path]::Combine($InstallDir, ".git")

if (Test-Path $gitDir) {
    Write-Step "Updating existing installation at $InstallDir ..."
    $locationChanged = $false
    try {
        Push-Location $InstallDir
        $locationChanged = $true
        $pullOutput = & git pull --ff-only 2>&1
        $pullOutput | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  git pull failed — performing a fresh clone instead." -ForegroundColor Yellow
            Pop-Location
            $locationChanged = $false
            Remove-Item -Recurse -Force $InstallDir -ErrorAction SilentlyContinue
        } else {
            Write-Success "Repository updated"
        }
    } catch {
        Write-Host "  Update failed: $_ — performing a fresh clone instead." -ForegroundColor Yellow
        if ($locationChanged) { Pop-Location; $locationChanged = $false }
        Remove-Item -Recurse -Force $InstallDir -ErrorAction SilentlyContinue
    } finally {
        if ($locationChanged) { Pop-Location }
    }
}

if (-not (Test-Path $gitDir)) {
    Write-Step "Cloning repository to $InstallDir ..."
    Write-Host "  (Cloning: https://github.com/$Repo)" -ForegroundColor DarkGray
    Write-Host ""

    if (Test-Path $InstallDir) {
        Remove-Item -Recurse -Force $InstallDir -ErrorAction SilentlyContinue
    }

    $cloneOutput = & git clone --depth=1 "https://github.com/$Repo.git" $InstallDir 2>&1
    $cloneOutput | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }

    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Fail "Failed to clone repository (exit code $LASTEXITCODE)."
        Write-Host ""
        Write-Host "  Make sure you have an internet connection and try again." -ForegroundColor Yellow
        Read-Host "  Press Enter to close"
        return
    }
    Write-Success "Repository cloned to $InstallDir"
}

# ─── Install npm dependencies ─────────────────────────────────────────────────

Write-Step "Installing npm dependencies..."
Write-Host "  (Running: npm install inside $InstallDir)" -ForegroundColor DarkGray
Write-Host ""

$locationChanged = $false
try {
    Push-Location $InstallDir
    $locationChanged = $true
    $npmOutput = & npm install 2>&1
    $npmOutput | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "npm install failed (exit code $LASTEXITCODE)."
        Read-Host "  Press Enter to close"
        return
    }
    Write-Success "npm dependencies installed"
} catch {
    Write-Fail "npm install failed: $_"
    Read-Host "  Press Enter to close"
    return
} finally {
    if ($locationChanged) { Pop-Location }
}

# ─── Build (only if dist/index.js is absent) ──────────────────────────────────

$distEntry = [System.IO.Path]::Combine($InstallDir, "dist", "index.js")

if (-not (Test-Path $distEntry)) {
    Write-Step "Building from source (dist/ not found in repository)..."
    Write-Host "  (Running: npm run build inside $InstallDir)" -ForegroundColor DarkGray
    Write-Host ""

    $locationChanged = $false
    try {
        Push-Location $InstallDir
        $locationChanged = $true
        $buildOutput = & npm run build 2>&1
        $buildOutput | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  Build exited with code $LASTEXITCODE." -ForegroundColor Yellow
        } else {
            Write-Success "Build complete"
        }
    } catch {
        Write-Host "  Build step skipped: $_" -ForegroundColor DarkGray
    } finally {
        if ($locationChanged) { Pop-Location }
    }
} else {
    Write-Success "dist/index.js already present — skipping build"
}

# Abort if entry point is still missing after optional build
if (-not (Test-Path $distEntry)) {
    Write-Fail "dist/index.js not found at: $distEntry"
    Write-Host ""
    Write-Host "  The build step did not produce dist/index.js." -ForegroundColor Yellow
    Write-Host "  Please open an issue at https://github.com/$Repo/issues" -ForegroundColor Yellow
    Read-Host "  Press Enter to close"
    return
}
Write-Success "Entry point confirmed: $distEntry"

# ─── Create wrapper scripts ───────────────────────────────────────────────────
#
# Instead of relying on "npm install -g" (which keeps failing on this machine),
# we drop a tiny .cmd and .ps1 wrapper into ~/intellicode/bin/ that forward
# all arguments to "node dist/index.js" in the cloned directory.

Write-Step "Creating wrapper scripts in $BinDir ..."

if (-not (Test-Path $BinDir)) {
    New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
}

# .cmd wrapper — used by cmd.exe and older PowerShell sessions
$cmdWrapper = [System.IO.Path]::Combine($BinDir, "$Cmd.cmd")
@"
@echo off
node "$InstallDir\dist\index.js" %*
"@ | Set-Content -Path $cmdWrapper -Encoding ASCII -Force

# .ps1 wrapper — used by modern PowerShell sessions
$ps1Wrapper = [System.IO.Path]::Combine($BinDir, "$Cmd.ps1")
@"
& node "$InstallDir\dist\index.js" @args
"@ | Set-Content -Path $ps1Wrapper -Encoding UTF8 -Force

Write-Success "Wrapper scripts created"

# ─── Add bin/ to User PATH ────────────────────────────────────────────────────

Write-Step "Updating PATH environment variable..."

$userPath  = [Environment]::GetEnvironmentVariable("PATH", "User")
$pathParts = ($userPath -split ";") | Where-Object { $_ -ne "" }

if ($pathParts -notcontains $BinDir) {
    $newUserPath = ($pathParts + $BinDir) -join ";"
    [Environment]::SetEnvironmentVariable("PATH", $newUserPath, "User")
    Write-Success "Added $BinDir to User PATH"
    Write-Host "  (You may need to open a new terminal window for this to take effect)" -ForegroundColor DarkGray
} else {
    Write-Success "$BinDir is already in User PATH"
}

# Also update PATH in the current session so the command is available immediately
if (($env:PATH -split ";") -notcontains $BinDir) {
    $env:PATH = "$BinDir;$env:PATH"
}

# ─── Verify ───────────────────────────────────────────────────────────────────

Write-Step "Verifying installation..."

# Run directly via node to bypass any stale PATH cache in this session
$versionOutput = & node $distEntry --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Verification failed: $versionOutput"
    Write-Host ""
    Write-Host "  The tool was installed but cannot run." -ForegroundColor Yellow
    Write-Host "  Please open an issue at https://github.com/$Repo/issues" -ForegroundColor Yellow
    Read-Host "  Press Enter to close"
    return
}
Write-Success "intellicode --version: $versionOutput"

$intellicodePath = Get-Command $Cmd -ErrorAction SilentlyContinue
if ($intellicodePath) {
    Write-Success "intellicode found at $($intellicodePath.Source)"
} else {
    Write-Host "  (intellicode not yet in PATH for this session — open a new terminal)" -ForegroundColor DarkGray
}

# ─── Done ─────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "  ─────────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Installation complete!" -ForegroundColor Green
Write-Host "  Installed to: $InstallDir" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  NOTE: If 'intellicode' is not recognized, open a new terminal window." -ForegroundColor Yellow
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
