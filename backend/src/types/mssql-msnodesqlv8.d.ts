/** Subpath export has no bundled types; shape matches `mssql` default export. */
declare module 'mssql/msnodesqlv8' {
  import type { ConnectionPool } from 'mssql'

  interface MssqlMsnodesqlv8 {
    connect: (config: unknown) => Promise<ConnectionPool>
    close: () => Promise<void>
  }

  const sql: MssqlMsnodesqlv8
  export default sql
}
