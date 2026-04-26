#Requires -Version 7
<#
.SYNOPSIS
  Deploy the AvoToday backend (Node Express API) to Linux: local npm build inside backend/,
  tarball, SCP, timestamped release + symlink + npm ci --omit=dev + PM2.

  Replaces the previous combined deploy/avotoday-production.ps1. The backend listens on
  127.0.0.1:4000 (loopback only). Nginx is the single public entrypoint and proxies /api/*
  to this process. The SPA is deployed separately by deploy/avotoday-frontend-production.ps1.

.PARAMETER ServerHost
  SSH target (IP or DNS), e.g. the host for avotoday.today-ww.net.

.EXAMPLE
  .\deploy\avotoday-backend-production.ps1 -ServerHost "203.0.113.10" -SshUser deployer -SshKeyPath "$env:USERPROFILE\.ssh\id_ed25519"
#>
param(
  [Parameter(Mandatory = $true)]
  [string] $ServerHost,

  [string] $SshUser = "deployer",
  [int] $SshPort = 22,
  [string] $SshKeyPath = $(Join-Path $env:USERPROFILE ".ssh\id_ed25519"),
  [string] $RemoteBase = "/var/www/avotoday-backend",
  [string] $AppName = "avotoday-backend",
  [int] $AppPort = 4000,
  [string] $BindHost = "127.0.0.1",
  [switch] $SkipLocalBuild,
  [switch] $RunMigrations
)

$ErrorActionPreference = "Stop"
$ScriptDir = $PSScriptRoot
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir "..")).Path
$BackendDir = Join-Path $RepoRoot "backend"
Set-Location -LiteralPath $BackendDir

if (-not (Test-Path -LiteralPath $SshKeyPath)) {
  throw "SSH key not found: $SshKeyPath"
}
if (-not (Test-Path -LiteralPath (Join-Path $BackendDir "package.json"))) {
  throw "Expected $BackendDir\package.json — backend/ is not laid out as an independent npm project"
}

$RemoteUpload = "$RemoteBase/uploads/build.tgz"
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)

if (-not $SkipLocalBuild) {
  Write-Host "[LOCAL] backend: npm ci" -ForegroundColor Cyan
  npm ci
  if ($LASTEXITCODE -ne 0) { throw "backend npm ci failed" }
  Write-Host "[LOCAL] backend: npm run build" -ForegroundColor Cyan
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "backend npm run build failed" }
}
else {
  Write-Host "[LOCAL] SkipLocalBuild: assuming backend/dist/ is current" -ForegroundColor Yellow
}

# PM2 ecosystem — script path is relative to $RemoteBase/current (which IS the backend root after extract).
$ecosystem = @"
module.exports = {
  apps: [{
    name: '$AppName',
    cwd: '$RemoteBase/current',
    script: 'dist/index.js',
    env: {
      NODE_ENV: 'production',
      PORT: '$AppPort',
      BIND_HOST: '$BindHost'
    }
  }]
};
"@
# .cjs because backend/package.json has "type": "module" — PM2 must load CommonJS here.
$ecoPath = Join-Path $BackendDir "ecosystem.config.cjs"
[System.IO.File]::WriteAllText($ecoPath, $ecosystem, $utf8NoBom)

$tarball = Join-Path $BackendDir "build.tgz"
if (Test-Path -LiteralPath $tarball) { Remove-Item -LiteralPath $tarball -Force }

Write-Host "[LOCAL] packaging build.tgz" -ForegroundColor Cyan
$tarArgs = @(
  "-czf", $tarball,
  "-C", $BackendDir,
  "package.json", "package-lock.json",
  "dist", "migrations",
  "ecosystem.config.cjs"
)
& tar @tarArgs
if ($LASTEXITCODE -ne 0) { throw "tar failed with exit $LASTEXITCODE" }

Remove-Item -LiteralPath $ecoPath -Force

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

$migrateFlag = if ($RunMigrations) { "1" } else { "0" }
$remoteScript = @'
#!/bin/bash
set -euo pipefail
APP_BASE="__APP_BASE__"
APP_NAME="__APP_NAME__"
APP_PORT=__APP_PORT__
BIND_HOST="__BIND_HOST__"
RUN_MIGRATE="__RUN_MIGRATE__"

echo "[REMOTE] Starting backend deploy on $(hostname) at $(date -Is)"
mkdir -p "$APP_BASE/uploads" "$APP_BASE/releases" "$APP_BASE/shared"
rel="$APP_BASE/releases/$(date +%Y%m%d%H%M%S)"
mkdir -p "$rel"
tar xzf "$APP_BASE/uploads/build.tgz" -C "$rel"

# Persist .env across releases via shared/. Never bundle .env in the tarball.
if [ ! -f "$APP_BASE/shared/.env" ] && [ -e "$APP_BASE/current/.env" ]; then
  cp "$APP_BASE/current/.env" "$APP_BASE/shared/.env"
fi
if [ ! -f "$APP_BASE/shared/.env" ]; then
  echo "[REMOTE] ERROR: missing $APP_BASE/shared/.env" >&2
  exit 1
fi
cp "$APP_BASE/shared/.env" "$rel/.env"

# Atomic switch
ln -sfn "$rel" "$APP_BASE/current"
cd "$APP_BASE/current"

export NODE_ENV=production
rm -rf node_modules
# npm ci is strict: lock files produced on Windows can omit optional OS-specific entries
# (e.g. @emnapi/*) that Linux npm then requires - fall back to npm install.
if npm ci --omit=dev --no-audit --no-fund; then
  echo "[REMOTE] npm ci OK"
else
  echo "[REMOTE] npm ci failed; falling back to npm install --omit=dev"
  rm -rf node_modules
  npm install --omit=dev --no-audit --no-fund
fi

if [ "$RUN_MIGRATE" = "1" ]; then
  echo "[REMOTE] Running migrations (node dist/db/migrate.js)"
  node dist/db/migrate.js
fi

pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
pm2 start ecosystem.config.cjs
pm2 save

sleep 3
# Health check uses the loopback bind explicitly — Nginx is the only public way in.
if curl -fsS "http://${BIND_HOST}:${APP_PORT}/api/health" >/dev/null; then
  echo "[REMOTE] Health OK (http://${BIND_HOST}:${APP_PORT}/api/health)"
else
  echo "[REMOTE] Health check failed" >&2
  pm2 logs "$APP_NAME" --lines 30 --nostream || true
  exit 1
fi

# Prune old releases (keep last 15)
cd "$APP_BASE/releases"
ls -t | tail -n +16 | xargs -r rm -rf
echo "[REMOTE] Done $(date -Is)"
'@

$remoteScript = $remoteScript `
  -replace "__APP_BASE__", $RemoteBase `
  -replace "__APP_NAME__", $AppName `
  -replace "__APP_PORT__", "$AppPort" `
  -replace "__BIND_HOST__", $BindHost `
  -replace "__RUN_MIGRATE__", $migrateFlag

$tempScript = [System.IO.Path]::GetTempFileName() + ".sh"
[System.IO.File]::WriteAllText($tempScript, ($remoteScript -replace "`r`n", "`n"), $utf8NoBom)

$remoteSh = "/tmp/deploy-$AppName.sh"
& scp @scpOpts $tempScript "${SshUser}@${ServerHost}:${remoteSh}"
if ($LASTEXITCODE -ne 0) { Remove-Item $tempScript -Force; throw "scp script failed" }
Remove-Item $tempScript -Force

Write-Host "[LOCAL] ssh remote backend deploy" -ForegroundColor Cyan
$sshTarget = "${SshUser}@${ServerHost}"
& ssh @sshOpts $sshTarget "chmod +x $remoteSh && $remoteSh"
if ($LASTEXITCODE -ne 0) { throw "remote backend deploy failed with exit $LASTEXITCODE" }

Remove-Item -LiteralPath $tarball -Force -ErrorAction SilentlyContinue
Write-Host "Backend deployment completed." -ForegroundColor Green
