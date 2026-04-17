/**
 * Table-based layout for transactional mail (notify fallback + SMTP).
 * Inline styles only — many clients ignore style blocks in head.
 */

function esc(s: string): string {
  return s
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
}

export type TransactionalLayoutDetail = { label: string; value: string }

export type StoreTransactionalEmailOptions = {
  /** Shown in inbox preview; hidden in body. */
  preheader: string
  /** Browser tab title and main headline. */
  title: string
  /** Short lead copy (plain text, escaped). */
  intro: string
  /** Optional key/value rows (plain text, escaped). */
  details?: TransactionalLayoutDetail[]
  /** Trusted small HTML fragments only (caller must escape user data). */
  extraHtml?: string[]
  /** Primary button below content. */
  cta?: { label: string; href: string }
  /** Muted footer line (plain text, escaped). */
  footnote?: string
}

const BG = '#f0f0f2'
const CARD = '#ffffff'
const BORDER = '#e4e4e7'
const TEXT = '#18181b'
const MUTED = '#71717a'
const ACCENT = '#5b21b6'
const ACCENT_DARK = '#4c1d95'
const BTN = '#6d28d9'

/**
 * Full HTML document for store order / payment notifications.
 */
export function wrapStoreTransactionalEmail(opts: StoreTransactionalEmailOptions, storeUrl: string): string {
  const pre = esc(opts.preheader.slice(0, 200))
  const title = esc(opts.title)
  const intro = esc(opts.intro)
  const foot = opts.footnote ? esc(opts.footnote) : ''
  const origin = esc(storeUrl.replace(/\/$/u, ''))

  const detailRows =
    opts.details?.length ?
      opts.details
        .map(
          (d) => `
          <tr>
            <td style="padding:10px 0;border-top:1px solid ${BORDER};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:${MUTED};width:38%;vertical-align:top;">${esc(d.label)}</td>
            <td style="padding:10px 0;border-top:1px solid ${BORDER};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:${TEXT};font-weight:600;vertical-align:top;">${esc(d.value)}</td>
          </tr>`,
        )
        .join('') ?? ''
      : ''

  const extras =
    opts.extraHtml?.map((h) => `<tr><td colspan="2" style="padding:16px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:${TEXT};">${h}</td></tr>`).join('') ??
    ''

  const ctaBlock = opts.cta
    ? `
          <tr>
            <td colspan="2" style="padding:28px 0 8px;text-align:center;">
              <a href="${esc(opts.cta.href)}" style="display:inline-block;padding:14px 28px;background:${BTN};color:#ffffff;text-decoration:none;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;">${esc(opts.cta.label)}</a>
            </td>
          </tr>`
    : ''

  const footRow = foot
    ? `<tr><td colspan="2" style="padding:24px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:${MUTED};">${foot}</td></tr>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${BG};">
<span style="display:none!important;visibility:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#fff;max-height:0;max-width:0;opacity:0;overflow:hidden;">${pre}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${BG};padding:24px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:${CARD};border-radius:12px;overflow:hidden;border:1px solid ${BORDER};box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <tr>
          <td style="background:linear-gradient(135deg,${ACCENT} 0%,${ACCENT_DARK} 100%);padding:22px 28px;">
            <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.85);">PayToday Store</p>
            <h1 style="margin:8px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;line-height:1.25;color:#ffffff;">${title}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 28px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${TEXT};">
            <p style="margin:0 0 16px;">${intro}</p>
          </td>
        </tr>
        ${detailRows || extras ? `<tr><td style="padding:0 28px 8px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${detailRows}${extras}</table></td></tr>` : ''}
        ${ctaBlock}
        ${footRow}
        <tr>
          <td style="padding:20px 28px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;line-height:1.5;color:${MUTED};border-top:1px solid ${BORDER};">
            This message was sent by PayToday Store regarding your order. If you did not place this order, you can ignore this email or contact support.<br/><br/>
            <a href="${origin}" style="color:${ACCENT};text-decoration:none;font-weight:600;">${origin}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}
