# Manual del Administrador — mercadeo-politico-2026

## Acceso y roles
- **Admin / Super Admin**: acceso total al panel interno (`/admin`).
- **Político**: acceso limitado vía **enlace exclusivo** (generado en el workspace del candidato).

## 1) Ingresar al Admin Panel
1. Ve a `/admin/login`.
2. Inicia sesión con tu email/password.
3. Si te aparece “cambio de contraseña obligatorio”, completa `/admin/force-password-change`.

## 2) Dashboard (estado del sistema)
En `/admin` verás indicadores de estado:
- **Synthetic Intelligence (Actuation)**: Marleny AI.
- **Synthetic Intelligence (Volume)**: OpenAI (apoyo).
- **n8n forwarding**: si el envío hacia n8n está habilitado.

## 3) Gestión de candidatos (workspaces)
1. Ve a `/admin/politicians`.
2. Entra al workspace del candidato: `/admin/politicians/[id]`.

En el workspace puedes:
- **Editar perfil**: biografía, propuestas, número de tarjetón.
- **Guardar cambios**: botón “Guardar cambios/Guardar perfil”.
- **Auto-blog** (ON/OFF): habilita o detiene generación automática de borradores.
- **Auto-publicación** (ON/OFF): habilita la publicación automática donde aplique (solo si hay integraciones configuradas).

## 4) Marketing Hub (archivos + generación)
En el workspace del candidato:
- **Zona de archivos**:
  - Sube imágenes, videos o PDFs al bucket `politician-media`.
  - Copia el URL público para usarlo en publicaciones o como referencia.
- **Generación de blogs**:
  - “Generar blog automático (noticias)” crea un borrador (cola `ai_drafts`) usando noticias por geolocalización.
  - “Orquestación editorial (n8n/2-AI)” crea un borrador completo con variantes por plataforma (blog / facebook / x / reddit) y SEO.

## 5) Cola editorial (revisión humana)
En `/admin/content`:
1. Selecciona un borrador de la lista.
2. Revisa y edita:
   - Texto principal (blog)
   - Variantes (facebook / instagram / x), si existen
3. Acciones:
   - **Aprobar**: cambia el estado a `approved`.
   - **Publicar en Centro informativo**: publica en `/centro-informativo` (solo para `blog` y si está `approved` o `edited`).
   - **Enviar a n8n (WAIT)**: envía el borrador aprobado a n8n para flujos externos (publicación, scheduling, etc.).

## 6) Publicaciones en redes (manual y autorizado)
El sistema funciona así (sin guardar tokens en la app):
- La app **no guarda credenciales** de redes sociales.
- **n8n guarda las credenciales** (conectores oficiales) y recibe el contenido desde la app.

### Flujo recomendado (gobernado, seguro)
1. Admin genera y aprueba un borrador en `/admin/content`.
2. Admin crea publicaciones por red desde el workspace del candidato (`/admin/politicians/[id]` → sección “Publicaciones”).
3. El político (opcional) aprueba desde su enlace exclusivo.
4. Cuando una publicación está `approved`, el admin puede presionar **“Enviar a automatización”**:
   - Se envía a n8n con `platform`, `content`, `variants` y `media_urls`.

### Qué redes están soportadas “por diseño”
Depende de lo que esté configurado en n8n, pero el sistema ya maneja el concepto de `platform`:
- `facebook`, `instagram`, `threads`, `tiktok`, `x`, `youtube`
- Se puede extender a otras redes si n8n tiene nodo/credencial.

### Checklist: cómo conectar redes en n8n (paso a paso)
**Idea clave**: el Admin Panel decide *qué* y *a qué red* enviar; **n8n** guarda credenciales y ejecuta la publicación.

#### A) Preparación (una sola vez)
1. Entra a tu n8n (Railway): `https://n8n-production-1504.up.railway.app`
2. Importa el workflow maestro si aún no lo hiciste:
   - Archivo: `docs/automation/n8n-master-editorial-orchestrator.json`
3. Verifica el webhook de recepción (publicación):
   - El backend envía a `WEBHOOK_URL/N8N_WEBHOOK_URL` con header `x-n8n-webhook-token`.
   - En n8n, el Webhook debe validar ese token (o usar el header como “shared secret”).

#### B) Conectar cada red (credenciales)
En n8n ve a **Credentials** → **New**, y crea las credenciales por red (según disponibilidad en tu n8n).

- **Facebook (Pages)**:
  - Recomendado: nodo Facebook/Graph (o HTTP Request a Graph API).
  - Necesitas: App de Meta + permisos para publicar en Page + Page Access Token.
  - Publicación típica: post en Page (texto + link al `Centro Informativo Ciudadano`).

- **Instagram (Business/Creator)**:
  - Recomendado: Instagram Graph API (requiere cuenta Business/Creator conectada a Page).
  - Flujo típico: crear “media container” → publicar.
  - Nota: IG no publica “solo texto” como X; requiere media o carrusel.

- **X (Twitter)**:
  - Recomendado: nodo X/Twitter (o HTTP Request API v2).
  - Necesitas: App + OAuth (según el plan de X).
  - Respeta 280 caracteres o mini-hilo (si tu workflow lo implementa).

- **Threads**:
  - Si tu n8n no trae nodo: usar **HTTP Request** al API de Threads (Meta).
  - Requiere: credenciales Meta/Threads y permisos correspondientes.
  - Si no está disponible, puedes degradar a “publicar en Instagram” (opción común).

- **Telegram**:
  - Recomendado: nodo Telegram.
  - Necesitas: Bot token + Chat ID / canal.
  - Ideal para “canal oficial” y grupos comunitarios.

- **WhatsApp**:
  - Recomendado: WhatsApp Business Cloud API vía **HTTP Request**.
  - Nota: WhatsApp no es “red pública” en el mismo sentido; es mensajería. Úsalo para listas/broadcast autorizadas.

- **YouTube**:
  - Recomendado: nodo YouTube (para subir video o publicar en Community si aplica).
  - Para “post de texto”, normalmente se usa **Community** (si el canal la tiene habilitada).

- **LinkedIn**:
  - Recomendado: nodo LinkedIn (o HTTP Request).
  - Útil para audiencia institucional y “programa/gestión”.

- **Reddit**:
  - Recomendado: nodo Reddit (o HTTP Request).
  - Útil para publicaciones “tipo foro” con enfoque analítico.

#### C) Regla de gobierno (muy importante)
1. El admin **aprueba** el contenido en `/admin/content`.
2. Luego el admin puede:
   - **Publicar a redes (n8n)** desde `/admin/content` (elige redes y envía), o
   - Crear una **publicación** en el workspace del candidato y enviarla a automatización.
3. n8n debe publicar SOLO si:
   - recibe un `platform` válido
   - el token de webhook es válido
   - hay credenciales configuradas para esa red

#### D) Prueba rápida (recomendada)
1. En `/admin/content`, abre un borrador `approved`.
2. Marca 1 red (ej. `x`) y presiona **“Publicar a redes (n8n)”**.
3. En n8n, revisa el Execution log del webhook y confirma:
   - el payload llegó
   - se seleccionó el branch correcto por `platform`
   - la red publicó (o quedó registrado el error del conector)

## 7) Auto-publicación (cuando está habilitada)
Si activas **Auto-publicación** en el perfil del candidato:
- La automatización puede crear/publicar contenido sin aprobación manual (según workflow).
- Úsalo solo cuando:
  - las redes estén conectadas en n8n
  - haya un proceso editorial definido

## 8) Diagnóstico rápido (sin secretos)
Útil cuando “no publica” o “no crea drafts”:
- `GET /api/health/supabase`
- `GET /api/health/marleny`
- `GET /api/health/openai`
- `GET /api/health/automation` (token de automatización configurado, sin exponerlo)

## 9) Smoke test (verificación automática)
En el repo existe un script que prueba producción:
- `scripts/smoke-prod.mjs`

Valida:
- health checks
- `GET /api/automation/candidates`
- `GET /api/automation/self-test` (inserta 1 draft de prueba)
- `POST /api/automation/editorial-orchestrate?test=true` (inserta 1 draft de prueba)

> Nota: requiere que el token esté en `.env.local` o en variables de entorno del shell.

