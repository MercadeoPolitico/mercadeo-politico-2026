## Conectar redes sociales (Admin)

Este proyecto separa **control editorial** (Admin Panel) de **conectividad** (n8n):

- **Admin Panel**: decides *qué* se publica, para *qué candidato*, y en *qué redes* está activo (por candidato).
- **n8n (Railway)**: mantiene las **credenciales OAuth/tokens** y ejecuta la publicación real (Facebook/X/Reddit/etc).

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

