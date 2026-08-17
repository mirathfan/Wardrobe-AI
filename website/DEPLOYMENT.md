# Vercel deployment

This Next.js project is ready for Vercel's zero-configuration framework detection.

## First-time setup

```bash
npm install
npx vercel link
```

The link command creates a local `.vercel` directory. It is intentionally ignored by Git.

## Verify locally

```bash
npm run lint
npm run build
npm run vercel:build
```

`vercel:build` requires the project to be linked first.

## Deploy

```bash
npm run deploy:preview
npm run deploy:production
```

The first command creates a preview deployment. The second promotes a production deployment.

## Environment

`NEXT_PUBLIC_SITE_URL` is optional. When it is not set, the site reads Vercel's automatic deployment URL variables for canonical and social metadata. Set it to the final custom domain after the domain is connected.

`NEXT_PUBLIC_SUPPORT_EMAIL` is required before external beta distribution. It is a public, non-secret contact rendered on the privacy, terms, support, and delete-account pages.

The beta form writes to Google Sheets through the server-only `/api/beta` route. Configure these variables locally in `.env.local` and in Vercel project settings:

- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SHEETS_RANGE`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`

Public site variables:

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPPORT_EMAIL`

Enable the Google Sheets API for the Google Cloud project, create a service account and JSON key, then share the spreadsheet with the service-account email as an Editor. Never expose the private key through a `NEXT_PUBLIC_` variable.

The beta endpoint validates names and email addresses, uses a hidden `company` field as a bot trap, and checks the configured sheet before appending an email. The duplicate check is best-effort; Google Sheets does not provide an atomic unique constraint, so simultaneous identical requests can still race.
