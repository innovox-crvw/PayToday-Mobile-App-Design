/** Must match server middleware header name. */
export const CSRF_HEADER = 'x-csrf-token'

/** Must match `CSRF_COOKIE` in `backend/src/middleware/csrf.ts` (double-submit cookie). */
export const CSRF_COOKIE_NAME = 'pt_csrf'
