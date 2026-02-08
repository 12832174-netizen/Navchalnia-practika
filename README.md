# Navchalnia Practika

## Local setup

1. Install dependencies:
   `npm ci`
2. Create local environment file:
   `cp .env.example .env`
3. Fill in values in `.env`.
4. Run the app:
   `npm run dev`

## Environment variables

- `VITE_SUPABASE_URL`: your Supabase project URL.
- `VITE_SUPABASE_ANON_KEY`: public anonymous key for client-side access.

## Secrets policy

- Never commit `.env` or any `.env.*` files.
- Commit only `.env.example` with placeholders.
- Keep real credentials in GitHub:
  `Settings -> Secrets and variables -> Actions`.
- If a secret is exposed, rotate it immediately in the provider console.

## CI

GitHub Actions workflow is defined in `.github/workflows/ci.yml` and runs:

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=high`
