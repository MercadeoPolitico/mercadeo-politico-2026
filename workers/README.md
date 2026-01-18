# Workers (Railway) — placeholder

This folder is reserved for future background workers (e.g., scheduled jobs, content ingestion, automation hooks).

## What exists now

This directory is now a **real, Railway-ready worker package** (Node + TypeScript) that can run as a long-lived process.
It is intentionally safe-by-default:
- No service-role key usage
- No database writes / mutations
- No logging of secrets

## How to run locally (optional)

From the repo root:

```bash
cd workers
npm install
npm run build
npm start
```

## How to set up in Railway (no deploy changes to the web app)

Create a Railway service that points to this repository and configure:
- **Root Directory**: `workers`
- **Build Command**: `npm run build`
- **Start Command**: `npm start`

Environment variables (same names as the web app; do not print values):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

> This worker is the foundation for future scheduled jobs and the content pipeline.

