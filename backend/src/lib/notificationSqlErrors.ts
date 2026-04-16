import { formatSqlDriverError } from '../db/sqlDriverError.js'

/** Missing migration 002 or table renamed. */
export function isMissingUserNotificationsTableError(err: unknown): boolean {
  const m = formatSqlDriverError(err).toLowerCase()
  return (
    (m.includes('invalid object name') || m.includes('does not exist')) &&
    m.includes('user_notifications')
  )
}

export function isInvalidUniqueIdentifierConversion(err: unknown): boolean {
  const m = formatSqlDriverError(err).toLowerCase()
  return m.includes('uniqueidentifier') && (m.includes('conversion failed') || m.includes('failed to convert'))
}
