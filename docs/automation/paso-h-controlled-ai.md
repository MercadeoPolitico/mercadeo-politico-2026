# Paso H — Controlled AI + Automation (production-safe)

Goal:
Web (Next.js) → Marleny AI (on-demand) → n8n (store + WAIT) → Human review → (future publish)

Non-negotiables:
- No auto-publish
- No background jobs
- One AI call per request
- Cost-aware limits
- Disabled by default

## Server endpoints

### 1) Generate (AI call happens here)
`POST /api/automation/generate`

Auth:
- Requires header `x-automation-token`
- Enabled only when `AUTOMATION_API_TOKEN` exists

Body:
```json
{
  "candidate_id": "string",
  "content_type": "proposal|blog|social",
  "topic": "string",
  "tone": "string (optional)"
}
```

Behavior:
- Validates + enforces size limits
- Makes exactly ONE call to Marleny AI if enabled/configured
- Returns generated text + token estimate
- Does NOT store or forward automatically

### 2) Submit to n8n (store + WAIT)
`POST /api/automation/submit`

Auth:
- Requires header `x-automation-token`
- Forwarding is OFF unless `N8N_FORWARD_ENABLED="true"`

Body:
```json
{
  "candidate_id": "string",
  "content_type": "proposal|blog|social",
  "generated_text": "string",
  "token_estimate": 123,
  "created_at": "ISO string",
  "source": "web"
}
```

Behavior:
- No AI calls
- Forwards payload to n8n webhook (if enabled)
- n8n must: Receive → Store → WAIT (human approval) → STOP

## Environment variables (names only)

Required to enable endpoints:
- `AUTOMATION_API_TOKEN`

Required to enable Marleny AI call:
- `MARLENY_AI_ENABLED` (set to `"true"`)
- `MARLENY_AI_API_KEY`
- `MARLENY_AI_ENDPOINT`

Required to enable n8n forwarding:
- `N8N_FORWARD_ENABLED` (set to `"true"`)
- `N8N_WEBHOOK_URL`
- `N8N_WEBHOOK_TOKEN`

## Supabase tables (draft)
See `supabase/schema.sql`:
- `ai_drafts` for human review queue (store-only)
- `automation_runs` and `si_events` for audit trail

