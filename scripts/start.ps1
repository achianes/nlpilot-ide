<#
.SYNOPSIS
  Launch nlpilot-ide and verify a (remote) Ollama endpoint first.

.DESCRIPTION
  - Checks the Ollama server is reachable and the requested model is installed.
  - Sets the env vars nlpilot reads (NLPILOT_OLLAMA_URL, NLPILOT_MODEL) plus
    NLPILOT_IDE_ROOT (the folder the IDE file tree opens on).
  - Builds the frontend if web/dist is missing (or with -Build).
  - Starts either the browser server (default) or the pywebview desktop app.

.EXAMPLE
  # Remote Ollama on another machine, browser mode
  .\scripts\start.ps1 -OllamaUrl http://192.168.1.50:11434 -Model devstral:latest

.EXAMPLE
  # Desktop window, force a rebuild, open the nlpilot repo as the project
  .\scripts\start.ps1 -OllamaUrl http://gpu-box:11434 -Desktop -Build -Root D:\Programs\nlpilot
#>

param(
  [string]$OllamaUrl      = "http://172.24.172.155:11434",
  [string]$Model          = "qwen3-coder:30b",   # generation (model_for_instructions)
  [string]$ResponsesModel = "qwen3-coder:30b",   # verify / self-correction (model_for_responses)
  [string]$VisionModel    = "qwen3-vl:30b",      # @vision backend
  [string]$Root,                     # IDE project root; default = repo root
  [int]$Port         = 8760,
  [switch]$Desktop,                  # open the pywebview window instead of browser mode
  [switch]$Build,                    # force a frontend rebuild
  [switch]$SkipOllamaCheck           # start even if Ollama is unreachable
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not $Root) { $Root = $RepoRoot }

function Info($m) { Write-Host "[nlpilot-ide] $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "[ ok ] $m"       -ForegroundColor Green }
function Warn($m) { Write-Host "[warn] $m"       -ForegroundColor Yellow }
function Die($m)  { Write-Host "[fail] $m"       -ForegroundColor Red; exit 1 }

# ---------------------------------------------------------------------------
# 1. Verify Ollama
# ---------------------------------------------------------------------------
if (-not $SkipOllamaCheck) {
  $tagsUrl = "$($OllamaUrl.TrimEnd('/'))/api/tags"
  Info "Checking Ollama at $OllamaUrl ..."
  try {
    $resp = Invoke-RestMethod -Uri $tagsUrl -Method Get -TimeoutSec 8
  } catch {
    Die "Ollama not reachable at $tagsUrl : $($_.Exception.Message)`n       Is it running? For remote access it must bind 0.0.0.0 (OLLAMA_HOST=0.0.0.0) and the port must be open."
  }
  $models = @($resp.models | ForEach-Object { $_.name })
  Ok "Ollama reachable - $($models.Count) model(s)."
  if ($models -contains $Model) {
    Ok "Model '$Model' is installed."
  } else {
    Warn "Model '$Model' NOT found on the server."
    Write-Host "       Available: $($models -join ', ')" -ForegroundColor DarkGray
    Write-Host "       Pull it with:  ollama pull $Model   (on the Ollama host)" -ForegroundColor DarkGray
    $ans = Read-Host "       Continue anyway? (y/N)"
    if ($ans -notmatch '^(y|yes)$') { Die "Aborted - pick an installed model with -Model." }
  }
} else {
  Warn "Skipping Ollama check (-SkipOllamaCheck)."
}

# ---------------------------------------------------------------------------
# 2. Environment + config for nlpilot and the IDE
# ---------------------------------------------------------------------------
# Write a config.json so ALL model slots are set (model_for_responses has no env
# override). NLPILOT_CONFIG points nlpilot at it; env vars still layer on top.
$cfgPath = Join-Path $env:TEMP "nlpilot-ide.config.json"
$cfg = [ordered]@{
  ollama_url            = $OllamaUrl
  model_for_instructions = $Model
  model_for_responses   = $ResponsesModel
  vision_model          = $VisionModel
}
# Write UTF-8 WITHOUT BOM — Python's json.load rejects a BOM (utf-8-sig needed).
[System.IO.File]::WriteAllText($cfgPath, ($cfg | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false)))

$env:NLPILOT_CONFIG     = $cfgPath
$env:NLPILOT_OLLAMA_URL = $OllamaUrl
$env:NLPILOT_MODEL      = $Model
$env:NLPILOT_VISION_MODEL = $VisionModel
$env:NLPILOT_IDE_ROOT   = $Root
Info "Ollama URL         = $OllamaUrl"
Info "model (generate)   = $Model"
Info "model (responses)  = $ResponsesModel"
Info "vision model       = $VisionModel"
Info "config written     = $cfgPath"
Info "IDE root           = $Root"

# ---------------------------------------------------------------------------
# 3. Build the frontend if needed
# ---------------------------------------------------------------------------
$dist = Join-Path $RepoRoot "web\dist\index.html"
if ($Build -or -not (Test-Path $dist)) {
  Info "Building frontend (web/) ..."
  Push-Location (Join-Path $RepoRoot "web")
  try {
    if (-not (Test-Path "node_modules")) { npm install }
    npm run build
    if ($LASTEXITCODE -ne 0) { Die "Frontend build failed." }
  } finally { Pop-Location }
  Ok "Frontend built."
} else {
  Ok "Frontend already built (web/dist). Use -Build to rebuild."
}

# ---------------------------------------------------------------------------
# 4. Launch
# ---------------------------------------------------------------------------
Push-Location $RepoRoot
try {
  if ($Desktop) {
    Info "Launching desktop app (pywebview) ..."
    python -m nlpilot_ide.desktop.main
  } else {
    $url = "http://127.0.0.1:$Port"
    Ok "Starting server - open $url in your browser (Ctrl+C to stop)."
    python -m uvicorn nlpilot_ide.server.app:app --host 127.0.0.1 --port $Port
  }
} finally { Pop-Location }
