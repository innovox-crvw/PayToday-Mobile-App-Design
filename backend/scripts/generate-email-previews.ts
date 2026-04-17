import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildFallbackEmail } from '../src/services/notifyEmailApi.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '..', '..')
const outDir = path.join(repoRoot, 'docs', 'email-previews')

const base = 'http://localhost:5173'
const samples: { file: string; templateKey: string; payload: Record<string, unknown> }[] = [
  {
    file: 'checkout-pending.html',
    templateKey: 'checkout_pending_payment',
    payload: { orderId: 'ORD-EXAMPLE-001', totalCents: 12999, currency: 'NAD' },
  },
  {
    file: 'payment-confirmed.html',
    templateKey: 'payment_confirmed',
    payload: { orderId: 'ORD-EXAMPLE-001' },
  },
  {
    file: 'pickup-code.html',
    templateKey: 'pickup_code_ready',
    payload: { orderId: 'ORD-EXAMPLE-001', code: '48291' },
  },
]

mkdirSync(outDir, { recursive: true })

const links: string[] = []
for (const s of samples) {
  const { html, subject } = buildFallbackEmail(s.templateKey, s.payload, base)
  writeFileSync(path.join(outDir, s.file), html)
  links.push(`<li><a href="${s.file}" target="_blank" rel="noopener">${subject}</a></li>`)
}

const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>PayToday Store email previews</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 560px; margin: 48px auto; padding: 0 16px; color: #18181b; }
    code { background: #f4f4f5; padding: 2px 6px; border-radius: 4px; }
    ul { line-height: 1.8; }
  </style>
</head>
<body>
  <h1>Email previews</h1>
  <p>Static samples using the same <code>buildFallbackEmail</code> output as the notification worker (open each link).</p>
  <ul>
    ${links.join('\n    ')}
  </ul>
</body>
</html>
`

writeFileSync(path.join(outDir, 'index.html'), indexHtml)
console.log('Wrote', outDir)
