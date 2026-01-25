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
- **Automatización**: el control **global** de auto-blog/autopublicación está en **Admin → Contenido** (toggle “AUTO ON/OFF”).
  - En el workspace solo se ve el estado actual del candidato (referencial).

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
0. **Auto-blog/autopublicación (global)**:
   - Toggle arriba a la derecha: **AUTO ON/OFF**.
   - Cuando está ON: el sistema genera y publica **1 noticia por político cada 4 horas** (y envía a redes aprobadas vía n8n).
1. Selecciona un borrador de la lista.
2. Revisa y edita:
   - Texto principal (blog)
   - Variantes (facebook / instagram / x), si existen
3. Acciones:
   - **Aprobar**: cambia el estado a `approved`.
   - **Publicar en Centro informativo**: publica en `/centro-informativo` (solo para `blog` y si está `approved` o `edited`).
   - **Enviar a redes (auto)**: envía el borrador a n8n usando `metadata.destinations` (solo redes **approved** + **active**). n8n ejecuta publicación por red, sin decisiones editoriales.

### Subtítulo editorial (automático)
En cada noticia publicada:
- **Título**: no menciona al candidato.
- **Subtítulo**: sí muestra `Nombre · Cargo · Eje…` y aparece debajo del título.

## 6) Publicaciones en redes (manual y autorizado)
El sistema funciona así (sin guardar tokens en la app):
- La app **no guarda credenciales** de redes sociales.
- **n8n guarda las credenciales** (conectores oficiales) y recibe el contenido desde la app.

## 6.1) n8n / Redes (torre de control)
Ruta: `/admin/networks`

### A) Destinos sociales (autorización por enlace)
1. Crea un destino social (candidato + red + URL del perfil/página).
2. El sistema genera un **enlace copiable** (se pega en WhatsApp).
3. El dueño abre `/autorizar?token=...` y **aprueba o rechaza**.
4. El Admin Panel muestra estado con “señal” (verde/amarillo/rojo) y registra:
   - quién autorizó (nombre; email/whatsapp opcional)
   - cuándo autorizó

Acciones:
- **Generar enlace (copiar)**: crea un nuevo enlace (expira en 5 horas).
- **Revocar**: desactiva la autorización.

> Nota: el admin **no ve** ni elige “credential_ref”; el sistema resuelve credenciales internamente por red.

### A.1) Conexión OAuth por enlace (Meta / X)
En la misma página (`/admin/networks`), abajo existe un bloque:
- **“Conectar redes por enlace (OAuth)”**

Flujo:
1) El Admin selecciona **red** (solo aparecen las configuradas en el servidor) y **candidato**.
2) Click **“Generar enlace OAuth (copiar)”**.
3) Envía el link por WhatsApp al dueño.
4) El dueño acepta permisos en su app oficial.
5) El sistema guarda tokens **cifrados** y registra automáticamente destinos “approved” para publicación.

Notas:
- Meta conecta **Pages** y, si aplica, detecta y registra **Instagram Business** (si está vinculado a la Page).
- Threads depende de configuración/permiso del API; se puede activar más adelante según el proveedor.

### B) Fuentes RSS (gestionables por admin)
En la misma pestaña puedes:
- **Agregar** RSS (name, region, rss_url, active)
- **Editar / eliminar** fuentes
- Ver “señal” automática por fuente:
  - verde: ok
  - amarillo: degradada
  - rojo: caída


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

### Checklist (operación) — sin entrar a n8n como Admin
**Idea clave**: el Admin Panel decide *qué* y *a qué red* enviar; **n8n** ejecuta la publicación.

- El Admin **NO** entra a n8n.
- La configuración de n8n (infra) queda fuera del flujo del Admin Panel.
- El webhook de n8n queda **server-to-server** con token:
  - El backend envía `x-n8n-webhook-token: <N8N_WEBHOOK_TOKEN>`.
  - El workflow maestro valida ese header contra `process.env.N8N_WEBHOOK_TOKEN` y responde **401** si no coincide.

Si un operador necesita revisar infraestructura, ver:
- `docs/automation/n8n-master-editorial-orchestrator.md`

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

## 10) Redes sociales (conectar / gobernar)
Guía paso a paso:
- `docs/admin/SOCIAL_NETWORKS.md`

Resumen:
- El **Admin Panel** activa/desactiva redes por candidato (`politician_social_links`).
- La publicación real la ejecuta **n8n** (credenciales OAuth/tokens viven allá).

