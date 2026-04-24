# AvoToday

Customer **store**, **wallet**, **payments** and **services** flows, **classifieds**, **onboarding**, and **merchant admin** — React + TypeScript SPA (Vite) with an Express API and Microsoft SQL Server.

- **Full documentation:** [docs/PROJECT_HANDBOOK.md](docs/PROJECT_HANDBOOK.md) (features, architecture, security summary, document index)
- **Deploy / ops:** [docs/DEPLOY.md](docs/DEPLOY.md)
- **Keycloak (developers):** `/api/auth/keycloak/*` — [docs/KEYCLOAK_API.md](docs/KEYCLOAK_API.md); behaviour: [docs/KEYCLOAK_AUTH_MODEL.md](docs/KEYCLOAK_AUTH_MODEL.md). On a running API, **`GET /api/auth/keycloak/routes`** returns a JSON index.

## Local demo (products + users)

1. **SQL Server** — Either `docker compose up -d` (see [.env.example](.env.example) for the matching `SQL_CONNECTION_STRING`) or use an existing instance.
2. **`.env`** — Copy from `.env.example`; set `SQL_CONNECTION_STRING` and `JWT_SECRET`.
3. **Database** — `npm run db:demo-setup` loads [backend/scripts/paytoday-full-setup.sql](backend/scripts/paytoday-full-setup.sql) (dev reset) then migrations.
4. **Run** — `npm run dev`, then open the Vite URL printed in the terminal. Seeded local login: **`demo@paytoday.local`** / **`PayToday123!`** (see the script header for details).

## Docs folder

Browse **[docs/README.md](docs/README.md)** or open the [Project handbook](docs/PROJECT_HANDBOOK.md) for the full map of technical documents.

## Frontend tooling (optional)

Vite / ESLint / React Compiler notes from the default template live in [docs/FRONTEND_TOOLING.md](docs/FRONTEND_TOOLING.md).
