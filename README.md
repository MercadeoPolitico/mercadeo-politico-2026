# mercadeo-politico-2026
Marketing Político Digital

Plataforma de mercadeo político digital para **Colombia 2026**, iniciando en la región de **Meta**.

Este proyecto sirve como base técnica, ética y escalable para campañas políticas, con enfoque en educación cívica, visibilidad territorial y comunicación transparente.

---

## Objetivos

- Sitio web público optimizado para SEO
- Sistema de blog para contenido político y educación cívica
- Base para automatización de contenidos (Make en el futuro)
- Comunicación ética, legal y transparente
- Arquitectura preparada para múltiples candidatos

---

## Stack Tecnológico

- Frontend: Next.js (App Router) + TypeScript
- Styling: Tailwind CSS
- Backend / Auth / Data: Supabase
- Hosting Web: Vercel
- Workers (Railway): **habilitado para workers** (sin afectar el deploy web en Vercel)

---

## Aislamiento y cuentas (muy importante)

Este repositorio es **exclusivo** para el proyecto político `mercadeo-politico-2026`.

- No mezclar credenciales, tokens o configuraciones con otros proyectos abiertos en el mismo PC/Cursor.
- Vercel, GitHub y Railway deben apuntar a **las cuentas correctas** de este proyecto.
- No se versionan archivos `.env*` (por seguridad y para evitar cruces de cuentas).

---

## Estructura del Proyecto

---

## PASO I (Producción) — Auth + Roles + SUPER ADMIN + Admin Panel

### 1) Migraciones (Supabase SQL)

Ejecuta en Supabase (SQL Editor o migrations tooling), **en este orden**:

- `supabase/migrations/20260119_000001_step1_profiles_roles_rls.sql`
- `supabase/migrations/20260119000200_politicians_workspace.sql`
- `supabase/migrations/20260119000300_storage_politician_media.sql`
- `supabase/migrations/20260119000350_ai_drafts.sql`
- `supabase/migrations/20260119000400_social_variants_bridge.sql`
- `supabase/migrations/20260119000500_analytics_events_citizen_panel.sql`
- `supabase/migrations/20260119000600_internal_pixel_events.sql`
- `supabase/migrations/20260119000700_analytics_source_n8n.sql`

Incluye:
- `public.profiles` como **source of truth** de roles
- RLS + policies correctas (sin errores de `WITH CHECK`)
- Workspace interno por político + portal móvil de aprobación
- Bucket de Storage `politician-media` (público para embed) con **subida restringida a admins**
- Normalización de redes + variantes + campos de puente aprobación→automatización

### 2) Variables de entorno (Next/Vercel)

Requeridas:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Server-only (no exponer):
- `SUPABASE_SERVICE_ROLE_KEY`
- `POLITICO_SESSION_SECRET`

Opcionales (automatización):
- `N8N_FORWARD_ENABLED="true"`
- `N8N_WEBHOOK_URL`
- `N8N_WEBHOOK_TOKEN`

### 3) Bootstrap del SUPER ADMIN (una sola vez)

Se hace **server-side** con la Admin API de Supabase, sin hardcodear credenciales.

PowerShell (ejemplo):

```bash
$env:NEXT_PUBLIC_SUPABASE_URL="..."
$env:SUPABASE_SERVICE_ROLE_KEY="..."
$env:BOOTSTRAP_SUPER_ADMIN_EMAIL="..."
$env:BOOTSTRAP_SUPER_ADMIN_PASSWORD="..."  # temporal (fuerte)
node scripts/bootstrap-super-admin.mjs
```

Regla: si ya existe un `super_admin` en `public.profiles`, el script no hace nada.

### 4) Admin panel

- Login: `/admin/login`
- Dashboard: `/admin`
- Crear admins (solo super_admin): `/admin/users`
- Workspace por político: `/admin/politicians`

### 5) Portal móvil del político (aprobación)

Desde el workspace del político en `/admin/politicians/[id]`:
- Genera el **enlace exclusivo**
- Envíaselo al político

El político entra por:
- `/politico/access?token=...`

y aprueba/rechaza publicaciones en:
- `/politico/[slug]`


