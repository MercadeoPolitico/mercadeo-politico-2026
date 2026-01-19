## DEVELOPMENT_PROTOCOL — mercadeo-politico-2026 (NO reiniciar / NO reconstruir)

### Propósito
Este documento existe para evitar “resets” peligrosos en un proyecto vivo.
Aquí queda explícito **qué ya existe**, **qué NO se debe reconstruir**, y **cómo continuar** sin romper producción.

---

## 1) Qué ya existe (confirmado en el repo)

- **Next.js 16 (App Router)** + **TypeScript strict**
- **Supabase Auth + Postgres + RLS**
- **Roles** por `public.profiles` (`super_admin | admin`) como **fuente de verdad**
  - `super_admin` único forzado por índice parcial
- **Admin panel protegido**:
  - `/admin/login`
  - `/admin` + secciones internas
  - middleware valida sesión + consulta `public.profiles`
- **Cambio de contraseña obligatorio** para usuarios creados con password temporal:
  - `/admin/force-password-change`
- **Generación controlada con Marleny AI** (server-side):
  - `/api/automation/generate` (una llamada por request, sin auto-publicación)
- **Forward controlado a n8n** (WAIT mode):
  - `/api/automation/submit` (solo admin o token)
- **Workspace por político**:
  - Tablas: `politicians`, `politician_social_links`, `politician_publications`, `politician_access_tokens`
  - Admin UI: `/admin/politicians` y `/admin/politicians/[id]`
- **Portal móvil del político (aprobación)**:
  - `/politico/access?token=...` → set cookie segura
  - `/politico/[slug]` (aprueba/rechaza)
  - **NO auto-envío** a n8n desde el portal (por seguridad)
  - Incluye **Panel de Seguimiento Ciudadano** (solo lectura, sin cifras)

---

## 2) Qué NO se debe reconstruir

- No duplicar auth/roles fuera de `public.profiles`.
- No mover `/admin/*` a otro patrón de rutas.
- No crear un segundo “rol system” basado en `app_metadata`.
- No deshabilitar RLS “para probar rápido”.
- No crear “posting automático” sin fase explícita y aprobaciones.

---

## 3) Cómo se habilita automatización (sin publicar)

### Marleny AI
Requiere (server-only):
- `MARLENY_AI_ENABLED="true"`
- `MARLENY_AI_ENDPOINT`
- `MARLENY_AI_API_KEY`

### n8n forwarding (WAIT)
Requiere (server-only):
- `N8N_FORWARD_ENABLED="true"`
- `N8N_WEBHOOK_URL`
- `N8N_WEBHOOK_TOKEN`

**Regla**: aunque exista forwarding, el sistema **no publica** ni agenda redes sociales en esta fase.

---

## 4) Operación semanal (para demostrar valor a candidatos)

- Admin genera contenido (incluye variantes FB/IG/X) en `/admin/content`
- Admin crea publicaciones en `/admin/politicians/[id]` (con variantes + media)
- Político aprueba en su celular (`/politico/access?token=...`)
- Admin presiona “Enviar a automatización” (n8n recibe y se queda en WAIT)
- El político ve el **Panel de Seguimiento Ciudadano** actualizado a partir de eventos reales (aprobación + envío a n8n)

---

## 5) Checklist antes de hacer merge/deploy

- `npm run build` pasa
- No se agregan logs con secretos
- No se modifica RLS para “debug”
- Migraciones nuevas son idempotentes y no rompen tablas existentes

