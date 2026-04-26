#Requires -Version 7
<#
.SYNOPSIS
  Deploy the AvoToday frontend (Vite SPA) to Linux: local npm build inside frontend/,
  tarball only dist/, SCP, timestamped release + atomic symlink swap. No PM2.

  Nginx reads /var/www/avotoday-frontend/current/dist directly (see deploy/nginx/avotoday-split.conf)
  and proxies /api/* to the backend on 127.0.0.1:4000. The backend is deployed independently by
  deploy/avotoday-backend-production.ps1.

  VITE_* values are baked at build time. Set them in `frontend/.env.production` (preferred), or
  export them in the local PowerShell session before running this script. For the same-domain
  topology, the SPA hits relative `/api/*` and `VITE_API_BASE_URL` can be left empty.

.PARAMETER ServerHost
  SSH target (IP or DNS), e.g. the host for avotoday.today-ww.net.

.EXAMPLE
  .\deploy\avotoday-frontend-production.ps1 -ServerHost "203.0.113.10" -SshUser deployer -SshKeyPath "$env:USERPROFILE\.ssh\id_ed25519"
#>
param(
  [Parameter(Mandatory = $true)]
  [string] $ServerHost,

  [string] $SshUser = "deployer",
  [int] $SshPort = 22,
  [string] $SshKeyPath = $(Join-Path $env:USERPROFILE ".ssh\id_ed25519"),
  [string] $RemoteBase = "/var/www/avotoday-frontend",
  [string] $PublicUrl = "https://avotoday.today-ww.net/",
  [int] $KeepReleases = 5,
  [switch] $SkipLocalBuild,
  [switch] $SkipPublicHealthCheck
)

$ErrorActionPreference = "Stop"
$ScriptDir = $PSScriptRoot
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir "..")).Path
$FrontendDir = Join-Path $RepoRoot "frontend"
Set-Location -LiteralPath $FrontendDir

if (-not (Test-Path -LiteralPath $SshKeyPath)) {
  throw "SSH key not found: $SshKeyPath"
}
if (-not (Test-Path -LiteralPath (Join-Path $FrontendDir "package.json"))) {
  throw "Expected $FrontendDir\package.json - frontend/ is not laid out as an independent npm project"
}

$RemoteUpload = "$RemoteBase/uploads/build.tgz"
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)

if (-not $SkipLocalBuild) {
  Write-Host "[LOCAL] frontend: npm ci" -ForegroundColor Cyan
  npm ci
  if ($LASTEXITCODE -ne 0) { throw "frontend npm ci failed" }
  Write-Host "[LOCAL] frontend: npm run build" -ForegroundColor Cyan
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "frontend npm run build failed" }
}
else {
  Write-Host "[LOCAL] SkipLocalBuild: assuming frontend/dist/ is current" -ForegroundColor Yellow
}

$distDir = Join-Path $FrontendDir "dist"
if (-not (Test-Path -LiteralPath (Join-Path $distDir "index.html"))) {
  throw "frontend/dist/index.html missing - run `npm run build` in frontend/ first"
}

$tarball = Join-Path $FrontendDir "build.tgz"
if (Test-Path -LiteralPath $tarball) { Remove-Item -LiteralPath $tarball -Force }

Write-Host "[LOCAL] packaging build.tgz (dist/ only)" -ForegroundColor Cyan
$tarArgs = @(
  "-czf", $tarball,
  "-C", $FrontendDir,
  "dist"
)
& tar @tarArgs
if ($LASTEXITCODE -ne 0) { throw "tar failed with exit $LASTEXITCODE" }

Write-Host "[LOCAL] scp -> $RemoteUpload" -ForegroundColor Cyan
$sshOpts = @(
  "-i", $SshKeyPath,
  "-p", "$SshPort",
  "-o", "StrictHostKeyChecking=accept-new",
  "-o", "ServerAliveInterval=15"
)
$scpOpts = @(
  "-i", $SshKeyPath,
  "-P", "$SshPort",
  "-o", "StrictHostKeyChecking=accept-new",
  "-o", "ServerAliveInterval=15"
)
$dest = "${SshUser}@${ServerHost}:${RemoteUpload}"
& scp @scpOpts $tarball $dest
if ($LASTEXITCODE -ne 0) { throw "scp failed with exit $LASTEXITCODE" }

$publicHealthFlag = if ($SkipPublicHealthCheck) { "0" } else { "1" }
$remoteScript = @'
#!/bin/bash
set -euo pipefail
APP_BASE="__APP_BASE__"
KEEP="__KEEP__"
PUBLIC_URL="__PUBLIC_URL__"
PUBLIC_CHECK="__PUBLIC_CHECK__"

echo "[REMOTE] Starting frontend deploy on $(hostname) at $(date -Is)"
mkdir -p "$APP_BASE/uploads" "$APP_BASE/releases"
rel="$APP_BASE/releases/$(date +%Y%m%d%H%M%S)"
mkdir -p "$rel"
tar xzf "$APP_BASE/uploads/build.tgz" -C "$rel"

if [ ! -f "$rel/dist/index.html" ]; then
  echo "[REMOTE] ERROR: extracted release missing dist/index.html" >&2
  rm -rf "$rel"
  exit 1
fi

# Atomic switch — Nginx serves /var/www/avotoday-frontend/current/dist, no reload needed.
ln -sfn "$rel" "$APP_BASE/current"

if [ "$PUBLIC_CHECK" = "1" ]; then
  sleep 1
  if curl -fsSL --max-time 10 "$PUBLIC_URL" >/dev/null; then
    echo "[REMOTE] Public health OK ($PUBLIC_URL)"
  else
    echo "[REMOTE] WARNING: public health check failed for $PUBLIC_URL (DNS/TLS/Nginx?)" >&2
  fi
fi

# Prune old releases (keep last KEEP)
cd "$APP_BASE/releases"
ls -t | tail -n +$((KEEP + 1)) | xargs -r rm -rf
echo "[REMOTE] Done $(date -Is)"
'@

$remoteScript = $remoteScript `
  -replace "__APP_BASE__", $RemoteBase `
  -replace "__KEEP__", "$KeepReleases" `
  -replace "__PUBLIC_URL__", $PublicUrl `
  -replace "__PUBLIC_CHECK__", $publicHealthFlag

$tempScript = [System.IO.Path]::GetTempFileName() + ".sh"
[System.IO.File]::WriteAllText($tempScript, ($remoteScript -replace "`r`n", "`n"), $utf8NoBom)

$remoteSh = "/tmp/deploy-avotoday-frontend.sh"
& scp @scpOpts $tempScript "${SshUser}@${ServerHost}:${remoteSh}"
if ($LASTEXITCODE -ne 0) { Remove-Item $tempScript -Force; throw "scp script failed" }
Remove-Item $tempScript -Force

Write-Host "[LOCAL] ssh remote frontend deploy" -ForegroundColor Cyan
$sshTarget = "${SshUser}@${ServerHost}"
& ssh @sshOpts $sshTarget "chmod +x $remoteSh && $remoteSh"
if ($LASTEXITCODE -ne 0) { throw "remote frontend deploy failed with exit $LASTEXITCODE" }

Remove-Item -LiteralPath $tarball -Force -ErrorAction SilentlyContinue
Write-Host "Frontend deployment completed." -ForegroundColor Green
