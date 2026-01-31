# Auditoría de sistema — mercadeo-politico-2026

**Fecha:** 2026-01-31  
**Fuente:** Código real del repo + runbooks (START_HERE, AUTO_BLOG, INCIDENTS, SOCIAL_AUTH, OAUTH_CONNECT_META_X_REDDIT, RECONNECT, ONBOARDING_CHECKLIST, mp26-core, mp26-news-rights).

---

## 🔴 Bloqueadores críticos

### 1. Enlace móvil político — crash SSR (Digest 3317002311)

**Causa exacta:** En Next.js 15+, `params` en rutas dinámicas es una **Promise** que debe hacerse `await`. La página `politico/[slug]/page.tsx` usa `params: { slug: string }` y `const { slug } = params` sin await. En tiempo de ejecución, `params` es una Promise; acceder de forma síncrona puede provocar excepción o `slug` undefined.

Además, `timingSafeEqual(Buffer.from(session.sig), Buffer.from(expected))` **lanza** si los buffers tienen longitudes distintas (cookie corrupta o firma con otro algoritmo). Eso produce "Application error: a server-side exception has occurred".

**Archivos:**  
- `src/app/politico/[slug]/page.tsx`

**Condición que falla:**  
- Uso síncrono de `params` cuando el framework pasa `Promise<{ slug: string }>`.  
- `crypto.timingSafeEqual` sin comprobar longitud de buffers.

---

### 2. Dashboard Admin — 401 en “Borradores” (tab Contenido)

**Causa:** El bloque “Borradores” en la práctica es la lista de borradores que carga el **tab Contenido** (`/admin/content`). Esa lista se obtiene con `GET /api/admin/drafts`. Si ese request devuelve 401, el cliente no recibe sesión válida.

**Endpoint afectado:** `GET /api/admin/drafts`  
**Middleware de auth:** `requireAdminApi()` en `src/lib/auth/adminApi.ts` (usa `createSupabaseServerClient()` + `getUser()` + `profiles.role`).  
**Clave:** Se usa **anon key** con la sesión del usuario (cookies). No se usa service role en esa ruta (correcto para RLS).

**Posibles causas del 401:**  
- Cookies de sesión no enviadas en el `fetch` (p. ej. si la petición es cross-origin o no se envían credenciales).  
- RLS en `profiles` impide que el usuario lea su propia fila con anon + auth.  
- Sesión expirada o inválida.

**Archivos:**  
- `src/app/api/admin/drafts/route.ts` (GET → `requireAdminApi`)  
- `src/lib/auth/adminApi.ts`  
- `src/app/admin/content/ui.tsx` (fetch a `/api/admin/drafts` sin `credentials: 'include'` explícito; en same-origin por defecto sí se envían, pero conviene fijarlo).

---

## 🟠 Bugs de alto impacto

### 3. Centro Informativo — “not approved” aunque el borrador se ve aprobado

**Validación exacta que marca “not approved”:**  
- **Cliente:** `src/app/admin/content/ui.tsx`: `isPublishApproved(d)` → `statusKey(d.status) === "approved" || statusKey(d.status) === "edited"` (normaliza a minúsculas y trim).  
- **API:** `src/app/api/admin/news/publish/route.ts` línea 81: `isApprovedDraftStatus(draft.status)` → `normalizeDraftStatus(draft.status)` y comparación con `"approved"` o `"edited"`.

**Campo único:** `ai_drafts.status`. No hay flag distinto para “aprobación editorial” vs “legal/rights” vs “autorización política”. La publicación al Centro Informativo y el envío a redes solo miran ese status.

**Condición que omite silenciosamente:**  
1. En bulk: si `isPublishApproved(d)` es false en el cliente, se incrementa `reasons.not_approved` y se hace `continue` (no se llama al API).  
2. Si se llama al API y el draft en DB tiene `status` distinto de `approved`/`edited`, el API responde 400 con `error: "not_approved"` y el cliente lo cuenta como omitido y lo muestra en “Detalle (safe): not_approved = 1”.

**Desalineación posible:**  
- Si `GET /api/admin/drafts` devuelve 401, la lista no se actualiza; el usuario puede estar viendo una lista antigua (p. ej. antes de aprobar).  
- O el usuario aprueba en la UI pero el PATCH a `/api/admin/drafts` falla (p. ej. 401) y el estado en DB no cambia; al hacer “Publicar en Centro Informativo” se usa el mismo draft con status viejo → “not approved”.

**Conclusión:** Mismo criterio cliente/servidor; el fallo suele ser **lista desactualizada por 401** o **PATCH de aprobación fallido**. Corregir 401 y asegurar que el cliente actualice la lista tras PATCH (ya hace `refresh()` tras `updateDraft`) reduce el problema.

---

### 4. n8n / Redes — OAuth por enlace: “Proveedor inválido” y Meta no funciona

**Mapeo de providers:**  
- `src/lib/oauth/providers.ts`: `normalizeOAuthProvider` acepta `meta|facebook|instagram|threads` → `meta`, `x|twitter` → `x`, `reddit` → `reddit`. Cualquier otro valor → `null` → “Proveedor inválido”.

**Rutas:**  
- Enlace generado en Admin: `/connect/{provider}?candidate_id=...` o `/connect/{provider}/app?candidate_id=...`.  
- `connect/[provider]/page.tsx` (servidor): hace `await params`, normaliza y redirige a `/api/public/oauth/{provider}/start?...`.  
- `connect/[provider]/app/page.tsx` (cliente): usa `params?.provider` de forma **síncrona**. En Next.js 15+, en páginas cliente con rutas dinámicas, `params` puede ser una **Promise**; si no se desempaqueta, `provider` queda `undefined` → `normalizeOAuthProvider("")` → null → “Proveedor inválido”.

**Archivos:**  
- `src/app/connect/[provider]/app/page.tsx` (cliente): leer `provider` desde la URL (p. ej. `useParams()`) para no depender de `params` síncrono.  
- Endpoints: `src/app/api/public/oauth/[provider]/start/route.ts`, `link/route.ts`, `callback/route.ts` ya usan `params` como Promise y `normalizeOAuthProvider`.

**Meta “no funciona”:** Además del posible bug de `params` en la app page, hay que comprobar en Vercel:  
- `OAUTH_META_CLIENT_ID`, `OAUTH_META_CLIENT_SECRET`  
- Redirect en Meta Developers: `https://TU_DOMINIO/api/public/oauth/meta/callback`  
- `NEXT_PUBLIC_SITE_URL` para callbacks.

**n8n no confirma conexión:** La conexión OAuth se guarda en Supabase (`social_oauth_connections`). La “confirmación” en n8n depende de que el workflow use esas credenciales y del webhook/API. Ver runbook OAUTH_CONNECT_META_X_REDDIT y variables en Railway (n8n): `MP26_APP_BASE_URL`, `MP26_AUTOMATION_TOKEN`.

---

### 5. Centro Informativo — Imágenes y auto-adaptación por red

**Pipeline:**  
- RSS → `editorial-orchestrate` → draft (con `metadata.media.image_url` y variantes) → publicación en `citizen_news_posts` y envío a n8n con `variants` (facebook, instagram, x, etc.) y `destinations` aprobadas.

**Imagen:**  
- `src/app/api/automation/editorial-orchestrate/route.ts`: se usa `pickWikimediaImage` (query por región/tema), evitando URLs recientes; fallback por query alternativo; opcional `generateAndStoreNewsImage`; OG solo como referencia.  
- Una imagen por artículo; `avoid_media_urls` y `recent_media_urls` reducen repetición.

**Auto-blog no publica:** Ver runbook AUTO_BLOG e INCIDENTS: AUTO ON, Worker en Railway, `CRON_SECRET`, `MP26_AUTOMATION_TOKEN`, `politicians.auto_blog_enabled` y `auto_publish_enabled`, y destinos con `authorization_status = 'approved'`.  
**Adaptación por red:** Las variantes (facebook, x, instagram, etc.) se generan en `ensureSocialVariants` y se envían a n8n; el workflow debe usar esos campos por red (no hay lógica adicional en el backend que “corte” texto por red; eso es responsabilidad de n8n).

---

## 🟡 Riesgos / supuestos peligrosos

- **Sesión admin en API routes:** Si en algún despliegue las cookies no se envían a las rutas `/api/admin/*` (dominio distinto, proxy, SameSite), todos los GET/POST que usan `requireAdminApi()` devolverán 401.  
- **Politico token mode:** Si se usa `mode: "token"` y el `token_hash` en DB no coincide con el usado para firmar la cookie, `timingSafeEqual` puede lanzar si las longitudes difieren.  
- **OAuth:** Si el enlace lleva un `provider` con typo o encoding raro (ej. “Meta” en algún middleware que altere la ruta), “Proveedor inválido” puede aparecer de forma intermitente.

---

## 🟢 Comportamiento correcto (no modificar)

- Runbooks START_HERE, AUTO_BLOG, INCIDENTS, OAUTH_CONNECT_META_X_REDDIT, RECONNECT y ONBOARDING como fuente de verdad.  
- Uso de `createSupabaseAdminClient()` (service role) solo donde hace falta (publicar, tokens, OAuth callback).  
- `requireAdminApi()` con anon + sesión para rutas admin API.  
- Normalización de status de draft (`approved`/`edited`) en cliente y en `/api/admin/news/publish` y `publish-to-n8n`.  
- Pipeline de imágenes: Wikimedia + evitar repetición + fallbacks y compliance mp26-news-rights.  
- Trazabilidad de autorización en `politician_social_auth_invites` y destinos; tokens OAuth cifrados con `OAUTH_TOKEN_ENCRYPTION_KEY`.

---

## ✅ Fixes propuestos

### Fix 1 — Politico [slug]: params Promise + timingSafeEqual

**Archivo:** `src/app/politico/[slug]/page.tsx`  
**Cambios:**  
1. Tipar `params` como `Promise<{ slug: string }>` y hacer `const { slug } = await params` al inicio.  
2. Antes de `timingSafeEqual`, comprobar que `Buffer.from(session.sig).length === Buffer.from(expected).length`; si no, `redirect("/politico/access")` en lugar de lanzar.

### Fix 2 — Connect [provider]/app: provider desde URL en cliente

**Archivo:** `src/app/connect/[provider]/app/page.tsx`  
**Cambio:** Obtener `provider` con `useParams()` (o equivalente desde la URL) en lugar de `params?.provider`, para que en cliente el valor no dependa de `params` como Promise no desempaquetada.

### Fix 3 — Admin Content: envío de credenciales en fetch de drafts

**Archivo:** `src/app/admin/content/ui.tsx`  
**Cambio:** En todas las llamadas a `fetch("/api/admin/drafts", ...)` (y opcionalmente al resto de `/api/admin/*`), añadir `credentials: 'include'` para asegurar que se envían cookies en cualquier contexto de origen.

### Fix 4 — (Opcional) Centro Informativo “not approved”

**Archivo:** `src/app/admin/content/ui.tsx`  
**Cambio:** Tras un PATCH exitoso en `updateDraft`, actualizar optimistamente en estado local el draft correspondiente (p. ej. `setDrafts(prev => prev.map(d => d.id === patch.id ? { ...d, ...patch } : d)))` y, si `selected?.id === patch.id`, actualizar también `setSelected`, de modo que un “Publicar en Centro Informativo” inmediato use el status ya aprobado sin depender solo del siguiente `refresh()`. Así se mitiga el caso en que `refresh()` falle por 401.

---

## 🧪 Cómo verificar cada fix

### Fix 1 (politico [slug])
- Generar enlace en Admin → Políticos → “Enlace móvil político” y abrirlo en navegador.  
- Esperado: redirección a `/politico/access?token=...` → cookie establecida → redirect a `/politico/{slug}` y página del político sin “Application error”.  
- Si el token es inválido o expirado: mensaje “Enlace inválido” o “Enlace expirado”, no crash.

### Fix 2 (connect app)
- Admin → Redes → Conectar por OAuth → elegir Meta (o X/Reddit) y candidato → “Generar enlace OAuth (APP)” → abrir enlace en móvil.  
- Esperado: no “Proveedor inválido”; redirección a Meta (o X/Reddit) para autorizar.  
- Comprobar en Supabase `social_oauth_connections` que exista una fila para ese candidato/proveedor tras autorizar.

### Fix 3 (drafts 401)
- Iniciar sesión en `/admin/login` → ir a Contenido.  
- Esperado: lista de borradores cargada (o “—”/vacía si no hay), sin 401.  
- En DevTools → Network: `GET /api/admin/drafts` debe ser 200 (o 503 si Supabase no configurado), no 401.

### Fix 4 (not approved)
- En Contenido, aprobar un borrador y, sin recargar la página, seleccionarlo y pulsar “Publicar en Centro Informativo” (o seleccionar varios con ese incluido y bulk).  
- Esperado: publicación correcta o mensaje explícito de error (p. ej. falta imagen), no “omitidos 1, not_approved = 1” si el draft ya está aprobado en la UI.

---

## Resumen

| # | Tema                         | Severidad | Causa principal                                      | Fix principal                          |
|---|------------------------------|-----------|--------------------------------------------------------|----------------------------------------|
| 1 | Enlace móvil político crash  | 🔴        | params no await + timingSafeEqual sin comprobar longitud | Promise params + comprobar longitud    |
| 2 | 401 Borradores (Contenido)    | 🔴        | Cookies no llegando o sesión no leída en API           | credentials: 'include' + revisar RLS   |
| 3 | Centro Info “not approved”   | 🟠        | Lista desactualizada (401) o PATCH aprobación fallido  | Fix 2 + opcional actualización optimista |
| 4 | OAuth “Proveedor inválido”   | 🟠        | params en cliente (app page) no desempaquetado         | useParams() en connect/app              |
| 5 | Imágenes / auto-blog          | 🟠        | Config/env y n8n, no lógica única de código            | Runbooks + env + n8n                    |

Este análisis está alineado con la arquitectura actual (Next.js App Router + Supabase + n8n + cron) y con las reglas mp26-core y mp26-news-rights.
