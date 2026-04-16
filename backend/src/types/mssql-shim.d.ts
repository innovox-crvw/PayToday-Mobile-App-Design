declare module 'mssql' {
  import type { EventEmitter } from 'node:events'

  export interface IResult<T = unknown> {
    recordset: T[]
    rowsAffected: number[]
  }

  export class Request {
    input(name: string, value: unknown): this
    query<T = unknown>(command: string): Promise<IResult<T>>
  }

  export class Transaction {
    begin(): Promise<void>
    commit(): Promise<void>
    rollback(): Promise<void>
    request(): Request
  }

  export class ConnectionPool extends EventEmitter {
    connected: boolean
    connect(): Promise<ConnectionPool>
    close(): Promise<void>
    request(): Request
    transaction(): Transaction
  }

  export function connect(connectionString: string): Promise<ConnectionPool>

  interface MssqlDefault {
    connect: typeof connect
    close: () => Promise<void>
    ConnectionPool: typeof ConnectionPool
    Request: typeof Request
  }

  const sql: MssqlDefault
  export default sql
}
