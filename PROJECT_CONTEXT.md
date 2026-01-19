## mercadeo-politico-2026 — Contexto de trabajo (leer antes de tocar el repo)

### Entorno
- **OS**: Windows 10/11
- **Shell**: PowerShell (no usar `&&` para encadenar comandos; usar `;`)
- **Repositorio**: `F:\mercadeo-politico-2026`

### Reglas de seguridad (NO negociables)
- **No exponer secretos**: no imprimir llaves, tokens, passwords ni enlaces privados en logs.
- **TypeScript strict**: no bajar el nivel de strictness.
- **Supabase RLS**: no deshabilitar RLS.
- **Server-side only**: cualquier operación con `SUPABASE_SERVICE_ROLE_KEY` es **solo servidor**.

### Arquitectura actual
- **Next.js 16 (App Router)** + TypeScript
- **Supabase**:
  - Auth (email/password)
  - Postgres + RLS (políticas)
  - Storage (bucket `politician-media`)
- **Admin UI**: `/admin/*`
- **Portal móvil político** (aprobación): `/politico/*`

### Variables de entorno esperadas
- **Públicas (Vercel / Next)**:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Privadas (server-only)**:
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `POLITICO_SESSION_SECRET` (HMAC para cookie del portal móvil)
- **Opcionales automatización**:
  - `N8N_FORWARD_ENABLED="true"`
  - `N8N_WEBHOOK_URL`
  - `N8N_WEBHOOK_TOKEN`
  - (No hay auto-publicación. El envío a n8n es explícito desde el panel admin.)

### Migraciones
- Las migraciones viven en `supabase/migrations/`.
- Aplicar desde Supabase SQL Editor o con Supabase CLI (si está instalado).

