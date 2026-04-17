import nodemailer from 'nodemailer'
import { env } from '../config/env.js'
import { buildFallbackEmail } from './notifyEmailApi.js'

export function isSmtpOutboundConfigured(): boolean {
  return Boolean(env.smtpHost?.trim())
}

/**
 * Sends the same fallback bodies as the Today notify service when portal templates are not used.
 * Set SMTP_HOST (+ optional auth), NOTIFICATION_EMAIL_FROM, and PUBLIC_STORE_URL for local or self-hosted email.
 */
export async function sendSmtpTransactionalEmail(input: {
  to: string
  templateKey: string
  payload: Record<string, unknown>
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isSmtpOutboundConfigured()) {
    return { ok: false, error: 'SMTP_HOST is not set' }
  }
  const from = env.notificationEmailFrom.trim()
  if (!from) {
    return { ok: false, error: 'NOTIFICATION_EMAIL_FROM is required when using SMTP' }
  }

  const storeUrl = env.publicStoreUrl.replace(/\/$/u, '')
  const { subject, html, text } = buildFallbackEmail(input.templateKey, input.payload, storeUrl)

  const user = env.smtpUser.trim()
  const pass = env.smtpPass
  const transporter = nodemailer.createTransport({
    host: env.smtpHost.trim(),
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    auth: user ? { user, pass } : undefined,
  })

  try {
    await transporter.sendMail({
      from,
      to: input.to,
      subject,
      text,
      html,
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'SMTP send failed' }
  }
}
