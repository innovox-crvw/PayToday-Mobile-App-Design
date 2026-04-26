# Previously: start Docker MS SQL from docker-compose and run db:setup.
# The repo no longer ships a docker-compose SQL service — use .env SQL_* / SQL_CONNECTION_STRING
# and your own SQL instance, then: npm run db:setup

$ErrorActionPreference = 'Stop'
Write-Host 'setup-local-sql.ps1: bundled Docker SQL was removed from this repo.' -ForegroundColor Yellow
Write-Host '  Configure MS SQL in backend/.env (see backend/.env.example), then run: npm run db:setup' -ForegroundColor Cyan
exit 1
