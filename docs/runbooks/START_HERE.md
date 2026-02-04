## START HERE — mercadeo-politico-2026 (operación)

### Reglas Cursor (evitar errores de build y push)
- **Server-only vs Client:** `.cursor/rules/mp26-core.mdc` y `mp26-next-app.mdc`: no importar módulos `server-only` desde `"use client"`; usar módulos client-safe para tipos/funciones puras compartidas.
- **OAuth/Connect (build Vercel):** `.cursor/rules/mp26-oauth-connect.mdc`: en rutas Connect con `"use client"` importar solo desde `@/lib/oauth/provider-keys`, nunca desde `@/lib/oauth/providers`. Evita el error Turbopack `'server-only' cannot be imported from a Client Component`.
- **Git push (Windows):** Si falla con `protocol error: bad line length character: Micr`, ver `docs/runbooks/RECONNECT.md` (GIT_SSH_COMMAND).
- **Params en rutas dinámicas:** Next.js 15+: `params` es Promise; hacer `await params` en Server Components; en Client usar `useParams()`.
- **Archivos TSX/JSX:** No usar comillas escapadas (`\"`) en el código fuente; usar comillas normales (`"`). Si un archivo tiene `\"use client\"` en lugar de `"use client"`, el build falla con "Unterminated string constant".

### Admin → n8n/Redes — candidato del enlace OAuth
En "Agregar destino social" y "Conectar redes por enlace (OAuth)" el **candidato seleccionado está sincronizado**: al cambiar el candidato en uno de los dos desplegables, el otro se actualiza. Así el enlace OAuth generado corresponde siempre al candidato que ves seleccionado (evita que el enlace “vuelva” a otro candidato).

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

### Centro Informativo — imágenes que no cambian
El feed lee de Supabase (`citizen_news_posts`). Las imágenes **solo cambian** cuando se borran los posts y se regeneran con la API desplegada. Ver `docs/runbooks/CI_REGENERATE.md`: ejecutar `npm run ci:purge-regenerate` con `MP26_BASE_URL` apuntando a producción, o llamar `POST /api/automation/ci-purge` y luego el script con `CI_SKIP_PURGE=1`.

### Fotos de candidatos (placeholder)
Las fotos se sirven desde Storage (`politician-media/{id}/profile/profile`). Si no hay archivo, se muestra SVG placeholder. La URL incluye `updated_at` para cache-bust tras subir/borrar foto en Admin → Políticos. Si un candidato muestra placeholder, subir foto en Admin → Políticos → [candidato] → Foto.

### Auto-publicación — primera ejecución
Candidatos con `last_auto_blog_at` null se consideran "due" en la primera ejecución del cron (Railway Worker). Tras el primer trigger se respeta la cadencia (`auto_blog_every_hours`, default 8).

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

**Sincronizar env desde .env.local (sin imprimir secretos):**
- **Vercel:** `npm run vercel:sync-env` — requiere `VERCEL_TOKEN` en `.env.local`. Sincroniza NEXT_PUBLIC_SITE_URL, MP26_AUTOMATION_TOKEN, CRON_SECRET, Supabase, OAuth (Meta/X) y OAUTH_TOKEN_ENCRYPTION_KEY. Usa API de Vercel (no CLI).
- **Railway Worker:** `npm run railway:sync-worker-env` — usa CLI `railway` del proyecto (`npx railway`; devDependency `@railway/cli`). Requiere `railway link` al servicio Worker (ver RECONNECT.md §3). Sincroniza MP26_BASE_URL y CRON_SECRET.

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
- **Todas las conexiones:** `npm run verify:connections` (Vercel, Supabase, Railway keepalive, n8n).
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

### Meta: Página de Facebook "Centro Informativo Ciudadano"
- Una sola Página recibe las publicaciones automáticas; el enlace apunta siempre al Centro Informativo del sitio.
- Runbook: `docs/runbooks/META_CENTRO_INFORMATIVO_FACEBOOK.md`.
- En Vercel: `N8N_WEBHOOK_URL_CENTRO_FACEBOOK`. En n8n: `FACEBOOK_CENTRO_PAGE_ID`, `FACEBOOK_CENTRO_PAGE_TOKEN`. Workflow: `docs/automation/n8n-centro-informativo-facebook.json`.

