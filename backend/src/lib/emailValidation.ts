/** RFC 5322–style practical check; not exhaustive but blocks obvious junk. */
const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/

export function isValidEmailFormat(email: string): boolean {
  const s = email.trim()
  if (s.length < 5 || s.length > 254) return false
  return EMAIL_RE.test(s)
}
