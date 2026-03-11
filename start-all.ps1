param(
  [string]$BackendUrl = "http://localhost:8787"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $repoRoot "backend"
$cliDir = Join-Path $repoRoot "cli"
$backendEnv = Join-Path $backendDir ".env"

function Assert-CommandExists {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' is not installed or not in PATH."
  }
}

Write-Host "== Snoop Bootstrap ==" -ForegroundColor Cyan

Assert-CommandExists "node"
Assert-CommandExists "npm"

if (-not (Test-Path $backendEnv)) {
  Write-Warning "backend/.env is missing. Create it from backend/.env.example before running in production."
  Write-Host "Continuing anyway (fallback behavior will apply if API keys are missing)." -ForegroundColor Yellow
}

Write-Host "\n[1/4] Installing backend dependencies..." -ForegroundColor Green
Push-Location $backendDir
npm install
Pop-Location

Write-Host "\n[2/4] Starting backend dev server in a new PowerShell window..." -ForegroundColor Green
$backendCommand = "Set-Location '$backendDir'; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCommand | Out-Null

Write-Host "\n[3/4] Installing and building CLI..." -ForegroundColor Green
Push-Location $cliDir
npm install
npm run build

Write-Host "\n[4/4] Linking CLI globally..." -ForegroundColor Green
npm link
Pop-Location

$env:SNOOP_API_URL = $BackendUrl

Write-Host "\nDone. Backend is running in a separate window." -ForegroundColor Cyan
Write-Host "API URL for this shell: $BackendUrl" -ForegroundColor Cyan
Write-Host "Try: snoop axios" -ForegroundColor White
Write-Host "Try: snoop pandas --ecosystem pip" -ForegroundColor White
