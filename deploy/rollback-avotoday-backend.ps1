#Requires -Version 7
<#
.SYNOPSIS
  Roll back the AvoToday backend: symlink current -> releases/<ReleaseTimestamp>, restart PM2,
  health check on the loopback bind.

.PARAMETER ReleaseTimestamp
  Directory name under releases/, e.g. 20260425103000 (from `ls -lt /var/www/avotoday-backend/releases/`).
#>
param(
  [Parameter(Mandatory = $true)]
  [string] $ReleaseTimestamp,

  [Parameter(Mandatory = $true)]
  [string] $ServerHost,

  [string] $SshUser = "deployer",
  [int] $SshPort = 22,
  [string] $SshKeyPath = $(Join-Path $env:USERPROFILE ".ssh\id_ed25519"),
  [string] $RemoteBase = "/var/www/avotoday-backend",
  [string] $AppName = "avotoday-backend",
  [int] $AppPort = 4000,
  [string] $BindHost = "127.0.0.1"
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $SshKeyPath)) {
  throw "SSH key not found: $SshKeyPath"
}

$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$remoteScript = @'
#!/bin/bash
set -euo pipefail
APP_BASE="__APP_BASE__"
APP_NAME="__APP_NAME__"
APP_PORT=__APP_PORT__
BIND_HOST="__BIND_HOST__"
TS="__TS__"
REL="$APP_BASE/releases/$TS"
if [ ! -d "$REL" ]; then
  echo "[REMOTE] ERROR: release not found: $REL" >&2
  exit 1
fi
ln -sfn "$REL" "$APP_BASE/current"
cd "$APP_BASE/current"
pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
pm2 start ecosystem.config.cjs
pm2 save
sleep 3
curl -fsS "http://${BIND_HOST}:${APP_PORT}/api/health" >/dev/null
echo "[REMOTE] Backend rollback OK -> $TS ($(date -Is))"
'@

$remoteScript = $remoteScript `
  -replace "__APP_BASE__", $RemoteBase `
  -replace "__APP_NAME__", $AppName `
  -replace "__APP_PORT__", "$AppPort" `
  -replace "__BIND_HOST__", $BindHost `
  -replace "__TS__", $ReleaseTimestamp

$tempScript = [System.IO.Path]::GetTempFileName() + ".sh"
[System.IO.File]::WriteAllText($tempScript, ($remoteScript -replace "`r`n", "`n"), $utf8NoBom)

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
$sshTarget = "${SshUser}@${ServerHost}"
$remoteSh = "/tmp/rollback-$AppName.sh"

& scp @scpOpts $tempScript "${sshTarget}:${remoteSh}"
if ($LASTEXITCODE -ne 0) { Remove-Item $tempScript -Force; throw "scp rollback script failed" }
Remove-Item $tempScript -Force

Write-Host "[LOCAL] ssh backend rollback to $ReleaseTimestamp" -ForegroundColor Cyan
& ssh @sshOpts $sshTarget "chmod +x $remoteSh && $remoteSh"
if ($LASTEXITCODE -ne 0) { throw "backend rollback failed with exit $LASTEXITCODE" }

Write-Host "Backend rollback completed." -ForegroundColor Green
