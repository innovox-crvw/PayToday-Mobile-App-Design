#Requires -Version 7
<#
.SYNOPSIS
  One-off database bootstrap for the avotoday-backend release tree:
    1. Re-build the substituted full-setup SQL (paytoday -> paytoday_store)
    2. scp it to the VM together with a remote runner
    3. SSH and run the runner: install sqlcmd, bootstrap schema, run migrations, scrub demo login, verify

  Requires the split deploy layout (post-cutover): backend release tree at /var/www/avotoday-backend.
  shared/.env must already exist on the VM (deploy/env.avotoday.backend.production.template).

.PARAMETER ServerHost
  SSH target. Default: avotoday.today-ww.net

.PARAMETER SshUser
  SSH user. Default: deployer

.PARAMETER SshKeyPath
  Optional SSH private key. If absent or unsupported, ssh will fall back to password auth.

.PARAMETER InstallSqlcmd
  Pass to also install mssql-tools18 on the VM (needs sudo). Skip after the first run.

.PARAMETER SkipBootstrap
  Skip the destructive paytoday-full-setup.sql step. Use when the schema already exists and you
  only want to sync local migrations and re-run migrate / scrub / verify.

.PARAMETER SyncMigrations
  Copy backend/migrations/*.sql from this checkout to the VM's current release before running
  migrate.js. Useful when you've patched a migration locally and want to retry without redeploying.

.EXAMPLE
  # First-ever bootstrap (installs sqlcmd, runs full bootstrap then migrations):
  .\deploy\avotoday-db-bootstrap.ps1 -InstallSqlcmd

  # After a partial failure, re-sync local migrations and re-run without bootstrap:
  .\deploy\avotoday-db-bootstrap.ps1 -SkipBootstrap -SyncMigrations
#>
param(
  [string] $ServerHost = "avotoday.today-ww.net",
  [string] $SshUser    = "deployer",
  [int]    $SshPort    = 22,
  [string] $SshKeyPath = $(Join-Path $env:USERPROFILE ".ssh\id_ed25519"),
  [string] $UbuntuVer  = "24.04",
  [switch] $InstallSqlcmd,
  [switch] $SkipBootstrap,
  [switch] $SyncMigrations
)

$ErrorActionPreference = "Stop"
$ScriptDir = $PSScriptRoot
$RepoRoot  = (Resolve-Path (Join-Path $ScriptDir "..")).Path
Set-Location -LiteralPath $RepoRoot

$utf8NoBom = [System.Text.UTF8Encoding]::new($false)

# 1) Substitute the DB name into a temp SQL file
Write-Host "[LOCAL] Building paytoday_store bootstrap SQL" -ForegroundColor Cyan
$src  = Get-Content (Join-Path $RepoRoot "backend\scripts\paytoday-full-setup.sql") -Raw
$prod = $src `
  -replace "IF DB_ID\(N'paytoday'\)",        "IF DB_ID(N'paytoday_store')" `
  -replace "CREATE DATABASE \[paytoday\];",  "CREATE DATABASE [paytoday_store];" `
  -replace "USE \[paytoday\];",              "USE [paytoday_store];"
$bootSql = Join-Path $env:TEMP "avotoday-bootstrap.sql"
[IO.File]::WriteAllText($bootSql, $prod, $utf8NoBom)

# Sanity check: exactly 3 DB-name swaps; column-name occurrences untouched
$swapMatches = ([regex]::Matches($prod, "(?:DB_ID\(N'paytoday_store'\)|CREATE DATABASE \[paytoday_store\]|USE \[paytoday_store\])"))
if ($swapMatches.Count -ne 3) { throw "Expected 3 DB-name swaps in bootstrap SQL, found $($swapMatches.Count)" }
$badResidual = ([regex]::Matches($prod, "DB_ID\(N'paytoday'\)|CREATE DATABASE \[paytoday\];|USE \[paytoday\];"))
if ($badResidual.Count -gt 0) { throw "Unswapped DB-name occurrences remain: $($badResidual.Count)" }

# 2) Build the remote runner script (bash, idempotent). Reads SQL_CONNECTION_STRING from /var/www/avotoday-backend/shared/.env.
$installFlag        = if ($InstallSqlcmd)   { "1" } else { "0" }
$skipBootstrapFlag  = if ($SkipBootstrap)   { "1" } else { "0" }
$syncMigrationsFlag = if ($SyncMigrations)  { "1" } else { "0" }
$remote = @'
#!/bin/bash
set -euo pipefail
INSTALL_SQLCMD="__INSTALL__"
UBUNTU_VER="__UBUNTU__"
SKIP_BOOTSTRAP="__SKIP_BOOTSTRAP__"
SYNC_MIGRATIONS="__SYNC_MIGRATIONS__"
ENV_FILE="/var/www/avotoday-backend/shared/.env"
APP_CURRENT="/var/www/avotoday-backend/current"
BOOT_SQL="/tmp/avotoday-bootstrap.sql"
MIG_INCOMING="/tmp/avotoday-migrations"

echo "[REMOTE] $(date -Is) starting DB bootstrap on $(hostname) (skip_bootstrap=$SKIP_BOOTSTRAP sync_migrations=$SYNC_MIGRATIONS)"

if [ ! -f "$ENV_FILE" ]; then
  echo "[REMOTE] ERROR: $ENV_FILE missing" >&2; exit 1
fi
if [ "$SKIP_BOOTSTRAP" != "1" ] && [ ! -f "$BOOT_SQL" ]; then
  echo "[REMOTE] ERROR: $BOOT_SQL missing (scp it first)" >&2; exit 1
fi

# Parse SQL_CONNECTION_STRING from the shared env file (single line, no quotes assumed).
CONN_STR="$(grep -E '^SQL_CONNECTION_STRING=' "$ENV_FILE" | head -n1 | sed -E 's/^SQL_CONNECTION_STRING=//; s/^"(.*)"$/\1/; s/^'\''(.*)'\''$/\1/')"
if [ -z "$CONN_STR" ]; then
  echo "[REMOTE] ERROR: SQL_CONNECTION_STRING not found in $ENV_FILE" >&2; exit 1
fi
get_kv() { echo "$CONN_STR" | tr ';' '\n' | awk -F= -v k="$1" 'BEGIN{IGNORECASE=1} tolower($1)==tolower(k){sub(/^[^=]*=/,""); print; exit}'; }
SRV="$(get_kv Server)"
USR="$(get_kv 'User Id')"; if [ -z "$USR" ]; then USR="$(get_kv UID)"; fi
PWD_VAL="$(get_kv Password)"; if [ -z "$PWD_VAL" ]; then PWD_VAL="$(get_kv PWD)"; fi
DBN="$(get_kv Database)"; if [ -z "$DBN" ]; then DBN="paytoday_store"; fi

if [ -z "$SRV" ] || [ -z "$USR" ] || [ -z "$PWD_VAL" ]; then
  echo "[REMOTE] ERROR: SQL_CONNECTION_STRING is missing Server/User Id/Password" >&2; exit 1
fi
echo "[REMOTE] target  : $SRV  db=$DBN  user=$USR"

# 3) Install sqlcmd if requested
if [ "$INSTALL_SQLCMD" = "1" ] && ! command -v sqlcmd >/dev/null 2>&1 && ! [ -x /opt/mssql-tools18/bin/sqlcmd ]; then
  echo "[REMOTE] Installing mssql-tools18 (Ubuntu $UBUNTU_VER)"
  cd /tmp
  curl -fsSL -o packages-microsoft-prod.deb \
    "https://packages.microsoft.com/config/ubuntu/${UBUNTU_VER}/packages-microsoft-prod.deb"
  sudo dpkg -i packages-microsoft-prod.deb
  rm -f packages-microsoft-prod.deb
  sudo apt-get update -y
  sudo ACCEPT_EULA=Y apt-get install -y mssql-tools18 unixodbc-dev
  if ! grep -q 'mssql-tools18' "$HOME/.bashrc"; then
    echo 'export PATH="$PATH:/opt/mssql-tools18/bin"' >> "$HOME/.bashrc"
  fi
fi

export PATH="$PATH:/opt/mssql-tools18/bin"
if ! command -v sqlcmd >/dev/null 2>&1; then
  echo "[REMOTE] ERROR: sqlcmd not on PATH. Re-run with -InstallSqlcmd." >&2; exit 1
fi

SQLCMD_BASE=(sqlcmd -S "$SRV" -U "$USR" -P "$PWD_VAL" -C -b -I -l 30)

# 4) Bootstrap the schema (connect to master because the SQL itself does USE [paytoday_store])
if [ "$SKIP_BOOTSTRAP" = "1" ]; then
  echo "[REMOTE] Skipping bootstrap SQL (-SkipBootstrap)"
else
  echo "[REMOTE] Running bootstrap SQL against master (script will USE [$DBN] internally)"
  "${SQLCMD_BASE[@]}" -d master -i "$BOOT_SQL"
fi

# 4b) Optionally sync incoming migrations onto the current release
if [ "$SYNC_MIGRATIONS" = "1" ]; then
  if [ -d "$MIG_INCOMING" ]; then
    echo "[REMOTE] Syncing $(ls -1 "$MIG_INCOMING" | wc -l) migration file(s) into $APP_CURRENT/migrations/"
    install -d "$APP_CURRENT/migrations"
    cp -f "$MIG_INCOMING"/*.sql "$APP_CURRENT/migrations/"
  else
    echo "[REMOTE] WARN: -SyncMigrations set but $MIG_INCOMING not found; skipping" >&2
  fi
fi

# 5) Apply migrations (idempotent guards inside each .sql)
echo "[REMOTE] Running compiled migrations: node dist/db/migrate.js"
cd "$APP_CURRENT"
node dist/db/migrate.js

# 6) Scrub the seed demo login
echo "[REMOTE] Scrubbing demo@paytoday.local"
"${SQLCMD_BASE[@]}" -d "$DBN" -Q "
SET NOCOUNT ON;
DECLARE @uid UNIQUEIDENTIFIER = (SELECT id FROM dbo.users WHERE email = N'demo@paytoday.local');
IF @uid IS NOT NULL
BEGIN
  IF OBJECT_ID(N'dbo.user_notifications',  N'U') IS NOT NULL DELETE FROM dbo.user_notifications    WHERE user_id = @uid;
  IF OBJECT_ID(N'dbo.user_refresh_tokens', N'U') IS NOT NULL DELETE FROM dbo.user_refresh_tokens   WHERE user_id = @uid;
  IF OBJECT_ID(N'dbo.password_reset_tokens',N'U') IS NOT NULL DELETE FROM dbo.password_reset_tokens WHERE user_id = @uid;
  IF OBJECT_ID(N'dbo.addresses',           N'U') IS NOT NULL DELETE FROM dbo.addresses             WHERE user_id = @uid;
  DELETE FROM dbo.users WHERE id = @uid;
  PRINT N'Demo user removed.';
END
ELSE PRINT N'No demo user present.';
"

# 7) Verify
echo "[REMOTE] Verification:"
"${SQLCMD_BASE[@]}" -d "$DBN" -h -1 -W -Q "
SELECT TOP 5 version + N' @ ' + CONVERT(NVARCHAR(40), applied_at, 126) AS recent FROM dbo.schema_migrations ORDER BY applied_at DESC;
SELECT N'user_count='    + CAST(COUNT(*) AS NVARCHAR(20)) FROM dbo.users;
SELECT N'product_count=' + CAST(COUNT(*) AS NVARCHAR(20)) FROM dbo.products;
"
echo "[REMOTE] /api/health =>"
curl -fsS "http://127.0.0.1:4000/api/health" || echo "(local health check failed - inspect pm2 logs)"
echo
echo "[REMOTE] $(date -Is) DB bootstrap complete."
'@

$remote = $remote `
  -replace "__INSTALL__",         $installFlag `
  -replace "__UBUNTU__",          $UbuntuVer `
  -replace "__SKIP_BOOTSTRAP__",  $skipBootstrapFlag `
  -replace "__SYNC_MIGRATIONS__", $syncMigrationsFlag

$tempRunner = [System.IO.Path]::GetTempFileName() + ".sh"
[IO.File]::WriteAllText($tempRunner, ($remote -replace "`r`n", "`n"), $utf8NoBom)

# 3) Push files to the VM
$sshOpts = @("-o","StrictHostKeyChecking=accept-new","-o","ServerAliveInterval=15","-p","$SshPort")
$scpOpts = @("-o","StrictHostKeyChecking=accept-new","-o","ServerAliveInterval=15","-P","$SshPort")
if (Test-Path -LiteralPath $SshKeyPath) {
  $sshOpts = @("-i",$SshKeyPath) + $sshOpts
  $scpOpts = @("-i",$SshKeyPath) + $scpOpts
}

$sshTarget = "${SshUser}@${ServerHost}"
$remoteRunner = "/tmp/avotoday-db-bootstrap.sh"

if (-not $SkipBootstrap) {
  Write-Host "[LOCAL] scp bootstrap.sql to $sshTarget" -ForegroundColor Cyan
  & scp @scpOpts $bootSql "${sshTarget}:/tmp/avotoday-bootstrap.sql"
  if ($LASTEXITCODE -ne 0) { Remove-Item $tempRunner -Force -EA SilentlyContinue; throw "scp bootstrap.sql failed ($LASTEXITCODE)" }
} else {
  Write-Host "[LOCAL] -SkipBootstrap: not transferring bootstrap.sql" -ForegroundColor Yellow
}

if ($SyncMigrations) {
  $migDir = Join-Path $RepoRoot "backend\migrations"
  if (-not (Test-Path -LiteralPath $migDir)) { Remove-Item $tempRunner -Force -EA SilentlyContinue; throw "Local migrations dir missing: $migDir" }
  Write-Host "[LOCAL] Preparing /tmp/avotoday-migrations on remote" -ForegroundColor Cyan
  & ssh @sshOpts $sshTarget "rm -rf /tmp/avotoday-migrations && mkdir -p /tmp/avotoday-migrations"
  if ($LASTEXITCODE -ne 0) { Remove-Item $tempRunner -Force -EA SilentlyContinue; throw "remote mkdir for migrations failed ($LASTEXITCODE)" }

  $migFiles = Get-ChildItem -LiteralPath $migDir -Filter *.sql -File | Sort-Object Name
  Write-Host "[LOCAL] scp $($migFiles.Count) migration file(s)" -ForegroundColor Cyan
  $migPaths = $migFiles | ForEach-Object { $_.FullName }
  & scp @scpOpts @migPaths "${sshTarget}:/tmp/avotoday-migrations/"
  if ($LASTEXITCODE -ne 0) { Remove-Item $tempRunner -Force -EA SilentlyContinue; throw "scp migrations failed ($LASTEXITCODE)" }
}

Write-Host "[LOCAL] scp runner to $sshTarget" -ForegroundColor Cyan
& scp @scpOpts $tempRunner "${sshTarget}:${remoteRunner}"
if ($LASTEXITCODE -ne 0) { Remove-Item $tempRunner -Force -EA SilentlyContinue; throw "scp runner failed ($LASTEXITCODE)" }
Remove-Item $tempRunner -Force -EA SilentlyContinue

# 4) Run remotely. -tt forces TTY allocation so sudo (apt install) can prompt for the password.
Write-Host "[LOCAL] ssh -> running remote bootstrap" -ForegroundColor Cyan
& ssh -tt @sshOpts $sshTarget "chmod +x $remoteRunner && $remoteRunner"
if ($LASTEXITCODE -ne 0) { throw "remote bootstrap failed ($LASTEXITCODE)" }

Write-Host "Database bootstrap complete." -ForegroundColor Green
