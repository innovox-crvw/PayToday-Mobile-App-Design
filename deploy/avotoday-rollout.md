# AvoToday — rollout runbook (`avotoday.today-ww.net`)

This runbook implements the [PowerShell-driven Linux deployment pattern](../docs/DEPLOYMENT_PATTERN.md) for this repo, adapted for **npm**, **`GET /api/health`**, and **Option C** (single Node process serves API + SPA via `SPA_STATIC_ROOT=dist`).

Scripts live in this folder:

- [`avotoday-production.ps1`](avotoday-production.ps1) — build, tarball, SCP, remote extract, `npm ci --omit=dev`, PM2, health check.
- [`rollback-avotoday-production.ps1`](rollback-avotoday-production.ps1) — point `current` at a previous release and restart PM2.

---

## 1. Inventory checklist (Phase 0)

Fill in before first deploy:

| Item | Your value |
|------|----------------|
| Public hostname | `avotoday.today-ww.net` |
| Server IPv4/IPv6 or DNS for SSH | |
| SSH port (default 22) | |
| SSH user (recommended `deployer`) | |
| Path to SSH private key on Windows (e.g. `%USERPROFILE%\.ssh\id_ed25519`) | |
| Remote app base (`RemoteBase`) | `/var/www/avotoday-production` (default in scripts) |
| PM2 app name | `avotoday-production` (default) |
| App listen port | `4000` (default; must match `PORT` in `shared/.env`) |
| MS SQL Server host:port (reachable from **Linux** VM) | |
| SQL auth | **SQL login + password** (Windows integrated auth is not supported on Linux for this app) |
| DNS provider / who can create `A`/`AAAA` records | |
| PayToday / Forms **`PUBLIC_API_URL`** (usually `https://avotoday.today-ww.net`) | |
| Storefront **`PUBLIC_STORE_URL`** (Option C: same origin) | |
| Webhook URL exposed to PayToday | `https://avotoday.today-ww.net/api/webhooks/paytoday` (verify path in your integration) |

---

## 2. SQL + networking + `shared/.env` (Linux)

- Use a connection string compatible with **Tedious** (SQL authentication). Do **not** use `Trusted_Connection=yes` / integrated security on the Ubuntu host ([`backend/src/db/mssqlConnectConfig.ts`](../backend/src/db/mssqlConnectConfig.ts)).
- Open SQL Server firewall / NSG for the app server’s egress IP (or use private networking / VPN).
- TLS: match `Encrypt` / `TrustServerCertificate` to your SQL deployment (see [.env.example](../.env.example) notes).

Create **`/var/www/avotoday-production/shared/.env`** once on the server (mode `600`). Start from **[`deploy/env.avotoday.production.template`](env.avotoday.production.template)** (copy on your machine, fill secrets, upload to the server). Required and common keys are also documented in [docs/DEPLOY.md](../docs/DEPLOY.md). For this host, at minimum set:

- `NODE_ENV=production`
- `PORT=4000`
- `JWT_SECRET` — strong secret
- `SQL_CONNECTION_STRING` — SQL auth, reachable from the VM
- `PUBLIC_STORE_URL=https://avotoday.today-ww.net`
- `PUBLIC_API_URL=https://avotoday.today-ww.net` (or the exact origin PayToday must call)
- `CORS_ORIGINS` — typically `https://avotoday.today-ww.net`
- PayToday + webhook secrets per [docs/DEPLOY.md](../docs/DEPLOY.md)
- `COOKIE_SAME_SITE` / HTTPS: production should be served over **HTTPS**; use `none` only if you need cross-site cookies and understand the implications.

**Vite `VITE_*`:** baked at `npm run build` time ([`vite.config.ts`](../vite.config.ts)). Build on a machine that has the correct `.env.production` / CI secrets **before** packaging, or export `VITE_*` in the environment running the deploy script.

---

## 3. One-time server bootstrap (Phase 2)

As root (or with sudo), roughly:

1. Create `deployer`, SSH keys only, harden `sshd`.
2. Install **Node.js 20.x** LTS and **PM2** (`sudo npm i -g pm2`), run `pm2 startup` and `pm2 save`.
3. `sudo mkdir -p /var/www/avotoday-production/{uploads,releases,shared}`
4. `sudo chown -R deployer:deployer /var/www/avotoday-production`
5. Create `shared/.env` as above.

Details match [docs/DEPLOYMENT_PATTERN.md](../docs/DEPLOYMENT_PATTERN.md) §3 (replace `<app>-<env>` with `avotoday-production`).

---

## 4. Nginx + TLS (Phase 3, Option C)

1. Point DNS **`A`** (and optional **`AAAA`**) for `avotoday.today-ww.net` to the server.
2. Install Nginx + Certbot (distribution packages).
3. Copy or adapt [`nginx/avotoday-option-c.conf`](nginx/avotoday-option-c.conf) into `/etc/nginx/sites-available/` and enable the site.
4. Obtain certificates, e.g. `certbot certonly --nginx -d avotoday.today-ww.net` (or your preferred HTTP-01 flow), then reload Nginx.

Option C proxies **all paths** to Node on `127.0.0.1:4000`; Express serves the SPA from `dist/` and JSON under `/api`.

---

## 5. Deploy (Phase 4–5)

From a Windows machine with the repo and Node 20+:

```powershell
cd C:\devs\paytoday-store
.\deploy\avotoday-production.ps1 `
  -ServerHost "<SERVER_IP_OR_DNS>" `
  -SshUser deployer `
  -SshKeyPath "$env:USERPROFILE\.ssh\id_ed25519" `
  -RemoteBase /var/www/avotoday-production
```

Optional:

- `-RunMigrations` — runs `node backend/dist/db/migrate.js` on the server after `npm ci` (requires `backend/migrations` in the tarball; the script includes it).
- `-SkipLocalBuild` — if you already ran `npm run build` and want to re-package only.

### First rollout verification

On the server:

- `pm2 status` — `avotoday-production` **online**
- `curl -fsS http://127.0.0.1:4000/api/health` — HTTP 200, JSON with `ok: true`
- `ss -tlnp | grep 4000` — listen address acceptable for your setup (Node default with this codebase binds in a way reachable from localhost; Nginx connects to `127.0.0.1`)

From the internet:

- `https://avotoday.today-ww.net/` — storefront loads
- `https://avotoday.today-ww.net/api/health` — same as above
- Optional smoke: [docs/PAYTODAY_E2E_SMOKE.md](../docs/PAYTODAY_E2E_SMOKE.md)

---

## 6. Rollback (Phase 6)

List releases:

```bash
ls -lt /var/www/avotoday-production/releases | head
```

Then:

```powershell
.\deploy\rollback-avotoday-production.ps1 `
  -ServerHost "<SERVER>" `
  -SshUser deployer `
  -SshKeyPath "$env:USERPROFILE\.ssh\id_ed25519" `
  -ReleaseTimestamp "20260101120000"
```

`ReleaseTimestamp` is the folder name under `releases/` (same format the deploy script creates: `yyyyMMddHHmmss`).

---

## 7. Post-launch (Phase 7)

- Certbot renewal + `nginx -s reload` (or distro hook).
- Edge rate limits for `/api/auth/*` and `/api/webhooks/paytoday` ([docs/DEPLOY.md](../docs/DEPLOY.md)).
- PM2 log rotation; monitor disk under `releases/` (deploy prunes to **15** releases).

---

## 8. Topology alternatives

- **Option A** (Nginx static `dist/` + `/api` to Node): use a static root and rsync pattern from [docs/DEPLOYMENT_PATTERN.md](../docs/DEPLOYMENT_PATTERN.md) §5; adjust tarball and PM2 to API-only (`SPA_STATIC_ROOT` unset).
- **Option B** (`npx serve` for SPA): usually unnecessary if Option C works.
