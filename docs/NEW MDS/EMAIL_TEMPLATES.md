# Email Template Management

This document describes how NedAccess manages transactional emails using **Handlebars (`.hbs`) templates** combined with TypeScript renderer functions and an external Notifications API.

---

## Overview

NedAccess uses a **layout + content** pattern for email rendering:

1. **One shared layout** (`template.hbs`) — provides the Nedbank-branded HTML shell (header, accent bar, footer, MSO/IE compatibility, responsive styles).
2. **One content fragment per email type** (e.g. `verify-email-content.hbs`, `offer-made-content.hbs`) — provides only the body of the email.
3. **TypeScript renderer functions** (`emailTemplates.ts`) — load the templates, inject context data, return `{ subject, html, text }`.
4. **A thin delegation layer** (`email.ts`) — exposes `sendXxx()` functions that forward to the external Notifications API.
5. **The Notifications API client** (`notificationsService.ts`) — POSTs payloads to the centralised notifications service which performs the actual sending.

> Important: in production the `.hbs` templates are **also rendered by the external Notifications API**, not by NedAccess itself. NedAccess sends the structured payload to the API; the API uses its own copy of the templates to render and send via SendGrid. The local `emailTemplates.ts` renderers are kept for testing, previews, and any local fallback rendering.

---

## Directory Layout

```
backend/src/services/
├── email.ts                          # Public send API (delegates to Notifications API)
├── emailTemplates.ts                 # Renderers + Handlebars compile + caching
├── notificationsService.ts           # HTTP client for the external Notifications API
└── emailservices/
    ├── template.hbs                  # Shared layout (branded shell)
    └── emails/
        ├── verify-email-content.hbs
        ├── password-reset-content.hbs
        ├── otp-verification-content.hbs
        ├── account-lockout-content.hbs
        ├── account-exists-content.hbs
        ├── account-deleted-content.hbs
        ├── account-restoration-content.hbs
        ├── data-export-ready-content.hbs
        ├── kyc-passed-content.hbs
        ├── kyc-failed-content.hbs
        ├── kyc-validation-failed.hbs
        ├── application-submitted-content.hbs
        ├── application-under-review-content.hbs
        ├── application-processing-content.hbs
        ├── application-completed-content.hbs
        ├── application-approved-content.hbs
        ├── application-rejected-content.hbs
        ├── new-application-admin-content.hbs
        ├── offer-made-content.hbs
        ├── offer-accepted-content.hbs
        ├── offer-declined-content.hbs
        ├── credit-life-lead-content.hbs
        └── income-verification-flagged-content.hbs
```

Naming convention: every content fragment ends in `-content.hbs` (with one exception, `kyc-validation-failed.hbs`). The renderer in `emailTemplates.ts` looks them up by name, so the file name must match the string passed to `loadTemplate(...)`.

---

## How the Layout + Content Pattern Works

### `template.hbs` (the shell)

The layout provides a complete, email-client-safe HTML document with:

- Nedbank green branding (`#006341`, `#10a867`, gradient accents)
- MSO/IE conditional markup for Outlook compatibility
- Responsive media queries for mobile clients
- Web font import (`HelveticaW01-Roman`)
- A header showing `{{emailType}}` (e.g. `"ACCOUNT VERIFICATION"`) and `{{brandName}}`
- A central content slot rendered with `{{{body}}}` (triple-stash so HTML is **not** escaped)
- A footer showing `{{footerText}}`

Key snippet from `template.hbs`:

```handlebars
<p>{{#if emailType}}{{emailType}}{{else}}AUTOMATED EMAIL{{/if}}</p>

<h1>{{#if brandName}}{{brandName}}{{else}}NedAccess{{/if}}</h1>

<div>{{{body}}}</div>

<p>{{#if footerText}}{{footerText}}{{else}}Powered by Nedbank Namibia{{/if}}</p>
```

### Content fragments (`*-content.hbs`)

Each content fragment is a small Handlebars partial containing only the email body. It assumes the layout will wrap it. Example from `verify-email-content.hbs`:

```handlebars
<p>Thank you for registering with NedAccess...</p>

<div style="text-align:center;margin:32px 0;">
  <a href="{{verificationUrl}}" style="...">Verify Email Address</a>
</div>

<p>If the button doesn't work, copy and paste this link:</p>
<div style="...">{{verificationUrl}}</div>
```

Conditional sections use standard Handlebars helpers:

```handlebars
{{#if approvedAmount}}
  <div><strong>Approved Amount:</strong> {{approvedAmount}}</div>
{{/if}}
```

### How they are combined

`emailTemplates.ts → loadTemplate()` compiles **both** files and creates a wrapper that:

1. Renders the content fragment with the data → produces the body HTML.
2. Renders the layout with the same data plus `body: <renderedContent>` → produces the final HTML.

```ts
const compiled = (data: any) => {
  const content = Handlebars.compile(contentTemplate)(data);
  return layoutCompiled({ ...data, body: content });
};
```

Compiled templates are cached in `templateCache: Map<string, HandlebarsTemplateDelegate>` so each template is read from disk and compiled **only once per process**.

---

## Renderer Functions (`emailTemplates.ts`)

Every email type has:

1. A **TypeScript interface** describing the data shape.
2. A **`renderXxx(data)` function** returning `{ subject, html, text }`.

### Standard contract

```ts
export interface MyEmailData {
  email: string;
  /* domain-specific fields */
  emailType?: string;     // header label, e.g. "APPLICATION STATUS UPDATE"
  brandName?: string;     // header brand, default "NedAccess"
  footerText?: string;    // footer, default "Powered by Nedbank Namibia"
}

export async function renderMyEmail(
  data: MyEmailData
): Promise<{ subject: string; html: string; text: string }> {
  const template = loadTemplate('my-email-content');
  const html = template({
    /* domain fields */,
    frontendUrl: data.frontendUrl || config.urls.frontend || config.urls.nextPublicApi,
    emailType: data.emailType || 'DEFAULT LABEL',
    brandName: data.brandName || 'NedAccess',
    footerText: data.footerText || 'Powered by Nedbank Namibia',
  });

  return {
    subject: 'Subject Line',
    html,
    text: 'Plain-text fallback',
  };
}
```

### Three things every renderer must produce

| Field     | Purpose                                                                |
|-----------|------------------------------------------------------------------------|
| `subject` | Email subject line. Often contains dynamic info (product, app id).     |
| `html`    | Full HTML body produced by `template.hbs` + `*-content.hbs`.           |
| `text`    | Plain-text fallback for clients that strip HTML or prefer text.        |

### Branding context helpers

`getEmailContext(userType, productType)` provides default branding values for:

- `userType`: `customer` | `admin` | `partner`
- `productType`: `personal-loan` | `mortgage` | `credit-card` | `business-loan`

Example: `getEmailContext('admin')` returns `{ emailType: 'ADMIN NOTIFICATION', brandName: 'NedAccess Admin', footerText: 'Nedbank Internal System' }`.

This is optional — most renderers hard-code sensible defaults and accept overrides via the data object.

---

## The Send Pipeline

```
caller (route / service)
   │
   ▼
email.ts          ── sendXxx(data)            (utility + delegation layer)
   │
   ▼
notificationsService.ts ── callApi(endpoint, payload)
   │  (POST to https://<api>/email/nedaccess/<endpoint>)
   ▼
External Notifications API
   │  (loads same .hbs templates, renders via Handlebars, sends via SendGrid)
   ▼
Recipient inbox
```

### `email.ts` (delegation layer)

`email.ts` is intentionally thin. It:

- Re-exports the data interfaces from `emailTemplates.ts` so callers don't need to know where they live.
- Exports `sendXxx` functions that map the caller's payload to the Notifications API client.
- Provides utility helpers: `generateVerificationToken()`, `generateVerificationUrl(token)`, `generatePasswordResetUrl(token)`.

```ts
export async function sendEmailVerification(data: {
  email: string;
  verificationUrl: string;
}): Promise<void> {
  await notifications.sendEmailVerification({
    email: data.email,
    verificationUrl: data.verificationUrl,
  });
}
```

### `notificationsService.ts` (API client)

- Loads provider config (`base_url`, encrypted `api_key`) from the `notification_providers` table via `QProviders.getActiveNotificationsApiProvider()`.
- Decrypts the API key using `openSecret()`.
- Caches the config for 5 minutes (`CACHE_TTL_MS`).
- POSTs to `${baseUrl}/email/nedaccess/<endpoint>` with header `X-API-Key: <apiKey>`.
- Each email type maps to a specific endpoint (`verify-email`, `password-reset`, `offer-made`, etc.).

### Why the local renderers still exist

Even though sending goes through the Notifications API:

- The renderers are used for **previews / tests / dev tooling**.
- They guarantee the **payload shape contract** (every field a template needs is in the TS interface).
- They allow a future fallback to direct sending without re-implementing templates.

---

## Available Email Types

| Template                                      | Renderer                       | Send function                        | Trigger                                        |
|-----------------------------------------------|--------------------------------|--------------------------------------|------------------------------------------------|
| `verify-email-content.hbs`                    | `renderEmailVerification`      | `sendEmailVerification`              | New user registration                          |
| `password-reset-content.hbs`                  | `renderPasswordReset`          | `sendPasswordReset`                  | Self-service or admin password reset           |
| `otp-verification-content.hbs`                | `renderOtpVerification`        | `sendOtpVerification`                | Re-authentication / step-up login              |
| `account-lockout-content.hbs`                 | `renderAccountLockout`         | `sendAccountLockoutEmail`            | 5 failed login attempts in 15 min              |
| `account-exists-content.hbs`                  | `renderAccountExists`          | `sendAccountExistsEmail`             | Registration attempt on existing email         |
| `account-deleted-content.hbs`                 | `renderAccountDeleted`         | (via notifications)                  | Account deletion confirmation                  |
| `account-restoration-content.hbs`             | `renderAccountRestoration`     | `sendAccountRestoration`             | Admin restores deleted account                 |
| `data-export-ready-content.hbs`               | `renderDataExportReady`        | (via notifications)                  | GDPR/personal data export ready                |
| `kyc-passed-content.hbs`                      | `renderKycPassed`              | `sendKycPassed`                      | KYC verification successful                    |
| `kyc-failed-content.hbs`                      | `renderKycFailed`              | (via `sendKycCompletionEmail`)       | KYC verification failed                        |
| `kyc-validation-failed.hbs`                   | `renderKycValidationFailed`    | `sendKycValidationFailedEmail`       | KYC data mismatch with declared info           |
| `application-submitted-content.hbs`           | `renderApplicationSubmitted`   | `sendApplicationSubmitted`           | Application submitted by user                  |
| `application-under-review-content.hbs`        | `renderApplicationUnderReview` | `sendApplicationUnderReview`         | Admin starts reviewing application             |
| `application-processing-content.hbs`          | `renderApplicationProcessing`  | `sendApplicationProcessing`          | Offer accepted, loan being processed           |
| `application-completed-content.hbs`           | `renderApplicationCompleted`   | `sendApplicationCompleted`           | Application fully completed                    |
| `application-approved-content.hbs`            | `renderApplicationApproved`    | `sendApplicationApproved`            | Application approved by admin                  |
| `application-rejected-content.hbs`            | `renderApplicationRejected`    | `sendApplicationRejected`            | Application rejected by admin                  |
| `new-application-admin-content.hbs`           | `renderNewApplicationAdmin`    | `sendNewApplicationAdmin`            | New application requires admin review          |
| `offer-made-content.hbs`                      | `renderOfferMade`              | `sendOfferMade`                      | Offer issued to applicant                      |
| `offer-accepted-content.hbs`                  | `renderOfferAccepted`          | `sendOfferAccepted`                  | Applicant accepts offer                        |
| `offer-declined-content.hbs`                  | `renderOfferDeclined`          | `sendOfferDeclined`                  | Applicant declines offer                       |
| `credit-life-lead-content.hbs`                | `renderCreditLifeLead`         | (custom)                             | New credit life insurance lead                 |
| `income-verification-flagged-content.hbs`     | (via notifications)            | `sendIncomeVerificationFlaggedEmail` | Income verification flagged variances          |

---

## Adding a New Email Template

Follow these steps in order. Skipping a step usually means the email won't render or won't send.

### 1. Create the content fragment

Add a new file in `backend/src/services/emailservices/emails/` named `<kebab-case-name>-content.hbs`.

Keep it focused on body content only — **do not include `<html>`, `<head>`, or `<body>` tags** (the layout provides those).

```handlebars
<p>Hi {{firstName}},</p>

<div style="background:#f0fdf4;padding:24px;border-radius:12px;margin:24px 0;border-left:4px solid #10a867;">
  <h3 style="margin:0 0 12px 0;color:#006341;">Reminder Details</h3>
  <p>Your appointment is on {{appointmentDate}} at {{appointmentTime}}.</p>
</div>

{{#if location}}
<p>Location: <strong>{{location}}</strong></p>
{{/if}}

<p style="color:#6b7280;font-size:14px;">If you need to reschedule, please contact us.</p>
```

Style guidelines:
- Use **inline styles** only (email clients strip `<style>` tags inconsistently).
- Re-use the brand palette: `#006341` (primary), `#10a867` (accent), `#e7f7f1` (light accent), `#6b7280` (muted text), `#374151` (body text), `#dc2626` (warnings), `#f59e0b` (info), `#8b5cf6` (offer purple).
- Wrap key info in coloured callout boxes (`background`, `padding`, `border-left`, `border-radius`).
- Keep call-to-action buttons inside `<div style="text-align:center;...">` with min `padding:14px 32px`.

### 2. Add the data interface

In `emailTemplates.ts`, define the shape:

```ts
export interface AppointmentReminderData {
  email: string;
  firstName: string;
  appointmentDate: string;
  appointmentTime: string;
  location?: string;
  emailType?: string;
  brandName?: string;
  footerText?: string;
}
```

Always include the three optional branding fields (`emailType`, `brandName`, `footerText`).

### 3. Add the renderer function

```ts
export async function renderAppointmentReminder(
  data: AppointmentReminderData
): Promise<{ subject: string; html: string; text: string }> {
  const template = loadTemplate('appointment-reminder-content');

  const html = template({
    firstName: data.firstName,
    appointmentDate: data.appointmentDate,
    appointmentTime: data.appointmentTime,
    location: data.location,
    emailType: data.emailType || 'APPOINTMENT REMINDER',
    brandName: data.brandName || 'NedAccess',
    footerText: data.footerText || 'Powered by Nedbank Namibia',
  });

  return {
    subject: `Reminder: Your appointment on ${data.appointmentDate}`,
    html,
    text:
      `Hi ${data.firstName},\n\n` +
      `This is a reminder of your appointment on ${data.appointmentDate} at ${data.appointmentTime}.\n` +
      (data.location ? `Location: ${data.location}\n` : ''),
  };
}
```

The string passed to `loadTemplate(...)` **must match the file name** (without `.hbs`).

### 4. Add a Notifications API endpoint client

In `notificationsService.ts`:

```ts
export async function sendAppointmentReminder(opts: {
  email: string;
  firstName: string;
  appointmentDate: string;
  appointmentTime: string;
  location?: string;
}): Promise<void> {
  await callApi('appointment-reminder', {
    email: opts.email,
    firstName: opts.firstName,
    appointmentDate: opts.appointmentDate,
    appointmentTime: opts.appointmentTime,
    ...(opts.location ? { location: opts.location } : {}),
  });
}
```

> **Coordinate with the Notifications API team**: the endpoint `appointment-reminder` must exist on the API side and the API must have a copy of the same `appointment-reminder-content.hbs` template. The endpoint URL is `${baseUrl}/email/nedaccess/<endpoint>`.

### 5. Add a public send function in `email.ts`

```ts
export async function sendAppointmentReminder(data: {
  email: string;
  firstName: string;
  appointmentDate: string;
  appointmentTime: string;
  location?: string;
}): Promise<void> {
  await notifications.sendAppointmentReminder({
    email: data.email,
    firstName: data.firstName,
    appointmentDate: data.appointmentDate,
    appointmentTime: data.appointmentTime,
    ...(data.location ? { location: data.location } : {}),
  });
}
```

Re-export the interface in the `export type { ... } from './emailTemplates';` block at the top of `email.ts`.

### 6. Use it from a route or service

```ts
import { sendAppointmentReminder } from '../services/email';

await sendAppointmentReminder({
  email: user.email,
  firstName: user.firstName,
  appointmentDate: '15 May 2026',
  appointmentTime: '10:00',
  location: 'Nedbank Independence Avenue Branch',
});
```

Wrap calls in `try/catch` if the route should not fail when notification delivery fails — log the error and continue.

---

## Updating an Existing Template

Because templates are also rendered by the external Notifications API, **changes to `.hbs` files must be deployed to both**:

1. NedAccess backend (this repo).
2. The Notifications API service (separate repo / deployment).

Workflow:

1. Edit the `.hbs` file in this repo.
2. Edit the renderer in `emailTemplates.ts` if new variables are introduced — update the interface and the `template({...})` call.
3. Forward any new fields through `notificationsService.ts` and `email.ts`.
4. Coordinate the same template + endpoint payload changes on the Notifications API.
5. Deploy backend to staging, send a test email, verify rendering.
6. Deploy to production only after explicit approval (per `06-deployment-approval.mdc`).

The local template cache (`templateCache` in `emailTemplates.ts`) is per-process. Restarting `backend-staging` via PM2 clears it automatically — no extra cache flush is required.

---

## Handlebars Reference (Subset Used)

Only a small subset of Handlebars features is used in NedAccess templates:

| Feature                  | Syntax                                | Notes                                      |
|--------------------------|---------------------------------------|--------------------------------------------|
| Variable interpolation   | `{{name}}`                            | HTML-escaped.                              |
| Raw HTML interpolation   | `{{{body}}}`                          | Used only in `template.hbs` for content.   |
| Conditional              | `{{#if hasFoo}}...{{/if}}`            | Truthy check.                              |
| If/else                  | `{{#if x}}A{{else}}B{{/if}}`          | Used in layout for default labels.         |
| Iteration                | `{{#each items}}...{{/each}}`         | Rare; used for KYC mismatch lists.         |

Avoid custom helpers — none are registered. Format dates and currency in TypeScript before passing to the template (see `renderCreditLifeLead` for an example using `toLocaleString('en-NA')`).

---

## Testing & Previewing

### Local rendering

You can render any template directly in a Node REPL or a one-off script in `backend/src/scripts/`:

```ts
import { renderOfferMade } from '../services/emailTemplates';
import fs from 'fs';

const { html } = await renderOfferMade({
  email: 'test@example.com',
  applicationId: 12345,
  productName: 'Vehicle Asset Finance',
  approvedAmount: 'N$ 250,000.00',
  interestRate: '11.5',
  loanTerm: '60',
  monthlyPayment: 'N$ 5,500.00',
  expiresAt: '31 May 2026',
});

fs.writeFileSync('preview.html', html);
```

Open `preview.html` in a browser to inspect.

### Sending a test email

Send through the staging Notifications API by calling the appropriate `sendXxx()` function from a script. **Do not send test emails to real users.** Use a mailbox you control or a sink like `https://www.maildev.email`.

---

## Common Pitfalls

| Symptom                                 | Cause                                                            | Fix                                                              |
|-----------------------------------------|------------------------------------------------------------------|------------------------------------------------------------------|
| `Template <name> not found`             | Filename doesn't match `loadTemplate('<name>')` argument.        | Ensure file is `<name>.hbs` in `emailservices/emails/`.          |
| Email shows literal `{{variable}}`      | Variable not passed to `template({...})` in the renderer.        | Add the field to the data object or the interface.               |
| Email shows escaped HTML in body        | Used `{{body}}` instead of `{{{body}}}` in layout.               | Triple-stash is required for the body slot.                      |
| Layout missing in email                 | Renderer compiled only the content fragment.                     | Always go through `loadTemplate(...)` — never compile directly.  |
| Notifications API 4xx error             | Payload field missing, endpoint mismatch, or invalid API key.    | Check `notificationsService.ts` payload + provider config row.   |
| Old template still rendering            | Process not restarted after deploy → cached compiled template.   | `pm2 restart backend-staging`.                                   |
| Outlook renders email broken            | New layout markup not wrapped in MSO conditionals.               | Keep new structure inside the existing `<!--[if mso]>` blocks.   |

---

## Security Notes

- Never embed secrets, tokens, or passwords in templates — pass only single-use URLs (e.g. `verificationUrl`, `resetUrl`, `setupUrl`).
- Temporary passwords (admin-issued resets) are passed as `temporaryPassword` and **must** force a password change on first login.
- Account-existence emails (`account-exists-content.hbs`) are sent to the **existing** user, not the registrant, to prevent email enumeration.
- All recipient addresses are looked up server-side from `users` / `applications`; the client never tells the backend who to email.
- The Notifications API key is encrypted at rest in `notification_providers.api_key` and decrypted via `openSecret()` only at send time.

---

## Quick Reference

- **Add a new template**: 6 steps — content fragment, interface, renderer, notifications client, send function, caller.
- **Layout file**: `backend/src/services/emailservices/template.hbs`
- **Content fragments**: `backend/src/services/emailservices/emails/*.hbs`
- **Renderers**: `backend/src/services/emailTemplates.ts`
- **Public API**: `backend/src/services/email.ts`
- **HTTP client**: `backend/src/services/notificationsService.ts`
- **Provider config**: `notification_providers` table (active row, type `notifications-api`)
