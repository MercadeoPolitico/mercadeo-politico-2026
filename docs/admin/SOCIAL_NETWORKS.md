## Conectar redes sociales (Admin)

Este proyecto separa **control editorial** (Admin Panel) de **conectividad** (n8n):

- **Admin Panel**: decides *qué* se publica, para *qué candidato*, y en *qué redes* está activo (por candidato).
- **n8n (Railway)**: ejecuta la publicación real (Facebook/X/Reddit/etc) y orquesta conectores.

Opciones de conectividad (conviven):
- **Credenciales en n8n (clásico)**: tokens/credenciales quedan en n8n como env/credentials.
- **OAuth por enlace (Vercel, recomendado para “one-click”)**:
  - El Admin genera un link en `/admin/networks` → el dueño conecta desde móvil.
  - Tokens quedan **cifrados** en Supabase (`social_oauth_connections`) y n8n publica vía un “bridge” a Next.js cuando `credential_ref` empieza por `oauth:`.
  - Runbook: `docs/runbooks/OAUTH_CONNECT_META_X_REDDIT.md`.

### Estado (infra) — n8n en Railway (importante para operación)
- Si n8n muestra `502` con Railway Edge, revisa permisos del volumen `/data` (ver `railway/n8n/Dockerfile`).
- Para automatizar el workflow sin entrar a la UI:
  - `N8N_PUBLIC_API_DISABLED=false`
  - `N8N_API_KEY` (Settings → n8n API)
  - Script idempotente: `npm run n8n:ensure`
  - Smoke: `npm run smoke:n8n`

### Bloque canónico: ruteo automático en n8n usando `metadata.destinations`

**Objetivo**: el Admin NO elige plataformas al publicar. El backend envía un payload con:

- `draft.variants` (texto listo por red)
- `metadata.destinations[]` (solo redes **approved** + **active**)

**Contrato (canónico)**:

```json
{
  "generated_text": "…",
  "variants": {
    "facebook": "…",
    "instagram": "…",
    "threads": "…",
    "x": "…",
    "telegram": "…",
    "reddit": "…"
  },
  "metadata": {
    "draft_id": "uuid",
    "destinations": [
      {
        "network": "facebook|instagram|threads|x|telegram|reddit",
        "scope": "page|profile|channel",
        "credential_ref": "meta_default|x_default|telegram_default|reddit_default|...",
        "page_id": "…",
        "account_id": "…",
        "channel_id": "…",
        "candidate_id": "…",
        "region": "meta|colombia"
      }
    ],
    "media": {
      "image_url": "https://…",
      "credit": "…"
    }
  }
}
```

**Cómo debe rutear n8n (simple y extensible)**:

- Iterar `metadata.destinations[]`
- Switch por `destination.network`
- En cada case:
  - Publicar `draft.variants[network]`
  - Adjuntar media si existe `metadata.media.image_url`
- Si una red falla:
  - Loggear error
  - Continuar con las demás
- Si llega un `network` desconocido:
  - Marcar como `skipped` y continuar
- Responder al final (webhook):
  - `{ published: [], failed: [], skipped: [] }`

**Workflow en el repo (importable)**:

- Archivo: `docs/automation/n8n-master-editorial-orchestrator.json`
- Este workflow ya trae el ruteo completo:
  - Nodo `Normalize destinations (canonical)` (acepta formato canónico y un formato legacy con `name/url`)
  - Nodo `Switch by destination.network`
  - Nodos `PUBLISH <network>` con publicación real vía HTTP (Meta/X/Telegram/Reddit) y manejo de errores por red.
  - `credential_ref` se resuelve por mapping determinístico a variables de entorno en n8n (`MP26_*`).

### Configuración mínima en Admin → n8n / Redes (para que el ruteo sea determinístico)

En cada destino social, completa (sin secretos):

- **network_key**: `facebook | instagram | threads | x | telegram | reddit`
- **scope**: `page | profile | channel`
- **target_id**: `page_id/account_id/channel_id` (recomendado)
- **credential_ref**: referencia de la credencial en n8n (ej: `meta_default`, `x_default`, `telegram_default`, `reddit_default`)

### 1) Activar/Desactivar redes por candidato (en el Admin Panel)

Entra a:
- `Admin → Candidatos → (elige un candidato) → Workspace`

En la sección **Redes sociales**:
- **Agregar red**: llena `platform` (ej. `facebook`, `x`, `instagram`, `reddit`, `tiktok`, `youtube`, `telegram`, `whatsapp`) y pega el `url` del perfil/página/canal.
- **Activar/Desactivar**: usa el toggle de estado (active/inactive).  
  Esto gobierna qué plataformas puede usar la automatización.
- **Eliminar**: borra el link si ya no aplica.

Notas:
- Estos links **NO** guardan credenciales. Solo indican “esta red existe y está activa”.
- La automatización envía a n8n la lista de `social_links` activos junto con las variantes generadas (facebook/x/reddit).

---

## WhatsApp (recomendado): alta 1‑a‑1 por enlace + cero spam

En WhatsApp **no hacemos envíos masivos** desde la plataforma. En su lugar usamos un flujo **uno‑a‑uno** y gobernado:
- El Admin registra el destino (WhatsApp) para un candidato.
- El sistema genera un **enlace de autorización** copiable.
- El dueño del WhatsApp (número/cuenta) abre el enlace y autoriza.
- El Admin Panel muestra estado (`pending | approved | revoked`) y trazabilidad (quién/cuándo).

### Cómo hacerlo (paso a paso, Admin)
1) Ve a `Admin → n8n / Redes` (`/admin/networks`).
2) En **Destinos sociales**, agrega un destino:
   - **Candidato**
   - **Red**: WhatsApp
   - **URL/Referencia**: usa un link válido (ej. wa.me, shortlink, o referencia acordada del número/canal).
3) Copia el **enlace de autorización** que te muestra el panel.
4) Envíalo por WhatsApp **solo** al dueño del número/canal (uno por uno).
5) Cuando el dueño apruebe, verifica que el estado quede en **verde/approved**.
6) Repite el proceso para el siguiente candidato/destino.

### Por qué NO WhatsApp masivo (y por qué tampoco “spam” en otras redes)
Esto es por **cumplimiento y supervivencia del canal**:
- **Consentimiento (privacidad)**: para mensajería directa necesitas **opt‑in real** (consentimiento verificable). En Colombia aplica Habeas Data (Ley 1581) y principios similares a GDPR: mínimo uso de datos, finalidad, revocación.
- **Políticas anti‑spam de WhatsApp**: WhatsApp penaliza patrones de envío masivo (bloqueos, baja de “quality rating”, restricciones del número, baneos). La gente puede reportar/bloquear y eso degrada el canal.
- **Plantillas y reglas** (WhatsApp Business API): cuando se escala, se requieren **plantillas aprobadas**, ventanas de conversación, y controles estrictos. No queremos operar ese riesgo desde el Admin Panel.
- **Otras redes hacen lo mismo**: Facebook/Instagram/X/Reddit/Telegram penalizan automatización “agresiva” (rate limits, shadowban, suspensión de app/cuenta). Nuestro objetivo es comunicación **ética y sostenible**, no volumen.

Recomendación práctica:
- Publica 1‑a‑1 solo a contactos con consentimiento.
- Mantén frecuencia baja, contenido útil, y siempre ofrece salida (“si no deseas recibir, me dices y no volvemos a escribirte”).

### 2) Conectar credenciales en n8n (publicación real)

n8n corre en Railway y es el “conector”:
- URL (según tu infraestructura): `https://n8n-production-1504.up.railway.app`

En n8n:
1. Abre el workflow `MP26 — Master Editorial Orchestrator`.
2. Ve a **Credentials**.
3. Crea credenciales por plataforma (según nodos disponibles):
   - Facebook Pages / Instagram (Meta)
   - X (Twitter)
   - Reddit
   - Telegram
   - WhatsApp (normalmente requiere proveedor; si no hay nodo directo, se publica por canal alterno)
   - YouTube / LinkedIn (si los nodos están disponibles)
4. En el workflow, para cada “publicador”, filtra por `social_links`:
   - Publica solo si existe un link `active` para esa plataforma.
   - Usa la variante correcta:
     - Facebook → `payload.variants.facebook`
     - X → `payload.variants.x`
     - Reddit → `payload.metadata.variants.reddit` (si tu nodo lo usa)
     - Blog link → `payload.metadata.blog_slug` (para armar URL final al Centro Informativo)

### 3) Qué recibe n8n (payload)

Cuando el sistema publica un artículo, además del post en `Centro Informativo`, también envía un webhook a n8n con:
- `generated_text`: teaser corto (para “enganche”)
- `variants`: `{ facebook, instagram, x }`
- `metadata.variants`: incluye también `blog` y `reddit`
- `metadata.media`: info de imagen CC (url + crédito)
- `metadata.social_links`: lista de links activos por candidato

### 4) Guardrails (para evitar problemas)

- Si una red está **inactive**, n8n no debería publicar allí.
- Si no hay credenciales configuradas para esa red en n8n, **no publiques** (deja log y sigue con las otras).
- Las imágenes vienen con **licencia/atribución** (Wikimedia Commons) y el crédito se incluye en el cuerpo del blog.

## Conectar redes sociales (Admin)

Este proyecto **no publica directamente desde el panel** a Facebook/X/etc. La publicación real a redes se orquesta en **n8n** (Railway) y el Admin Panel es la **única superficie de control**.

### 1) Registrar redes por candidato (en el workspace)

Ruta: `Admin → Candidatos → (abrir candidato) → Enlaces`

- **Agregar enlace**: selecciona plataforma, (opcional) handle, y pega la URL completa `https://...`
- **Activar/Desactivar**: deja **Activo** solo lo que quieras que n8n considere “habilitado”
- **Eliminar**: borra el enlace si ya no aplica

Plataformas sugeridas (Colombia):
- Facebook, Instagram, Threads, TikTok, X, YouTube
- WhatsApp (canal/Business link), Telegram (canal/bot), LinkedIn, Reddit, Website

Notas:
- Esto **sí guarda en base de datos** inmediatamente.
- Si una red está “Inactiva”, n8n debe ignorarla.

### 2) Conectar credenciales en n8n (Railway)

En n8n (workflow “MP26 — Master Editorial Orchestrator”):

- **Facebook / Instagram**:
  - Crear credencial Meta (Facebook Graph).
  - Usar nodos oficiales si están disponibles en tu instancia.
  - Requiere permisos de página/IG business.
- **X (Twitter)**:
  - Crear credencial de X (API v2).
  - Conectar el nodo de publicación o HTTP Request con OAuth.
- **Threads**:
  - Usar el mismo ecosistema Meta (cuando tu stack/nodo lo soporte).
- **YouTube**:
  - OAuth Google + nodo YouTube (community) o HTTP Request.
- **TikTok**:
  - Depende de nodos disponibles; si no hay nodo, se integra por HTTP con el API oficial.
- **Telegram**:
  - Crear un Bot con BotFather.
  - Guardar el token como credencial/secret en n8n.
- **WhatsApp**:
  - Recomendado: WhatsApp Business API (Meta).
  - Requiere configuración de número/plantillas según política de Meta.
- **LinkedIn**:
  - OAuth + nodo LinkedIn (si está) o HTTP Request con el API oficial.
- **Reddit**:
  - OAuth (script app) + nodo Reddit/HTTP.

### 3) Qué payload recibe n8n (para enrutar)

Cuando el sistema auto-publica o cuando un Admin “envía a automatización”, n8n recibe un JSON con:
- `candidate_id`
- `generated_text`
- `metadata.variants` (facebook/x/reddit/blog cuando aplique)
- `metadata.media` (si hay imagen CC de Wikimedia)
- `metadata.source_url` (fuente de noticia cuando exista)

Recomendación en n8n:
- Si `metadata.media.image_url` existe → adjuntar como imagen/link según red
- Si no existe → publicar solo texto + enlace al Centro Informativo

### 4) Encender / apagar automatización por candidato

En el workspace del candidato:
- **Auto-blog**: si está OFF, ese candidato no genera borradores automáticos.
- **Auto-publicación**: si está ON, el sistema puede publicar automáticamente (según automatización).

