import type { ConnectionPool, Transaction } from 'mssql'

/** Use for queries that must share one SQL transaction (or plain pool autocommit). */
export type SqlExecutor = ConnectionPool | Transaction
