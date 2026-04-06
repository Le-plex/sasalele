# ─────────────────────────────────────────────────────────────────
#  Sasalele — Script d'installation Windows
#  Usage : clic-droit → "Exécuter avec PowerShell"
#          ou dans PowerShell : .\install.ps1
#  Prérequis : Windows 10+, Node.js 18+ installé
# ─────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"

function info  { param($msg) Write-Host "[OK] $msg" -ForegroundColor Green }
function warn  { param($msg) Write-Host " [!] $msg" -ForegroundColor Yellow }
function fatal { param($msg) Write-Host "[ERR] $msg" -ForegroundColor Red; Read-Host "Appuyez sur Entrée pour quitter"; exit 1 }

Write-Host ""
Write-Host "  +----------------------------------+"
Write-Host "  |   Sasalele -- Installation       |"
Write-Host "  +----------------------------------+"
Write-Host ""

$InstallDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# ── 1. Node.js ────────────────────────────────────────────────────
try {
  $nodeVer = node -v 2>&1
  if ($LASTEXITCODE -ne 0) { throw }
  info "Node.js $nodeVer"
} catch {
  Write-Host ""
  warn "Node.js est introuvable."
  Write-Host "  Téléchargez et installez Node.js LTS depuis https://nodejs.org"
  Write-Host "  puis relancez ce script."
  Write-Host ""
  fatal "Node.js manquant"
}

# ── 2. Dépendances npm ────────────────────────────────────────────
info "Installation des dépendances npm..."
Set-Location $InstallDir
npm install --silent
if ($LASTEXITCODE -ne 0) { fatal "npm install a échoué" }
info "Dépendances installées"

# ── 3. Dossier data ───────────────────────────────────────────────
$dataDir = Join-Path $InstallDir "data\uploads"
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
info "Dossier data\uploads créé"

function Init-Json {
  param($name, $default)
  $file = Join-Path $InstallDir "data\$name"
  if (-not (Test-Path $file)) {
    $default | Out-File -FilePath $file -Encoding utf8 -NoNewline
    info "Créé : data\$name"
  } else {
    warn "Existant (conservé) : data\$name"
  }
}

Init-Json "data.json"    "null"
Init-Json "users.json"   "[]"
Init-Json "invites.json" "[]"
Init-Json "roles.json"   "[]"
Init-Json "logs.json"    "[]"

# ── 4. Raccourci de lancement ─────────────────────────────────────
$startScript = Join-Path $InstallDir "start.bat"
if (-not (Test-Path $startScript)) {
  @"
@echo off
cd /d "%~dp0"
echo Sasalele demarre sur http://localhost:3000
echo Fermez cette fenetre pour arreter l'application.
echo.
npx vite --port 3000 --host 127.0.0.1
pause
"@ | Out-File -FilePath $startScript -Encoding ascii
  info "Raccourci créé : start.bat"
} else {
  warn "start.bat déjà présent (non modifié)"
}

# ── 5. Résumé ─────────────────────────────────────────────────────
Write-Host ""
Write-Host "  +------------------------------------------+"
Write-Host "  |      Installation terminée !             |"
Write-Host "  +------------------------------------------+"
Write-Host ""
Write-Host "  Pour lancer Sasalele :"
Write-Host "    Double-cliquez sur start.bat"
Write-Host "    ou dans PowerShell : npm run dev"
Write-Host ""
Write-Host "  Accès : http://localhost:3000"
Write-Host ""
Write-Host "  Au premier accès, une page de configuration"
Write-Host "  vous guidera pour créer le compte admin."
Write-Host ""
Write-Host "  Note : sur Windows, le redémarrage automatique"
Write-Host "  après mise à jour n'est pas disponible."
Write-Host "  Relancez start.bat manuellement si besoin."
Write-Host ""

# Proposer de démarrer maintenant
$launch = Read-Host "Lancer Sasalele maintenant ? (O/n)"
if ($launch -ne 'n' -and $launch -ne 'N') {
  info "Démarrage..."
  Start-Process "cmd.exe" -ArgumentList "/c `"$startScript`""
}
