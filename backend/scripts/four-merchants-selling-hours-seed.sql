/*
  Seeds store + liquor selling hours for merchants 931001, 931002, 931003, 991001.
  Delegates to migration 085 (idempotent MERGE).

  Prerequisites: nictus-three-merchants-seed.sql (931001–931003 businesses).

  From repo root:
    cd backend && npm run db:migrate

  Or SSMS / sqlcmd:
    sqlcmd -S SERVER -d paytoday -E -C -b -i backend/migrations/085_four_merchant_selling_hours_seed.sql
*/
