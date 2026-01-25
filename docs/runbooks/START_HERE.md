## START HERE — mercadeo-politico-2026 (operación)

### Objetivo
Dejar el sistema **deployado y estable** en:
- Vercel (app)
- Supabase (DB/Auth/Storage)
- Railway (n8n + worker)
- GitHub (repositorio)

---

## 1) Estado actual (verificado localmente)
- Build/lint OK.
- Scheduler recomendado: **Railway Worker** (evita límites de Vercel Cron).
- Supabase project ref (desde `.env.local`, safe): `adjawofpdxnezbmwafvg`.
 - Supabase CLI (local) ya quedó **linkeado** al project ref y puede aplicar migraciones remotas.

### Si estás “reconectando” (sesión nueva / CLIs raros)
Ver: `docs/runbooks/RECONNECT.md` (Docker logout/login, Chrome vs Edge, PowerShell commands).

---

## 2) Variables mínimas (sin valores)
### App (Vercel)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
- `MP26_AUTOMATION_TOKEN`
- `N8N_FORWARD_ENABLED="true"`
- `N8N_WEBHOOK_URL`
- `N8N_WEBHOOK_TOKEN`

### Worker (Railway)
- `MP26_BASE_URL` (URL pública de Vercel)
- `CRON_SECRET`

### GitHub Actions (keepalive redundante)
- `MP26_KEEPALIVE_URL`
- `MP26_CRON_SECRET`

---

## 3) Migraciones Supabase
Las migraciones clave del stack ya están en el repo y deben existir en el remoto:
- `20260124000800_news_subtitle.sql`
- `20260124000900_rss_health_and_region_otra.sql`
- `20260124001000_social_auth_trazabilidad.sql`
- `20260124001100_politicians_last_auto_blog_at.sql`
- `20260124193000_auto_publish_default_on.sql`
- `20260126090000_social_destinations_routing_fields.sql`
- `20260127000100_ai_drafts_indexes.sql` (performance)

Verificación rápida:
- `npx supabase migration list --linked`

---

## 4) Verificación rápida (post-deploy)
- `GET /api/health/supabase` → ok true + env booleans
- `GET /api/cron/keepalive` (con Bearer CRON_SECRET) → ok true
- Admin:
  - `/admin/content` → AUTO ON/OFF visible
  - `/admin/networks` → RSS + señal + “Generar enlace (copiar)”
  - `/autorizar?token=...` → aprobar/rechazar registra trazabilidad

### n8n (webhook de publicación)
- El backend envía a n8n con header `x-n8n-webhook-token`.
- Si el webhook responde **404**, normalmente significa:
  - el workflow no está importado/activo en esa instancia, o
  - el path del webhook no coincide.
  Solución recomendada: importar/activar el workflow desde el repo (ver `docs/automation/n8n-master-editorial-orchestrator.md`).

