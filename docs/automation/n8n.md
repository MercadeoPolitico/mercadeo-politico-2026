# n8n automation (prepared, disabled by default)

This project is prepared for **n8n self-hosted** automation via webhooks.

## Webhook endpoints (server-side)

All endpoints are **disabled by default** until `N8N_WEBHOOK_TOKEN` is set.

- `POST /api/webhooks/n8n/content-ingest`
  - Purpose: ingest content payloads (drafts, metadata, attachments references)
  - Current behavior: read-only acknowledge (no DB writes yet)
- `POST /api/webhooks/n8n/marleny-request`
  - Purpose: receive a request to call Marleny SI (black-box)
  - Current behavior: acknowledge; n8n should call `/api/si/marleny` when enabled

## Security / activation

Required header:
- `x-n8n-webhook-token: <token>`

Activation variable:
- `N8N_WEBHOOK_TOKEN`

If `N8N_WEBHOOK_TOKEN` is missing, endpoints respond with **404**.

## Suggested flows (high-level)

1) Content ingestion
- Trigger: n8n webhook → `/api/webhooks/n8n/content-ingest`
- Next: store draft in Supabase (future, read/write gate with RLS)

2) Marleny analysis/generation (human approval gate)
- Trigger: ingestion or scheduled review
- n8n calls `/api/si/marleny` (requires Marleny gateway token)
- Human approval gate (required)
- Publish:
  - Blog (Supabase content)
  - Facebook (Graph API) via official integration (future)

## Platforms

- Facebook: official Graph API only (no scraping)
- Secondary channel: blog is first-class; email adapter can be added later

