# Runbook — Meta: publicar en la Página de Facebook "Centro Informativo Ciudadano"

## Reglas de Meta (obligatorias)

- Facebook **no** permite autopublicación en perfiles personales.
- Toda publicación automática **debe** hacerse en una **Página** (Page).
- Este proyecto usa **una sola** Página: **"Centro Informativo Ciudadano"**.
- El enlace en cada publicación **siempre** apunta a:
  `https://mercadeo-politico-2026.vercel.app/centro-informativo`

## Arquitectura

1. **Supabase** es la fuente de verdad: `citizen_news_posts` (estado `published`, `published_at`).
2. **Next.js (Vercel)** publica el contenido en Supabase y, si está configurado, llama a n8n para publicar en Facebook.
3. **n8n (Railway)** es el **único** componente que llama a la Facebook Graph API (Page ID + Page Access Token) y publica en la Página.

## Variables de entorno

### Vercel (App)

- `N8N_WEBHOOK_URL_CENTRO_FACEBOOK`: URL completa del webhook de n8n para CI → Facebook.
  - Ejemplo: `https://TU-N8N.up.railway.app/webhook/mp26-centro-informativo-facebook`
  - Si no está definida, la app **no** llama a n8n (el resto del flujo sigue igual).
- El mismo token que usa el webhook principal (`N8N_WEBHOOK_TOKEN` o `MP26_AUTOMATION_TOKEN`) se usa para este webhook.

### n8n (Railway)

- `N8N_WEBHOOK_TOKEN`: mismo valor que en Vercel (validación del webhook).
- `FACEBOOK_CENTRO_PAGE_ID`: **Page ID** de la Página "Centro Informativo Ciudadano" (no el ID de usuario).
- `FACEBOOK_CENTRO_PAGE_TOKEN`: **Page Access Token** (larga duración) de esa Página.

  Nombres alternativos que reconoce el workflow:
  - Page ID: `FACEBOOK_CENTRO_INFORMATIVO_PAGE_ID`
  - Token: `FACEBOOK_CENTRO_INFORMATIVO_PAGE_TOKEN` o `FACEBOOK_CENTRO_PAGE_ACCESS_TOKEN`

- Opcional: `MP26_META_GRAPH_VERSION` (por defecto `v21.0`).

## Cómo obtener Page ID y Page Access Token

1. **Page ID**
   - En la Página de Facebook: Configuración → General → **ID de la Página**.
   - O desde [Meta for Developers](https://developers.facebook.com/) → tu App → Herramientas → Graph API Explorer → elegir la Página y ver el ID.

2. **Page Access Token (larga duración)**
   - Meta for Developers → tu App → Herramientas → Graph API Explorer.
   - Seleccionar la Página en "User or Page".
   - Permisos: al menos `pages_manage_posts`, `pages_read_engagement`.
   - Generar token y, si es de corta duración, canjearlo por uno de larga duración (Documentación → Access Token).

## Workflow n8n

- Archivo en el repo: `docs/automation/n8n-centro-informativo-facebook.json`
- Importar en n8n, configurar las variables anteriores y **activar** el workflow.
- Ruta del webhook: `mp26-centro-informativo-facebook` → URL final: `https://TU-N8N/webhook/mp26-centro-informativo-facebook`

## Flujo en la app

1. Al publicar en Centro Informativo (Admin → Contenido → "Publicar en Centro Informativo" o vía auto-publicación del editorial), se inserta una fila en `citizen_news_posts`.
2. La app hace POST al webhook de n8n con: `post_id`, `slug`, `title`, `excerpt`, `media_url`, `link` (siempre el enlace al centro informativo).
3. n8n valida token, comprueba Page ID y Token, publica en la Página y responde con `{ ok: true, facebook_post_id }` o `{ ok: false, error: "..." }`.
4. La app actualiza `citizen_news_posts.facebook_post_id` y `facebook_published_at` si la respuesta es correcta.

## Logs (diagnóstico)

- **Falta Page ID**: n8n escribe en consola y responde `error: "missing_page_id"`. Revisar que `FACEBOOK_CENTRO_PAGE_ID` esté definida en n8n.
- **Falta Page Token**: n8n escribe en consola y responde `error: "missing_page_token"`. Revisar que `FACEBOOK_CENTRO_PAGE_TOKEN` esté definida en n8n.
- **Facebook rechaza la publicación**: n8n escribe en consola y responde `error: "facebook_rejected"`. Revisar permisos del token, políticas de Meta y contenido del post.

En los logs de Vercel aparecerán mensajes con prefijo `[centro-informativo-facebook]` cuando se omita el envío (config no definida) o cuando n8n devuelva error.

## Resumen de comprobaciones

| Dónde        | Qué comprobar |
|-------------|----------------|
| Vercel      | `N8N_WEBHOOK_URL_CENTRO_FACEBOOK` apunta al webhook correcto. |
| n8n (Railway) | Workflow activo, `N8N_WEBHOOK_TOKEN`, `FACEBOOK_CENTRO_PAGE_ID`, `FACEBOOK_CENTRO_PAGE_TOKEN`. |
| Supabase    | Columnas `citizen_news_posts.facebook_post_id` y `facebook_published_at` (migración aplicada). |
