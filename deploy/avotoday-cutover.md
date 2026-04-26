# AvoToday VM cutover — combined → split (frontend + backend)

One-time runbook to migrate `avotoday.today-ww.net` from the old "Option C" deploy
(`/var/www/avotoday-production`, single PM2 app serving API + SPA) to the new split:

- **Backend** under `/var/www/avotoday-backend/` (PM2 app `avotoday-backend`, loopback `127.0.0.1:4000`)
- **Frontend** under `/var/www/avotoday-frontend/` (no PM2; Nginx serves `current/dist/`)

All commands run as root (or via `sudo`) on the VM unless noted. **Take a snapshot
of the VM before starting** — this is a destructive cutover.

---

## 0. Prerequisites

- Local: PowerShell 7 + the new deploy scripts under `deploy/` (this repo).
- Local: `frontend/.env.production` and `deploy/env.avotoday.backend.production.template`
  filled with real values.
- VM: `node`, `npm`, `pm2`, `nginx`, `tar`, `curl` already installed (they were for
  the old deploy).

## 1. Prepare new directory layout

```bash
sudo mv /var/www/avotoday-production /var/www/avotoday-backend
sudo mkdir -p /var/www/avotoday-backend/{releases,uploads,shared}
sudo mkdir -p /var/www/avotoday-frontend/{releases,uploads}
sudo chown -R deployer:deployer /var/www/avotoday-backend /var/www/avotoday-frontend
```

**Important:** the `mv` does NOT update the absolute `current` symlink target,
so right after the rename `/var/www/avotoday-backend/current` still points at
`/var/www/avotoday-production/releases/<ts>` and is **dangling**. Repoint it
into the new tree before doing anything else (use the same timestamp the old
symlink had — verify with `readlink /var/www/avotoday-backend/current` if
unsure):

Run as the `deployer` user (the release tree is owned by `deployer:deployer`,
no sudo required):

```bash
# Read the literal symlink target — works even when it points at a dir that
# no longer exists. (`readlink -f` can return empty for fully-dangling links.)
RAW_TARGET="$(readlink /var/www/avotoday-backend/current 2>/dev/null || true)"
LIVE_TS="$(basename "$RAW_TARGET")"
if [ -z "$LIVE_TS" ] || [ ! -d "/var/www/avotoday-backend/releases/$LIVE_TS" ]; then
  # Fallback: most recent release that actually exists in the new tree.
  LIVE_TS="$(ls -1 /var/www/avotoday-backend/releases | sort | tail -n1)"
fi
echo "Repointing current -> $LIVE_TS"
ln -sfn "/var/www/avotoday-backend/releases/$LIVE_TS" /var/www/avotoday-backend/current
ls -l /var/www/avotoday-backend/current
ls -l /var/www/avotoday-backend/current/.env   # sanity: should resolve to a real file
```

## 2. Move/refresh the backend `.env`

The previous deploy copied `shared/.env` into each release as `current/.env`,
so the live `.env` lives inside the active release dir until you promote it:

```bash
# Confirm a real .env exists (look for one inside the releases tree):
find /var/www/avotoday-backend -maxdepth 3 -name '.env' -type f -ls
ls -l /var/www/avotoday-backend/current/.env

# Promote into shared/ so future deploys reuse it without bundling secrets:
sudo cp /var/www/avotoday-backend/current/.env /var/www/avotoday-backend/shared/.env
sudo chmod 600 /var/www/avotoday-backend/shared/.env
sudo chown deployer:deployer /var/www/avotoday-backend/shared/.env
```

If `find` returns no `.env` files (e.g. the previous tree never carried one),
fill in `shared/.env` by hand from
`deploy/env.avotoday.backend.production.template` before continuing.

Edit it with the values from `deploy/env.avotoday.backend.production.template`:

- Add `BIND_HOST=127.0.0.1`.
- Remove any `SPA_STATIC_ROOT` line.
- Confirm `PUBLIC_STORE_URL` / `PUBLIC_API_URL` still reflect `https://avotoday.today-ww.net`.

## 3. Stop the old combined PM2 app

```bash
pm2 list
pm2 delete avotoday-production || true
pm2 save
```

(The old app name was `avotoday-production`; deploy/avotoday-cutover keeps the
process down for a few minutes during cutover. Plan for ~5 minutes of API outage.)

## 4. Deploy the new backend (from your workstation)

```powershell
.\deploy\avotoday-backend-production.ps1 `
  -ServerHost 'YOUR_VM_HOST' `
  -SshUser deployer `
  -SshKeyPath "$env:USERPROFILE\.ssh\id_ed25519"
```

Verifies on the VM:

```bash
curl -fsS http://127.0.0.1:4000/api/health   # must return 200 + JSON
pm2 list                                      # avotoday-backend should be online
```

## 5. Deploy the frontend (from your workstation)

```powershell
.\deploy\avotoday-frontend-production.ps1 `
  -ServerHost 'YOUR_VM_HOST' `
  -SshUser deployer `
  -SshKeyPath "$env:USERPROFILE\.ssh\id_ed25519" `
  -SkipPublicHealthCheck
```

(The public check is skipped here because Nginx is still pointed at the old
config — the next step swaps it.)

Verify on the VM:

```bash
ls -l /var/www/avotoday-frontend/current/dist/index.html
```

## 6. Install the new Nginx site

```bash
sudo cp /home/deployer/repos/paytoday-store/deploy/nginx/avotoday-split.conf /etc/nginx/sites-available/avotoday
# (path above assumes the repo lives in /home/deployer/repos; otherwise scp the
# file from your workstation: scp deploy/nginx/avotoday-split.conf deployer@host:/tmp/)

# Disable the old Option C site if it's still enabled:
sudo rm -f /etc/nginx/sites-enabled/avotoday-option-c
sudo ln -sfn /etc/nginx/sites-available/avotoday /etc/nginx/sites-enabled/avotoday

# Re-attach TLS cert paths inside the file (uncomment the ssl_certificate /
# ssl_certificate_key lines and verify the cert filenames under
# /etc/letsencrypt/live/avotoday.today-ww.net/).

sudo nginx -t
sudo systemctl reload nginx
```

## 7. Smoke tests

From your workstation (or any external host):

```bash
curl -fsSL https://avotoday.today-ww.net/                  # → 200 (SPA index.html)
curl -fsSL https://avotoday.today-ww.net/api/health        # → 200 + JSON
curl -fsSL https://avotoday.today-ww.net/shop              # → 200 (SPA fallback)
curl -fsSL https://avotoday.today-ww.net/admin             # → 200 (SPA fallback)
```

In the browser, also confirm:

- A hard reload of `/shop/<slug>/<id>` keeps the route (history fallback works).
- Sign-in still issues the auth cookie (CORS / cookie SameSite OK).
- An admin product image upload + load still works (`/api/uploads/products/...`).

## 8. Verify the API is no longer publicly reachable

```bash
# from outside the VM:
curl -v http://YOUR_VM_PUBLIC_IP:4000/api/health
# should hang / refuse — port 4000 is bound to 127.0.0.1 and is also blocked at the firewall.
```

## 9. Clean up

After 24 h of clean traffic / logs:

```bash
pm2 list                                       # only avotoday-backend should remain
sudo journalctl -u nginx --since '1 day ago' | grep -Ei 'error|warn'
sudo rm -rf /var/www/avotoday-frontend/uploads/build.tgz \
            /var/www/avotoday-backend/uploads/build.tgz
```

---

## Rollback (if anything blows up)

| Layer    | Command                                                                                         |
|----------|--------------------------------------------------------------------------------------------------|
| Backend  | `.\deploy\rollback-avotoday-backend.ps1 -ReleaseTimestamp <ts> -ServerHost <host>`              |
| Frontend | `.\deploy\rollback-avotoday-frontend.ps1 -ReleaseTimestamp <ts> -ServerHost <host>`             |
| Nginx    | `sudo ln -sfn /etc/nginx/sites-available/avotoday-option-c /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx` |

If you must roll back to the old combined PM2 app, restore the original
`/var/www/avotoday-production` symlink (the rename in step 1 is reversible)
and `pm2 start ecosystem.config.cjs` from the previous release dir.
