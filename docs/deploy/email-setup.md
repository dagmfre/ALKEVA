# Email setup (SMTP)

ALKEVA sends transactional email — deposit credits, payout status, KYC
decisions, freeze notices, price alerts, order receipts, password resets, and
delivery updates — through any plain SMTP relay. Unset SMTP means every
notification is still **recorded** as an in-app row (`status: queued`) and
delivery is skipped; email is never the reason money code fails.

## Recommended free tier: Brevo

1. Create a free account at brevo.com (300 emails/day free).
2. Dashboard → SMTP & API → SMTP tab. Note the values:
   - Host: `smtp-relay.brevo.com`
   - Port: `587`
   - Login: the account email shown there (`SMTP_USER`)
   - Password: the generated SMTP key (`SMTP_PASS` — not your Brevo login password)
3. Set the env five on **both** the Vercel API project and the Render worker
   (the worker sends price-alert mail directly):

```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=<brevo login>
SMTP_PASS=<brevo smtp key>
MAIL_FROM=ALKEVA <no-reply@yourdomain.com>
```

4. Deliverability: add the SPF/DKIM records Brevo shows for your sending
   domain. Until the client's real domain exists, `MAIL_FROM` can stay a
   placeholder — mails deliver but may land in spam.

Gmail app-password works identically (`smtp.gmail.com`, port 587, app
password) for testing, with Gmail's own daily caps.

## What the emails look like

Every template renders inside one branded frame
(`packages/shared/src/email-layout.ts`): white body, charcoal header band with
the ALKEVA wordmark over a gold `#d4a017` rule, bilingual footer, plus a
plain-text part for deliverability. The copy itself lives in
`packages/shared/src/email-templates.ts` — the single source both the API and
the worker send from, bilingual (am/en) per the recipient's locale.

Light layout on purpose: dark-mode email rendering is client-dependent
(Gmail inverts colors, Outlook doesn't), so the mail commits to one look.
