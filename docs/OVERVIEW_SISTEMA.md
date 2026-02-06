# Overview del sistema — capacidades, autonomía y funcionamiento

Documento de referencia: cómo quedó el sistema, qué hace solo, qué controlas tú, y cómo se conecta desde el admin hasta el usuario final y la captación de votos.

---

## 1. Visión general y autonomía

### Qué es el sistema
- **Plataforma de comunicación política digital** para Colombia 2026: contenido cívico (noticias reescritas, ejes de propuesta, SEO), Centro Informativo público, y publicación a redes (Facebook, y preparado para Instagram/X/otros vía n8n).
- **Fuente de verdad:** Supabase (candidatos, publicaciones, borradores, destinos sociales). La app (Next.js en Vercel) y la automatización (n8n + Worker en Railway) leen y escriben ahí; no dependen de que nadie esté “conectado” para funcionar.

### Independencia de “la IA” (Cursor/agente) y de ti
- **Una vez desplegado y configurado**, el sistema corre **sin que un agente o tú estés haciendo nada**:
  - **Railway Worker** llama cada ~20 min a `GET /api/cron/auto-blog` (y keepalive).
  - El **cron** decide qué candidatos “les toca” según `last_auto_blog_at` y `auto_blog_every_hours`, y dispara **2 orquestaciones por candidato** (noticias distintas).
  - **editorial-orchestrate** elige noticia (RSS/GDELT), genera texto (MSI u OpenAI), elige imagen (RSS cacheada → Wikimedia → AI), publica en `citizen_news_posts` y, si está configurado, envía a n8n (Facebook Centro Informativo y, si hay destinos aprobados, a redes por candidato).
- **Tú** solo intervienes para: encender/apagar el auto global, ajustar cadencia u horas, activar/desactivar auto por candidato, revisar/editar borradores si quieres, y conectar redes (OAuth/enlaces de autorización). **La IA (Cursor)** solo se usa para desarrollar y mantener código; no forma parte del flujo en producción.

### Capacidades autónomas (sin intervención)
- Generar **2 publicaciones por candidato** por ciclo, con noticias distintas, imágenes (RSS → Commons → AI), mínimo 450 palabras, SEO y 1–2 ejes de propuesta que mitigan o empoderan la noticia.
- Publicar en el **Centro Informativo** (tabla `citizen_news_posts`) y, si el webhook está configurado, en la **Página de Facebook** “Centro Informativo Ciudadano” (con imagen cuando hay `media_url`).
- Enviar a **n8n** variantes por red (Facebook, X, Instagram, etc.) cuando hay destinos con `authorization_status = approved`.
- **Keepalive** (Worker + opcional GitHub Actions) para que Supabase y URLs críticas no se duerman.

---

## 2. Admin Panel — qué controlas

Ruta base: **`/admin`** (requiere sesión admin).

### Contenido y auto-publicación (`/admin/content`)
- **AUTO ON/OFF:** toggle global. Si está OFF, el cron no genera ni publica nada (el Worker sigue llamando, pero el endpoint responde “skipped”).
- **Configuración de cadencia** (en DB: `app_settings`):
  - `auto_blog_every_hours`: cada cuántas horas se puede disparar un ciclo por candidato (default 8).
  - `auto_blog_jitter_minutes`: ventana de minutos de jitter para repartir publicaciones en el tiempo (anti-spam).
- **Cola de borradores:** listado de `ai_drafts`, filtro por candidato, publicar/editar/archivar.
- **Publicaciones del Centro Informativo:** listado de `citizen_news_posts`, editar título/cuerpo/extracto, archivar.

### Candidatos (`/admin/politicians`, `/admin/politicians/[id]`)
- Datos de cada candidato: nombre, cargo, región, partido, biografía, propuestas, número de tarjetón.
- **Auto por candidato:**
  - **auto_blog_enabled:** si el cron puede elegir a este candidato para generar contenido.
  - **auto_publish_enabled:** si, al generar, se auto-publica en Centro Informativo (y se intenta enviar a n8n/Facebook). Si está OFF, solo se crea borrador.
- Subida de foto (Storage) y enlaces/destinos sociales.

### Redes y destinos (`/admin/networks`)
- **RSS:** fuentes de noticias por región (Meta, Colombia), activas/inactivas, `license_confirmed` para uso de imágenes.
- **Destinos sociales:** por candidato, tipo de red (Facebook, X, Instagram, etc.), estado de autorización (pendiente/aprobado/rechazado). Los enlaces de autorización se generan desde aquí; el ciudadano/dueño abre el enlace y aprueba (trazabilidad en DB).
- Solo destinos **approved** reciben contenido cuando el sistema envía a n8n.

### Otros
- **AI / Marleny:** configuración y chat de apoyo (no es el motor único del editorial; el motor usa MSI u OpenAI según arbitraje).
- **Usuarios:** gestión de cuentas admin.
- **Cache:** versión y limpieza para PWA/estilos (evitar “no styles” tras deploy).

---

## 3. Lado usuario — qué ve el ciudadano

### Páginas públicas (sin login)
- **`/`** — Landing.
- **`/candidates`** — Listado de candidatos (foto, nombre, cargo, región, enlace al perfil).
- **`/candidates/[slug]`** — Perfil del candidato (bio, propuesta, número de tarjetón cuando existe, enlaces a redes).
- **`/candidates/[slug]/propuesta`** — Propuesta programática (contenido de `proposals`).
- **`/centro-informativo`** — Feed de noticias del Centro Informativo:
  - Posts publicados (`citizen_news_posts`, `status = published`), con título, extracto, imagen (cuando hay `media_urls`), fecha, enlace “Ver fuente” si hay `source_url`.
  - Cada nota está ligada a un candidato; el cuerpo incluye ejes de propuesta y mensaje cívico (voto como derecho, líderes proactivos). El **número de tarjetón** y el nombre del candidato aparecen en el texto cuando el motor los incluye (diseño persuasivo suave, sin propaganda directa tipo “vote por X”).
- **`/about`** — Principios y contexto del proyecto.

### Cómo llega el usuario al voto (captación)
- **Contenido:** noticias reescritas, con enfoque cívico y 1–2 ejes de la propuesta del candidato que **mitigan** (noticia negativa) o **empoderan** (noticia positiva). Texto mínimo 450 palabras, con SEO para búsquedas.
- **Identificación:** en cada nota se menciona al candidato y, si está configurado, el **número de tarjetón**, para que quien lee sepa a quién y cómo votar sin que sea un llamado directo agresivo.
- **Mensaje ciudadano:** cierre tipo “derecho al voto” y líderes proactivos (reformulado en cada pieza).
- **Canales:** el mismo contenido se publica en la web (Centro Informativo) y, vía n8n, en la Página de Facebook del Centro y en los destinos aprobados por candidato (cuando están configurados). Así se amplía alcance y posibilidad de captación.

---

## 4. Auto-publicaciones — tiempos y flujo técnico

### Quién dispara
- **Railway Worker** hace `GET /api/cron/auto-blog` cada **~20 minutos** (configurable en el Worker).
- El endpoint está protegido con **CRON_SECRET**; solo el Worker (o quien tenga ese secreto) puede llamarlo.

### Quién “toca” en cada ciclo
- Solo candidatos con **auto_blog_enabled = true** y **auto_publish_enabled = true**.
- Por cada candidato se mira si “le toca” publicar según:
  - **auto_blog_every_hours** (ej. 8 h).
  - **last_auto_blog_at:** no se vuelve a disparar hasta que pasen esas horas + un **jitter** en minutos (por candidato y ciclo), para no saturar ni agrupar todo a la misma hora.
- En cada corrida no se disparan todos los “due”: hay un **límite por run** (`maxPerRun`) para repartir la carga (anti-spam).

### Cuántas publicaciones por candidato por ciclo
- Cuando a un candidato **le toca**, el cron hace **2 llamadas** a `POST /api/automation/editorial-orchestrate`:
  - Primera con `story_slot: 0`, segunda con `story_slot: 1`.
  - Entre una y otra se actualizan listas de “evitar” (URLs de noticia, títulos, imágenes ya usadas) para que la segunda use **otra noticia** y otra imagen.
- Cada llamada puede producir **1** publicación en `citizen_news_posts` (y 1 borrador en `ai_drafts`). Resultado típico: **2 publicaciones nuevas por candidato** por ciclo.

### Flujo dentro de editorial-orchestrate (resumido)
1. **Noticia:** RSS (prioridad) o GDELT, evitando URLs/títulos ya usados.
2. **Texto:** motor dual (MSI / OpenAI), arbitraje por tiempo y calidad; prompt con biografía, propuestas, reglas (mínimo 450 palabras, SEO, 1–2 ejes que mitigan/empoderan, estilo noticiero, inclinación correctiva/informativa/persuasiva suave).
3. **Imagen:** orden RSS (feed con licencia) → Wikimedia Commons → generación AI; atribución en cuerpo; sin hotlink a medios.
4. **Publicación:** si `auto_publish_enabled` y global AUTO ON, se escribe en `citizen_news_posts` y se llama a **submitCentroInformativoToFacebook** (webhook n8n). Si n8n responde con `facebook_post_id`, se guarda en el post.
5. **Redes por candidato:** se envía a n8n un payload con variantes (facebook, x, instagram, etc.) y destinos aprobados; n8n publica en cada red según su configuración.

### Tiempos típicos
- **Cadencia por candidato:** cada **N horas** (N = `auto_blog_every_hours`, ej. 8), con jitter de hasta **auto_blog_jitter_minutes** (ej. 37 min).
- **Worker:** cada ~20 min; en cada ejecución se atiende a un subconjunto de candidatos “due”, no a todos a la vez.
- **Efecto:** el feed del Centro Informativo y la Página de Facebook se van llenando de forma distribuida en el tiempo, con hasta 2 notas nuevas por candidato por ciclo.

---

## 5. Cómo encaja la captación de votos

- **Autonomía:** el sistema no necesita que tú ni una IA estén “presentes” para generar, publicar y distribuir. Solo hace falta que AUTO esté ON, candidatos con auto_blog y auto_publish, y n8n/Worker/configuración correctos.
- **Contenido:** noticias de medios/RSS reescritas con ángulo cívico, **ejes de propuesta** que mitigan o empoderan la noticia, y **número de tarjetón** + nombre del candidato integrados en el texto. Eso favorece reconocimiento y recordación a la hora del voto.
- **Alcance:** web (Centro Informativo) + Facebook (y otros destinos vía n8n) aumentan la probabilidad de que más personas vean el mensaje.
- **Límites éticos:** el prompt prohíbe propaganda directa (“vote por X”), invención de datos y ataques personales; el diseño es persuasión suave e informativa.

---

## 6. Resumen en una tabla

| Capa | Qué hace | Depende de ti / de la IA en tiempo real |
|------|----------|----------------------------------------|
| **Admin** | Encender/apagar auto, cadencia, por candidato; revisar/editar borradores y publicaciones; redes y RSS | Tú (solo cuando quieres cambiar algo) |
| **Worker (Railway)** | Cada ~20 min llama keepalive y auto-blog | No; corre solo |
| **Cron auto-blog** | Elige candidatos “due”, dispara 2 orquestaciones por candidato | No; solo AUTO ON y env vars |
| **editorial-orchestrate** | Elige noticia, genera texto e imagen, publica en DB y envía a n8n/FB | No |
| **n8n** | Recibe webhooks, publica en Facebook (y otros destinos si hay aprobación) | No; solo config de tokens/destinos |
| **Usuario** | Ve landing, candidatos, centro informativo, propuestas; lee notas con ejes y número de tarjetón | No |

En conjunto: el sistema queda **autónomo** para generar, publicar y distribuir contenido de captación, con **independencia** de la IA de desarrollo y de ti en el día a día, salvo cuando quieras cambiar controles o contenido desde el Admin.
