# n8n on Railway (MP26)

This folder exists to make our n8n Railway deployment **reproducible**.

## Why a custom Dockerfile?

Railway persistent volumes are often mounted **root-owned**, while upstream `n8nio/n8n` runs as a **non-root** user.
That can cause startup crashes like:

- `EACCES: permission denied, open '/data/.n8n/config'`

To avoid this class of failures, `railway/n8n/Dockerfile` runs n8n as `root` on Railway.

## Required Railway variables (minimum)

- `N8N_USER_FOLDER=/data`
- `N8N_LISTEN_ADDRESS=0.0.0.0`
- `N8N_PORT=5678`
- `N8N_PROTOCOL=https`
- `N8N_EDITOR_BASE_URL=https://<your-domain>` (include scheme!)
- `N8N_PUBLIC_API_DISABLED=false` (required for `/api/v1/*` automation)

## Make workflow setup automatic (recommended)

Set these in Railway (or locally in `.env.local` for CLI usage):

- `N8N_API_KEY`
- `N8N_WEBHOOK_URL`

Then run from this repo:

```bash
npm run n8n:ensure
```

If your n8n is protected with Basic Auth, also set:

- `N8N_BASIC_AUTH_ACTIVE=true`
- `N8N_BASIC_AUTH_USER=...`
- `N8N_BASIC_AUTH_PASSWORD=...`

