#Requires -Version 7
<#
.SYNOPSIS
  Roll back the AvoToday frontend: symlink current -> releases/<ReleaseTimestamp>.
  No PM2, no Nginx reload — Nginx already reads $APP_BASE/current/dist on every request.

.PARAMETER ReleaseTimestamp
  Directory name under releases/, e.g. 20260425103000 (from `ls -lt /var/www/avotoday-frontend/releases/`).
#>
param(
  [Parameter(Mandatory = $true)]
  [string] $ReleaseTimestamp,

  [Parameter(Mandatory = $true)]
  [string] $ServerHost,

  [string] $SshUser = "deployer",
  [int] $SshPort = 22,
  [string] $SshKeyPath = $(Join-Path $env:USERPROFILE ".ssh\id_ed25519"),
  [string] $RemoteBase = "/var/www/avotoday-frontend",
  [string] $PublicUrl = "https://avotoday.today-ww.net/",
  [switch] $SkipPublicHealthCheck
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $SshKeyPath)) {
  throw "SSH key not found: $SshKeyPath"
}

$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$publicHealthFlag = if ($SkipPublicHealthCheck) { "0" } else { "1" }

$remoteScript = @'
#!/bin/bash
set -euo pipefail
APP_BASE="__APP_BASE__"
TS="__TS__"
PUBLIC_URL="__PUBLIC_URL__"
PUBLIC_CHECK="__PUBLIC_CHECK__"

REL="$APP_BASE/releases/$TS"
if [ ! -d "$REL/dist" ]; then
  echo "[REMOTE] ERROR: release/dist not found: $REL/dist" >&2
  exit 1
fi
ln -sfn "$REL" "$APP_BASE/current"

if [ "$PUBLIC_CHECK" = "1" ]; then
  sleep 1
  if curl -fsSL --max-time 10 "$PUBLIC_URL" >/dev/null; then
    echo "[REMOTE] Frontend rollback OK -> $TS ($(date -Is)) [public OK]"
  else
    echo "[REMOTE] Frontend rollback OK -> $TS ($(date -Is)) [public WARN]"
  fi
else
  echo "[REMOTE] Frontend rollback OK -> $TS ($(date -Is))"
fi
'@

$remoteScript = $remoteScript `
  -replace "__APP_BASE__", $RemoteBase `
  -replace "__TS__", $ReleaseTimestamp `
  -replace "__PUBLIC_URL__", $PublicUrl `
  -replace "__PUBLIC_CHECK__", $publicHealthFlag

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
$remoteSh = "/tmp/rollback-avotoday-frontend.sh"

& scp @scpOpts $tempScript "${sshTarget}:${remoteSh}"
if ($LASTEXITCODE -ne 0) { Remove-Item $tempScript -Force; throw "scp rollback script failed" }
Remove-Item $tempScript -Force

Write-Host "[LOCAL] ssh frontend rollback to $ReleaseTimestamp" -ForegroundColor Cyan
& ssh @sshOpts $sshTarget "chmod +x $remoteSh && $remoteSh"
if ($LASTEXITCODE -ne 0) { throw "frontend rollback failed with exit $LASTEXITCODE" }

Write-Host "Frontend rollback completed." -ForegroundColor Green
