# PowerShell-Driven Linux Deployment Pattern

A reusable blueprint for deploying Node.js apps from a Windows dev machine to an Ubuntu server using PowerShell + SSH + PM2, with **timestamped releases**, **symlink-based activation**, **shared `.env` persistence**, and **health checks**. Based on the NedAccess `backend/deploy-staging.ps1`, `backend/deploy-production.ps1` and `frontend/deploy-staging.ps1` scripts.

---

## 1. High-Level Flow

```
┌─────────────────────┐   1. build       ┌─────────────────────┐
│  Windows Dev (you)  │ ───────────────▶ │  yarn install/build │
└─────────┬───────────┘                  └─────────────────────┘
          │ 2. package (tar.gz)
          ▼
┌─────────────────────┐   3. scp         ┌─────────────────────┐
│  build.tgz          │ ───────────────▶ │  /uploads/build.tgz │
└─────────────────────┘                  └─────────┬───────────┘
                                                   │ 4. ssh + run remote script
                                                   ▼
                                         ┌─────────────────────┐
                                         │ /releases/<ts>/...  │
                                         │   ↑ current symlink │
                                         │ pm2 restart + check │
                                         └─────────────────────┘
```

The PowerShell script does **everything**:
1. Builds locally (so the server doesn't need a compiler toolchain).
2. Generates a clean `ecosystem.config.js` and `.yarnrc.yml` (UTF-8 **without BOM**).
3. Tars only the runtime artifacts.
4. SCPs the tarball.
5. Writes a remote bash script to a temp file, SCPs it to `/tmp`, and runs it via SSH.
6. Remote script extracts to a timestamped release dir, swaps the `current` symlink, installs deps, restarts PM2, and runs a health check.

---

## 2. Server Layout (the convention that makes everything work)

```
/var/www/<app>-<env>/
├── uploads/           # latest build.tgz lands here (transient)
├── shared/
│   └── .env           # persists across releases (NEVER overwritten)
├── releases/
│   ├── 20260101120000/
│   ├── 20260102093000/
│   └── 20260103140500/  ← current symlink points here
└── current → releases/20260103140500
```

Why this matters:
- **Atomic switch**: the symlink swap is instant; PM2 picks up the new path.
- **Easy rollback**: `ln -sfn releases/<previous_ts> current && pm2 restart <app>`.
- **Disk hygiene**: prune to last N releases (we keep 15).
- **Secrets safety**: `.env` lives in `shared/` and is copied into each release; you never re-upload secrets.

---

## 3. One-Time Server Setup

```bash
# As root, create deployer user
adduser deployer
usermod -aG sudo deployer

# SSH key auth only
mkdir -p /home/deployer/.ssh
# paste your id_ed25519.pub into authorized_keys
chown -R deployer:deployer /home/deployer/.ssh
chmod 700 /home/deployer/.ssh
chmod 600 /home/deployer/.ssh/authorized_keys

# Disable password auth in /etc/ssh/sshd_config:
#   PasswordAuthentication no
systemctl restart ssh

# As deployer:
# Node.js (use NodeSource or nvm)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Yarn via Corepack
corepack enable
corepack prepare yarn@4.10.3 --activate

# PM2
sudo npm i -g pm2
pm2 startup systemd        # follow the printed command
pm2 save

# Pre-create app dirs (owned by deployer)
sudo mkdir -p /var/www/<app>-<env>/{uploads,releases,shared}
sudo chown -R deployer:deployer /var/www/<app>-<env>

# Seed shared/.env once (manually, with sftp or vi)
vi /var/www/<app>-<env>/shared/.env
chmod 600 /var/www/<app>-<env>/shared/.env
```

---

## 4. PowerShell Script Template

Save as `<project>/deploy-<env>.ps1`. The four key ideas:

1. **`$PSScriptRoot` lock** so paths are stable.
2. **Build locally** with the exact same Yarn version as CI/server.
3. **Generate config files with `[System.IO.File]::WriteAllText` + `UTF8Encoding($false)`** — `Out-File -Encoding UTF8` adds a BOM that breaks Yarn/Node/bash parsers.
4. **Inline the remote bash script as a here-string**, convert CRLF→LF, ship it as a temp file, and execute.

```powershell
# --- config ---
$ServerIP    = "10.0.0.1"
$SshUser     = "deployer"
$SshPort     = 22
$SshKeyPath  = "$HOME\.ssh\id_ed25519"

$AppName      = "myapp-staging"
$RemoteBase   = "/var/www/$AppName"
$RemoteUpload = "$RemoteBase/uploads/build.tgz"
$AppPort      = 4001

$ScriptDir = $PSScriptRoot
Set-Location $ScriptDir

# --- 1. build ---
corepack enable | Out-Null
corepack prepare yarn@4.10.3 --activate | Out-Null
yarn install
yarn build

# --- 2. package ---
if (Test-Path "$ScriptDir\build.tgz") { Remove-Item "$ScriptDir\build.tgz" -Force }

# Generate ecosystem.config.js (UTF-8, no BOM!)
$ecosystem = @"
module.exports = {
  apps: [{
    name: '$AppName',
    cwd: '$RemoteBase/current',
    script: 'node dist/server.js',
    env: {
      NODE_ENV: 'production',
      PORT: '$AppPort',
      HOST: '0.0.0.0'
    }
  }]
};
"@
[System.IO.File]::WriteAllText(
  "$ScriptDir\ecosystem.config.js", $ecosystem,
  [System.Text.UTF8Encoding]::new($false))

# Force node_modules linker (NEVER PnP in production)
[System.IO.File]::WriteAllText(
  "$ScriptDir\.yarnrc.yml", "nodeLinker: node-modules`n",
  [System.Text.UTF8Encoding]::new($false))

tar -czf build.tgz `
  ecosystem.config.js `
  .yarnrc.yml `
  package.json yarn.lock `
  dist

Remove-Item "$ScriptDir\ecosystem.config.js" -Force

# --- 3. upload ---
scp -i $SshKeyPath -P $SshPort -o StrictHostKeyChecking=no `
  build.tgz "$SshUser@$ServerIP`:$RemoteUpload"

# --- 4. remote deploy ---
$sshArgs = @(
  "-i", $SshKeyPath, "-p", $SshPort,
  "-o", "StrictHostKeyChecking=no",
  "-o", "ServerAliveInterval=15",
  "$SshUser@$ServerIP"
)

$remoteScript = @'
#!/bin/bash
set -euo pipefail
APP_BASE="__APP_BASE__"
APP_NAME="__APP_NAME__"
APP_PORT=__APP_PORT__

echo "[REMOTE] Starting deploy on $(hostname) at $(date -Is)"
rel="$APP_BASE/releases/$(date +%Y%m%d%H%M%S)"
mkdir -p "$rel"
tar xzf "$APP_BASE/uploads/build.tgz" -C "$rel"

# Persist .env across releases via shared/
mkdir -p "$APP_BASE/shared"
if [ ! -f "$APP_BASE/shared/.env" ] && [ -f "$APP_BASE/current/.env" ]; then
  cp "$APP_BASE/current/.env" "$APP_BASE/shared/.env"
fi
if [ -f "$APP_BASE/shared/.env" ]; then
  cp "$APP_BASE/shared/.env" "$rel/.env"
else
  echo "[REMOTE] ERROR: no shared/.env" >&2; exit 1
fi

# Atomic switch
ln -sfn "$rel" "$APP_BASE/current"
cd "$APP_BASE/current"

export PATH="$HOME/.local/bin:$HOME/.yarn/bin:/usr/local/bin:/usr/bin:$PATH"
rm -f .pnp.cjs .pnp.loader.mjs || true
corepack enable >/dev/null 2>&1 || true
corepack prepare yarn@4.10.3 --activate >/dev/null 2>&1 || true
corepack yarn install --immutable || corepack yarn install
[ -d node_modules ] || { echo "[REMOTE] node_modules missing" >&2; exit 1; }

# Restart
pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
pm2 start ecosystem.config.js
pm2 save

# Health check
sleep 5
if curl -fs "http://127.0.0.1:$APP_PORT/healthz" >/dev/null; then
  echo "[REMOTE] Health OK"
else
  pm2 logs "$APP_NAME" --lines 20 --nostream || true
  exit 1
fi

# Prune old releases
cd "$APP_BASE/releases"
ls -t | tail -n +16 | xargs -r -I {} rm -rf {}
echo "[REMOTE] Done $(date -Is)"
'@

# Substitute variables (avoids PowerShell escaping nightmares inside the heredoc)
$remoteScript = $remoteScript `
  -replace "__APP_BASE__", $RemoteBase `
  -replace "__APP_NAME__", $AppName `
  -replace "__APP_PORT__", "$AppPort"

# CRLF -> LF, write as UTF-8 no BOM
$tempScript = [System.IO.Path]::GetTempFileName() + ".sh"
[System.IO.File]::WriteAllText(
  $tempScript, ($remoteScript -replace "`r`n", "`n"),
  [System.Text.UTF8Encoding]::new($false))

scp -i $SshKeyPath -P $SshPort -o StrictHostKeyChecking=no `
  $tempScript "$SshUser@$ServerIP`:/tmp/deploy-$AppName.sh"

& ssh @sshArgs "chmod +x /tmp/deploy-$AppName.sh && /tmp/deploy-$AppName.sh"

Remove-Item $tempScript -Force
Write-Host "Deployment completed!" -ForegroundColor Green
```

---

## 5. The Frontend Variant (SPA)

Almost identical, but:
- The "app" is `npx serve -s dist` (or `serve` installed locally) on a port behind nginx.
- After unpacking, `rsync -a --delete dist/ /var/www/<app>-static/` so nginx serves static files directly. PM2 only keeps `serve` alive as a fallback.

```powershell
$ecosystem = @'
module.exports = {
  apps: [{
    name: 'frontend-staging',
    cwd: '/var/www/frontend-staging/current',
    script: 'npx',
    args: 'serve -s -l tcp://0.0.0.0:3000 dist',
    env: { NODE_ENV: 'production', PORT: '3000', HOST: '0.0.0.0' }
  }]
}
'@
```

Remote script adds:
```bash
mkdir -p /var/www/frontend-staging-static
rsync -a --delete dist/ /var/www/frontend-staging-static/
```

---

## 6. Critical Rules (learned the hard way)

| Rule | Why |
|---|---|
| **UTF-8 _without_ BOM** for `.yarnrc.yml`, `ecosystem.config.js`, bash scripts | BOM breaks Yarn YAML parser ("invalid character") and bash (`$'\xef\xbb\xbf'` syntax error) |
| **`HOST: '0.0.0.0'`** in PM2 env | Defaults to 127.0.0.1 → not reachable through nginx / from outside container |
| **`nodeLinker: node-modules`** | Yarn PnP causes runtime issues with many native/CJS packages on servers |
| **CRLF → LF** before SCPing bash scripts | `bash: $'\r': command not found` |
| **`set -euo pipefail`** at top of every remote script | Fails fast instead of half-deploying |
| **`ln -sfn`** (not `rm + ln`) | Atomic — no window where `current` doesn't exist |
| **Health check** before declaring success | Catches "starts then crashes" PM2 issues |
| **Keep N releases** | Disk fills up surprisingly fast with `node_modules` |
| **`shared/.env`** never in git, never in tarball (staging pattern) | Single source of truth for secrets per environment |
| **SSH key auth only** (`PasswordAuthentication no`) | Brute force protection |

### `Out-File` will hurt you
```powershell
# WRONG — adds UTF-8 BOM (3 bytes 0xEF 0xBB 0xBF at the start)
$content | Out-File -FilePath ".yarnrc.yml" -Encoding UTF8

# RIGHT
[System.IO.File]::WriteAllText(
  ".yarnrc.yml", $content, [System.Text.UTF8Encoding]::new($false))
```

Verify with:
```powershell
Get-Content .yarnrc.yml -AsByteStream | Select-Object -First 3
# Must NOT be: 239 187 191
```

---

## 7. Production vs Staging — What Differs

Looking at `backend/deploy-staging.ps1` vs `backend/deploy-production.ps1`:

| | Staging | Production |
|---|---|---|
| `.env` source | `shared/.env` on server (never re-uploaded) | Bundled in tarball, then mirrored to `shared/` |
| Migrations | Skipped (faster iteration) | `yarn typeorm migration:run` before PM2 restart |
| Approval | Run freely | **Requires explicit user approval** (per project rule `06-deployment-approval.mdc`) |
| Server | `deployer@10.x.x.x` (VPN) | Different host, different SSH key |
| Health port | 4001 | 4000 |

For your other projects, pick whichever `.env` strategy fits — `shared/.env` is safer (no secrets ever leave the server), bundled `.env` is simpler if you have a vault/CI managing it.

---

## 8. Rollback (always test this!)

```bash
ssh deployer@server
cd /var/www/<app>
ls -lt releases/ | head            # find previous timestamp
ln -sfn releases/<PREV_TS> current
pm2 restart <app>
curl -fs http://127.0.0.1:<PORT>/healthz
```

Make a `rollback-<env>.ps1` that does this remotely if you deploy often.

---

## 9. Required `/healthz` Endpoint

Your app **must** expose this:

```ts
// Express
app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
```

Cheap, no DB call (or a *fast* one with a timeout). The health check is how the deploy script knows whether to fail loudly.

---

## 10. Adapting to a New Project — Checklist

- [ ] Create `/var/www/<app>-<env>/{uploads,releases,shared}` on the server, owned by `deployer`.
- [ ] Drop `shared/.env` in place once.
- [ ] Copy this script template; change `$AppName`, `$RemoteBase`, `$AppPort`, `$ServerIP`.
- [ ] Write `ecosystem.<env>.config.js` (or inline it like the frontend script does) with `HOST: '0.0.0.0'`.
- [ ] Add `/healthz` to the app.
- [ ] Run once and verify:
  - `pm2 status` shows the app **online** (not `errored`/`stopped`).
  - `ss -tlnp | grep :<port>` binds to `0.0.0.0`, not `127.0.0.1`.
  - `ls -la /var/www/<app>-<env>/current` shows a symlink to a release dir.
- [ ] Configure nginx to reverse-proxy / serve static files.
- [ ] Set up TLS (Let's Encrypt + certbot).
- [ ] Test rollback once.

---

## 11. Reference Files in This Repo

- `backend/deploy-staging.ps1` — full backend staging script
- `backend/deploy-production.ps1` — backend production (with migrations)
- `backend/ecosystem.staging.config.js` — multi-app PM2 config (server + workers)
- `frontend/deploy-staging.ps1` — frontend SPA with rsync to nginx static root

These are battle-tested; copy-paste freely and tweak.
