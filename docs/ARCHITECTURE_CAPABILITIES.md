# Arquitectura y capacidades — mercadeo-politico-2026

Documento “sin secretos” para entender el sistema completo: qué hace, cómo se opera y cómo se integra.

## 1) Resumen ejecutivo
- **Propósito**: comunicación política digital **ética y gobernada** para Colombia 2026.
- **Superficie pública**: landing, candidatos, centro informativo ciudadano, principios editoriales.
- **Superficie interna**: Admin Panel para control editorial, automatización y operación.
- **Automatización**: n8n como motor de ejecución (credenciales y conectores), mientras la **fuente de verdad** es Supabase + Next.js.

## 2) Componentes principales
- **Next.js (App Router) + TypeScript** (`src/app/*`)
  - UI pública
  - Admin Panel
  - APIs server-side (`/api/*`)
  - Middleware de seguridad
- **Supabase (Postgres + Auth + Storage)**
  - Datos de candidatos, borradores, publicaciones, auditoría y trazabilidad
  - Roles (admin / super_admin) y políticas de acceso (RLS donde aplica)
- **Vercel**
  - Hosting del sitio (público + admin)
  - Endpoints server-side
  - Health checks y cron (según configuración)
- **Railway**
  - **n8n** (automatización y publicación a redes)
  - **Worker** (scheduler resiliente: keepalive y auto-blog)
- **GitHub**
  - Repositorio y CI (ej. keepalive redundante con schedule)

## 3) Flujos “end-to-end” (lo importante)

### 3.1 Centro Informativo Ciudadano (público)
1) El sistema genera contenido (automático o por revisión).
2) Publica en `citizen_news_posts` con `status="published"`.
3) La página pública `/centro-informativo` muestra el feed.

**Garantías**:
- Sin métricas visibles, sin PII en la UI pública.
- Cuando hay fuente, se muestra enlace.

### 3.2 Cola editorial (admin)
1) La automatización crea borradores en `ai_drafts` (estado de revisión).
2) Admin revisa/edita y decide publicar.
3) Al publicar, el contenido se envía al Centro Informativo y, si aplica, a n8n para redes (solo destinos autorizados).

### 3.3 Autorización de redes por enlace (sin secretos en UI)
1) Admin registra un destino social.
2) El sistema genera un enlace temporal `/autorizar?token=...`.
3) El dueño abre el enlace y aprueba/rechaza.
4) Se registra trazabilidad (quién/cuándo/ip/user-agent) y cambia el estado del destino.

### 3.4 Publicación a redes (n8n)
1) Next.js genera variantes por red.
2) Next.js envía a n8n un payload con:
   - variantes por plataforma
   - destinos aprobados/activos
3) n8n publica con credenciales oficiales (guardadas en n8n, no en el Admin Panel).

## 4) Seguridad / compliance (alto nivel)
- **No secretos en UI**: el Admin Panel no almacena tokens OAuth de redes.
- **Tokens de autorización**:
  - expiración
  - hash en DB (no texto plano)
- **Webhooks**:
  - token server-to-server
- **Auditoría**:
  - eventos/decisiones claves registradas (según tablas de trazabilidad)

## 5) Resiliencia / anti-sleep
- Endpoint protegido: `GET /api/cron/keepalive`
  - ping mínimo a Supabase (server-side)
  - ping HTTP opcional a servicios externos (n8n/worker/etc.)
- Dos capas:
  - Worker (Railway)
  - GitHub Actions (schedule) como redundancia

Ver runbook: `docs/runbooks/KEEPALIVE.md`.

## 6) Operación diaria (sin tecnicismos)
- **Admin** opera desde:
  - `/admin/content` (cola editorial, publicación, auto on/off)
  - `/admin/networks` (RSS, destinos, enlaces de autorización)
- **Ciudadanía** ve:
  - `/` (landing)
  - `/candidates` + perfiles
  - `/centro-informativo`
  - `/about`

## 7) Capacidad del sistema (qué soporta)
- Múltiples candidatos en paralelo.
- Publicación gobernada con cola editorial.
- Ruteo multi-plataforma a través de n8n (extensible por credenciales/nodos).
- Trazabilidad de autorización de redes.
- Scheduler resiliente (anti-sleep) y smoke tests de producción.

## 8) Smoke tests (operación segura)
- `npm run smoke:prod`: valida health + endpoints de automatización (sin imprimir secretos).
- `npm run smoke:n8n`: valida conectividad n8n + ensure workflow (requiere Public API habilitado en n8n).

## 9) Limitaciones conocidas (intencionales)
- Sin auto-publicación “ciega”: siempre hay gobernanza (controles por candidato/global).
- Publicación a redes depende de credenciales oficiales configuradas en n8n.
- La UI pública evita mostrar datos sensibles o métricas que puedan incentivar manipulación.

