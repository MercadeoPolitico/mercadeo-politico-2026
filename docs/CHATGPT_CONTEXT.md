## ChatGPT Context — mercadeo-politico-2026 (PRODUCCIÓN)

### Objetivo de este archivo (auto-updatable)
- Reducir prompts largos: copiar/pegar este resumen como “contexto base”.
- Mantener “memoria fría” del proyecto (arquitectura, plataformas, rutas, incidentes comunes).
- **Sin secretos**: nunca incluir valores de `.env.local`/tokens/keys; solo nombres de variables y refs públicos.

---

## Identidad del proyecto
- **Repo**: `mercadeo-politico-2026`
- **Ruta local**: `F:\mercadeo-politico-2026`
- **Stack**: Next.js 16 (App Router) + TypeScript strict + Tailwind
- **Tema/UX**: landing pública “Seguridad Proactiva” + glassmorphism; PWA (manifest + icons).

---

## Plataformas (nombres/IDs)
- **Supabase**
  - **Project ref (ID)**: `adjawofpdxnezbmwafvg`
  - Uso: Auth (email/password), Postgres + RLS, Storage.
- **Vercel**
  - **Vercel Project ID (UI)**: `prj_IB0em6dvzKfyHwYTlf5IY9cd73I6`
  - Uso: hosting web + API routes + (si está habilitado) `vercel.json` crons.
- **Railway**
  - Uso: workers (scheduler/futuros procesos). En este repo existe un worker listo en `workers/`.
  - **Nombre/ID Railway**: (definir en dashboard; no hardcode).
- **n8n**
  - Uso: automatización externa vía webhooks (WAIT mode recomendado).
  - **Instancia n8n (Railway)**: `https://n8n-production-1504.up.railway.app`

---

## Variables de entorno (solo nombres)
**Públicas (Next/Vercel)**:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL` (opcional; canonical/links)

**Server-only (no exponer)**:
- `SUPABASE_SERVICE_ROLE_KEY`
- `POLITICO_SESSION_SECRET`
- `CRON_SECRET` (protege endpoints cron)

**Marleny (AI)**:
- Controlado (recomendado): `MARLENY_AI_ENABLED`, `MARLENY_AI_ENDPOINT`, `MARLENY_AI_API_KEY`
- Gateway black-box (n8n/automation): `MARLENY_ENABLED`, `MARLENY_ENDPOINT`, `MARLENY_TOKEN`, `MARLENY_GATEWAY_TOKEN`

**OpenAI (opcional, para análisis/variantes)**:
- `OPENAI_ENABLED`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_BASE_URL` (opcional)

**n8n forwarding (server-only)**:
- `N8N_FORWARD_ENABLED`
- `N8N_WEBHOOK_URL`
- `N8N_WEBHOOK_TOKEN`
- (docs antiguos mencionan `N8N_WEBHOOK_BASE_URL`; preferir el contrato del repo: `N8N_WEBHOOK_URL`)

**Tokens de automatización (server-only)**:
- `MP26_AUTOMATION_TOKEN` (principal, contrato con n8n)
- `AUTOMATION_API_TOKEN` (legacy fallback)

**Nota**: los valores viven en `.env.local` (local) y en Vercel (Production/Preview/Dev). No versionar `.env*`.

---

## Arquitectura de carpetas (mapa rápido)
- **App (Next)**: `src/app/*`
  - Público:
    - `/` landing (`src/app/page.tsx`)
    - `/candidates` + `/candidates/[slug]` (páginas de candidatos; “senadores” se tratan como nacionales)
    - `/centro-informativo` (feed público de noticias publicadas)
  - Admin:
    - `/admin/login` (login)
    - `/admin` (dashboard)
    - `/admin/users` (solo super_admin crea admins)
    - `/admin/politicians` + `/admin/politicians/[id]` (workspace + marketing hub)
    - `/admin/content` (cola de revisión/edición, publicar a centro informativo)
    - `/admin/marleny-chat` (chat interno)
- **Middleware**: `middleware.ts` (protege `/admin/*` y `/politico/*`)
- **Supabase clients**: `src/lib/supabase/*`
  - `client.ts` browser (solo `NEXT_PUBLIC_*`)
  - `server.ts` SSR cookies (`@supabase/ssr`)
  - `admin.ts` service-role (server-only)
- **Migrations**: `supabase/migrations/*`
- **Worker (Railway)**: `workers/*` (proceso long-lived “safe-by-default”)

---

## Auth + Roles (fuente de verdad)
- **Supabase Auth**: email/password.
- **Roles**: `public.profiles.role` es la única fuente de verdad:
  - `super_admin` (único)
  - `admin`
- **Protección server-side**:
  - `middleware.ts` valida sesión (`supabase.auth.getUser()`) y luego consulta `profiles.role`.
  - Redirecciones con reason:
    - `reason=unauthorized` (no sesión)
    - `reason=forbidden` (sin rol admin/super_admin)
    - `reason=must_change_password`
- **Cambio de contraseña obligatorio**:
  - flag `user.app_metadata.must_change_password === true`
  - UI: `/admin/force-password-change`
- **Login** (IMPORTANTE: cookies):
  - `/api/auth/login` hace `signInWithPassword` server-side para setear cookies SSR.
  - `/api/auth/logout` limpia cookies SSR.
  - `/admin/login` hace navegación completa post-login para evitar “race” de Set-Cookie.

**Scripts de recuperación/bootstrapping (server-side)**:
- `scripts/bootstrap-super-admin.mjs` (crear super admin una sola vez)
- `scripts/reset-super-admin-password.mjs` (reseteo + force change)
  - Lee `.env.local` automáticamente (no imprime secretos; imprime OK/FAILED).

Diagnóstico seguro (sin secrets):
- `GET /api/health/supabase` devuelve presencia de envs + `runtime.supabase_project_ref`.
- `GET /api/health/automation` devuelve si el token de automatización está configurado (solo metadata: longitud, modo).

---

## Datos (Supabase) — tablas clave
- `profiles` (roles)
- `politicians` (workspace por candidato: bio, proposals, toggles)
  - campos relevantes: `office`, `region`, `ballot_number`, `auto_publish_enabled`, `auto_blog_enabled`, `biography`, `proposals`
- `politician_social_links`
- `politician_publications` (contenido interno con estados)
- `politician_access_tokens` (links de acceso al portal del político)
- `ai_drafts` (cola de revisión de contenido generado)
- `citizen_news_posts` (publicación final para `/centro-informativo`)
- `analytics_events` (eventos sin PII; “impacto interpretado”)

Storage:
- bucket `politician-media` (subida restringida a admins; uso de URLs públicas/embeds).

---

## Funcionalidades internas (Admin)
- **Gestión de candidatos**: crear/listar en `/admin/politicians`
- **Workspace por candidato**: `/admin/politicians/[id]`
  - editar biografía / propuestas
  - zona de archivos (Storage)
  - marketing hub
  - toggles:
    - `auto_blog_enabled` (corta cron + generación manual)
    - `auto_publish_enabled` (si se usa, permite publicar/forward automático según lógica)
- **Cola editorial**: `/admin/content`
  - revisa `ai_drafts`, aprueba/edita, y publica a `citizen_news_posts`
- **Chat interno**: `/admin/marleny-chat` (no publica automáticamente)

---

## Funcionalidades públicas
- Landing / navegación: `/`, `/candidates`, `/centro-informativo`, `/about`
- Centro informativo ciudadano: feed de `citizen_news_posts` con RLS de lectura pública para `published`.

---

## Automatización / IA / Noticias
Noticias:
- Fuente: GDELT (`src/lib/news/gdelt.ts`)

Generación (server-side):
- Endpoint cron por candidato:
  - `GET/POST /api/cron/news-blog/[candidateId]` (protegido por `CRON_SECRET`)
  - Respeta `auto_blog_enabled` (si OFF: skip).
  - Prompt incluye: geolocalización, extracto de propuesta, SEO keywords, hashtags.

Marleny:
- Controlado: `src/lib/si/marleny-ai/client.ts` + `/api/automation/generate`
- Gateway: `/api/si/marleny` (para n8n; requiere token de gateway; disabled-by-default)
- Diagnóstico: `GET /api/health/marleny` (sin secrets)

n8n:
- Webhooks preparados (disabled-by-default si falta token):
  - `POST /api/webhooks/n8n/content-ingest`
  - `POST /api/webhooks/n8n/marleny-request`
- Orquestación editorial (n8n como maestro):
  - `GET /api/automation/candidates` (token `x-automation-token`)
  - `POST /api/automation/editorial-orchestrate` (crea `ai_drafts`, fase 1 sin autopublish)
- Smoke tests (producción):
  - Script: `scripts/smoke-prod.mjs`
  - Valida health + `automation/candidates` + `automation/self-test` + `editorial-orchestrate?test=true`.
- Docs: `docs/automation/n8n.md`
- Workflow maestro (importable):
  - `docs/automation/n8n-master-editorial-orchestrator.json`

Vercel crons:
- Config actual: `vercel.json` (crons para `news-blog` en horarios UTC).
  - Nota: si tu plan no permite crons, deshabilitar o mover scheduling a Railway worker.

---

## Incidentes comunes (y dónde mirar)
1) **“Supabase no está configurado…”**
   - Revisar `GET /api/health/supabase` (env present + project ref)
   - Browser client debe usar solo `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` (ver `src/lib/supabase/client.ts`)
2) **Login OK pero vuelve a `/admin/login`**
   - Es cookie/session (race) o falta role:
     - si URL tiene `reason=unauthorized` → no hay sesión/cookie
     - si `reason=forbidden` → `profiles.role` no es admin/super_admin
3) **“Credenciales inválidas”**
   - Password/email incorrectos o reset no aplicado al email correcto.
   - Ejecutar `scripts/reset-super-admin-password.mjs` y leer OK/FAILED.

4) **Automatización responde 401 (unauthorized)**
   - Causa típica: token copiado con espacios/comillas o `\\n` literal al final.
   - Verificar en runtime: `GET /api/health/automation`.
   - Los endpoints `automation/*` ya normalizan token (trim/comillas/`\\n`).

---

## Cómo actualizar este archivo (regla)
- Cada vez que cambies: tablas/migraciones, rutas admin, integraciones (Vercel/Railway/n8n/Marleny), o IDs de proyectos → actualizar este doc.
- Mantenerlo “pegable” a ChatGPT: secciones cortas, sin valores secretos.

