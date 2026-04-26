# AvoToday — rollout runbook (`avotoday.today-ww.net`)

This runbook implements the [PowerShell-driven Linux deployment pattern](../docs/DEPLOYMENT_PATTERN.md), adapted for the **split frontend/backend** topology this repo now uses:

- **Backend** (Node + Express) — built from `backend/`, deployed to `/var/www/avotoday-backend/`, run by **PM2** under app name `avotoday-backend`, bound to **`127.0.0.1:4000`** (loopback only — never reachable from the public internet).
- **Frontend** (Vite SPA) — built from `frontend/`, deployed to `/var/www/avotoday-frontend/`, served as static files by **Nginx** directly out of `current/dist/`. No PM2.
- **Nginx** is the single public entry point. It serves the SPA and reverse-proxies `/api/*` to the backend on `127.0.0.1:4000`. Future third-party API access also terminates here so we can layer rate limits / IP allow-lists / API keys before traffic reaches Node.

Scripts in this folder:

- [`avotoday-backend-production.ps1`](avotoday-backend-production.ps1) — build inside `backend/`, tarball, SCP, remote extract, `npm ci --omit=dev`, PM2, health check on the loopback port.
- [`rollback-avotoday-backend.ps1`](rollback-avotoday-backend.ps1) — point backend `current` at a previous release and restart PM2.
- [`avotoday-frontend-production.ps1`](avotoday-frontend-production.ps1) — build inside `frontend/`, tarball only `dist/`, SCP, atomic symlink swap. No PM2, no remote `npm ci`.
- [`rollback-avotoday-frontend.ps1`](rollback-avotoday-frontend.ps1) — repoint frontend `current` at a previous release.
- [`avotoday-cutover.md`](avotoday-cutover.md) — one-time migration from the old combined `/var/www/avotoday-production` PM2 app to the split layout.
- [`nginx/avotoday-split.conf`](nginx/avotoday-split.conf) — current Nginx config (replaces the old `avotoday-option-c.conf`).
- [`env.avotoday.backend.production.template`](env.avotoday.backend.production.template) — server-only secrets for `/var/www/avotoday-backend/shared/.env`.
- [`env.avotoday.frontend.production.template`](env.avotoday.frontend.production.template) — `VITE_*` values baked into the static bundle at build time.

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
| Backend remote app base | `/var/www/avotoday-backend` (default in scripts) |
| Frontend remote app base | `/var/www/avotoday-frontend` (default in scripts) |
| PM2 app name | `avotoday-backend` (default) |
| Backend listen port | `4000` (default; must match `PORT` in backend `shared/.env`) |
| Backend bind host | `127.0.0.1` (default for production — Nginx is the only public entry) |
| MS SQL Server host:port (reachable from **Linux** VM) | |
| SQL auth | **SQL login + password** (Windows integrated auth is not supported on Linux for this app) |
| DNS provider / who can create `A`/`AAAA` records | |
| PayToday / Forms **`PUBLIC_API_URL`** (usually `https://avotoday.today-ww.net`) | |
| Storefront **`PUBLIC_STORE_URL`** (same origin as the SPA) | |
| Webhook URL exposed to PayToday | `https://avotoday.today-ww.net/api/webhooks/paytoday` |

---

## 2. Backend `shared/.env` (Linux)

- Use a connection string compatible with **Tedious** (SQL authentication). Do **not** use `Trusted_Connection=yes` / integrated security on the Ubuntu host ([`backend/src/db/mssqlConnectConfig.ts`](../backend/src/db/mssqlConnectConfig.ts)).
- Open SQL Server firewall / NSG for the app server's egress IP (or use private networking / VPN).
- TLS: match `Encrypt` / `TrustServerCertificate` to your SQL deployment.

Create **`/var/www/avotoday-backend/shared/.env`** once on the server (mode `600`). Start from **[`env.avotoday.backend.production.template`](env.avotoday.backend.production.template)**. Required keys for this host:

- `NODE_ENV=production`
- `PORT=4000`
- `BIND_HOST=127.0.0.1`
- `JWT_SECRET` — strong secret
- `SQL_CONNECTION_STRING` — SQL auth, reachable from the VM
- `PUBLIC_STORE_URL=https://avotoday.today-ww.net`
- `PUBLIC_API_URL=https://avotoday.today-ww.net`
- `CORS_ORIGINS=https://avotoday.today-ww.net`
- PayToday + webhook secrets per [docs/DEPLOY.md](../docs/DEPLOY.md)
- `COOKIE_SAME_SITE` — `lax` is fine for same-site SPA + API. Use `none` only if you need cross-site cookies and understand the implications.

## 2b. Frontend `.env.production`

`VITE_*` values are baked at `npm run build` time. Maintain them in
**[`env.avotoday.frontend.production.template`](env.avotoday.frontend.production.template)** → copy to `frontend/.env.production` on the build machine **before** running `avotoday-frontend-production.ps1`.

For the same-domain topology (SPA and API behind the same Nginx host), leave `VITE_API_BASE_URL` empty so the SPA uses relative `/api/*` URLs and shares cookies / origin with the backend.

---

## 3. One-time server bootstrap (Phase 2)

As root (or with sudo), roughly:

1. Create `deployer`, SSH keys only, harden `sshd`.
2. Install **Node.js 20.x** LTS and **PM2** (`sudo npm i -g pm2`), run `pm2 startup` and `pm2 save`.
3. `sudo mkdir -p /var/www/avotoday-backend/{uploads,releases,shared}`
4. `sudo mkdir -p /var/www/avotoday-frontend/{uploads,releases}`
5. `sudo chown -R deployer:deployer /var/www/avotoday-backend /var/www/avotoday-frontend`
6. Create backend `shared/.env` as above.
7. Firewall: only ports 80/443 (and 22) public; ensure `4000` is **not** exposed externally even if the bind host were 0.0.0.0.

Details match [docs/DEPLOYMENT_PATTERN.md](../docs/DEPLOYMENT_PATTERN.md) §3 (with two release trees instead of one).

---

## 4. Nginx + TLS (Phase 3)

1. Point DNS **`A`** (and optional **`AAAA`**) for `avotoday.today-ww.net` to the server.
2. Install Nginx + Certbot (distribution packages).
3. Copy [`nginx/avotoday-split.conf`](nginx/avotoday-split.conf) into `/etc/nginx/sites-available/avotoday`, symlink into `sites-enabled/`, drop any old `avotoday-option-c` entry, run `sudo nginx -t && sudo systemctl reload nginx`.
4. Obtain certificates, e.g. `certbot certonly --nginx -d avotoday.today-ww.net`, then uncomment the `ssl_certificate*` lines in the config and reload.

The new config:

- Serves SPA static files from `/var/www/avotoday-frontend/current/dist/`.
- `try_files $uri $uri/ /index.html` for SPA history fallback (react-router routes survive full reloads).
- Long-cache hashed Vite assets (`.js`, `.css`, fonts, images) and **no-cache** for `index.html`.
- Reverse-proxies `/api/` to upstream `127.0.0.1:4000` with `keepalive 32`.

---

## 5. Deploy (Phase 4-5)

From a Windows machine with the repo and Node 20+, **deploy backend first** (so `/api/health` is available before Nginx starts pointing at it), then frontend:

### 5.1 Backend

```powershell
cd C:\devs\paytoday-store
.\deploy\avotoday-backend-production.ps1 `
  -ServerHost "<SERVER_IP_OR_DNS>" `
  -SshUser deployer `
  -SshKeyPath "$env:USERPROFILE\.ssh\id_ed25519"
```

Optional:

- `-RunMigrations` — runs `node dist/db/migrate.js` on the server after `npm ci`.
- `-SkipLocalBuild` — re-package only.
- `-AppPort 4000`, `-BindHost 127.0.0.1`, `-RemoteBase /var/www/avotoday-backend` — defaults shown.

Verification on the server:

- `pm2 status` — `avotoday-backend` **online**
- `curl -fsS http://127.0.0.1:4000/api/health` — HTTP 200, JSON with `ok: true`
- `ss -tlnp | grep 4000` — listen address `127.0.0.1:4000` (loopback only)

### 5.2 Frontend

```powershell
.\deploy\avotoday-frontend-production.ps1 `
  -ServerHost "<SERVER_IP_OR_DNS>" `
  -SshUser deployer `
  -SshKeyPath "$env:USERPROFILE\.ssh\id_ed25519"
```

Optional:

- `-SkipLocalBuild` — re-package only.
- `-PublicUrl "https://avotoday.today-ww.net/"` — used for the post-deploy public health check.
- `-SkipPublicHealthCheck` — useful during the very first cutover when Nginx isn't pointed yet.
- `-KeepReleases 5` — releases retained.

Verification from the internet:

- `https://avotoday.today-ww.net/` — storefront loads
- `https://avotoday.today-ww.net/api/health` — HTTP 200 (proxied through Nginx)
- `https://avotoday.today-ww.net/shop` — SPA history fallback works
- Optional smoke: [docs/PAYTODAY_E2E_SMOKE.md](../docs/PAYTODAY_E2E_SMOKE.md)

---

## 6. Rollback (Phase 6)

List releases:

```bash
ls -lt /var/www/avotoday-backend/releases | head
ls -lt /var/www/avotoday-frontend/releases | head
```

Backend:

```powershell
.\deploy\rollback-avotoday-backend.ps1 `
  -ServerHost "<SERVER>" `
  -SshUser deployer `
  -SshKeyPath "$env:USERPROFILE\.ssh\id_ed25519" `
  -ReleaseTimestamp "20260101120000"
```

Frontend:

```powershell
.\deploy\rollback-avotoday-frontend.ps1 `
  -ServerHost "<SERVER>" `
  -SshUser deployer `
  -SshKeyPath "$env:USERPROFILE\.ssh\id_ed25519" `
  -ReleaseTimestamp "20260101120000"
```

`ReleaseTimestamp` is the folder name under `releases/` (same format the deploy script creates: `yyyyMMddHHmmss`).

You can roll back the two layers independently — typically the frontend rollback is enough if a new bundle ships a regression while the API is healthy.

---

## 7. Post-launch (Phase 7)

- Certbot renewal + `nginx -s reload` (or distro hook).
- Edge rate limits for `/api/auth/*` and `/api/webhooks/paytoday` ([docs/DEPLOY.md](../docs/DEPLOY.md)).
- PM2 log rotation; monitor disk under `releases/` (backend prunes to 15, frontend to 5 by default).

---

## 8. Public API for third parties (future)

When external partners need access:

1. Add a `server { server_name api.avotoday.today-ww.net; ... }` block in Nginx (a skeleton is commented at the bottom of `avotoday-split.conf`).
2. Mount under a versioned path (`/v1/...`) and apply `limit_req`, IP allow-lists, or API key headers there.
3. Keep proxying to the same backend on `127.0.0.1:4000` — the backend never changes its bind. Authentication / authorization for those routes is enforced inside Express on top of the Nginx gate.

---

## 9. Migration from the old "Option C" deploy

Use [`avotoday-cutover.md`](avotoday-cutover.md) once. It renames `/var/www/avotoday-production` to `/var/www/avotoday-backend`, creates the frontend release tree, swaps Nginx, and tears down the old PM2 app.
