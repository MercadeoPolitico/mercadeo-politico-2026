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

> Importante: el CLI de Supabase en esta máquina está autenticado a otra org/proyecto. No ejecutar migraciones hasta autenticar en la org correcta.

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
Aplicar las migraciones nuevas (por SQL Editor o por CLI) para que todo funcione:
- `20260124000800_news_subtitle.sql`
- `20260124000900_rss_health_and_region_otra.sql`
- `20260124001000_social_auth_trazabilidad.sql`
- `20260124001100_politicians_last_auto_blog_at.sql`

---

## 4) Verificación rápida (post-deploy)
- `GET /api/health/supabase` → ok true + env booleans
- `GET /api/cron/keepalive` (con Bearer CRON_SECRET) → ok true
- Admin:
  - `/admin/content` → AUTO ON/OFF visible
  - `/admin/networks` → RSS + señal + “Generar enlace (copiar)”
  - `/autorizar?token=...` → aprobar/rechazar registra trazabilidad

