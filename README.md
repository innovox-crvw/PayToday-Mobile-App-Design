# AvoToday

Customer **store**, **wallet**, **payments** and **services** flows, **classifieds**, **onboarding**, and **merchant admin** — split into two independently-managed npm projects in a single git repo:

- `frontend/` — React 19 + TypeScript SPA built by Vite. Static `dist/` served by Nginx.
- `backend/`  — Node 20 / Express 5 + TypeScript API on Microsoft SQL Server. Bound to `127.0.0.1:4000` in production; reachable only via Nginx.

Public requests hit Nginx (`avotoday.today-ww.net`):

- `/api/*` → reverse-proxied to the Node backend on `127.0.0.1:4000`.
- everything else → SPA `index.html` from `/var/www/avotoday-frontend/current/dist/`.

There is **no npm workspace**; each subfolder owns its own `package.json` / lockfile / build / deploy. See [docs/DEPLOY.md](docs/DEPLOY.md) and [deploy/avotoday-cutover.md](deploy/avotoday-cutover.md).

- **Full documentation:** [docs/PROJECT_HANDBOOK.md](docs/PROJECT_HANDBOOK.md)
- **Deploy / ops:** [docs/DEPLOY.md](docs/DEPLOY.md), [deploy/avotoday-rollout.md](deploy/avotoday-rollout.md)
- **Keycloak (developers):** `/api/auth/keycloak/*` — [docs/KEYCLOAK_API.md](docs/KEYCLOAK_API.md); behaviour: [docs/KEYCLOAK_AUTH_MODEL.md](docs/KEYCLOAK_AUTH_MODEL.md). On a running API, **`GET /api/auth/keycloak/routes`** returns a JSON index.

## Local demo (two terminals)

1. **SQL Server** — `cd backend && docker compose up -d` (the `docker-compose.yml` lives next to the backend) or use any existing MSSQL instance.
2. **Backend** (`backend/.env` from [`backend/.env.example`](backend/.env.example), set `SQL_CONNECTION_STRING` + `JWT_SECRET`):
   ```bash
   cd backend
   npm install
   npm run db:demo-setup     # loads scripts/paytoday-full-setup.sql then migrations
   npm run dev               # binds 0.0.0.0:4000 in dev
   ```
3. **Frontend** (`frontend/.env` from [`frontend/.env.example`](frontend/.env.example) — values usually fine as-is for local):
   ```bash
   cd frontend
   npm install
   npm run dev               # Vite, default :5173, proxies /api/* to 127.0.0.1:4000
   ```

Open the Vite URL printed in terminal #2. Seeded local login: **`demo@paytoday.local`** / **`PayToday123!`** (see [`backend/scripts/paytoday-full-setup.sql`](backend/scripts/paytoday-full-setup.sql) header).

## Docs folder

Browse **[docs/README.md](docs/README.md)** or open the [Project handbook](docs/PROJECT_HANDBOOK.md) for the full map of technical documents.

## Frontend tooling (optional)

Vite / ESLint / React Compiler notes from the default template live in [docs/FRONTEND_TOOLING.md](docs/FRONTEND_TOOLING.md).
