## SUPER AUDIT — mercadeo-politico-2026 (2026-01-24)

### Alcance
Auditoría “end-to-end” (código + runtime) enfocada en:
- Auth/admin (login, reset password, forced password change)
- Automatización (n8n → backend → `ai_drafts`)
- Cola editorial y publicación (Centro Informativo + envío a redes vía n8n)
- Cache reset global (dispositivos)
- Salud de integraciones (Supabase/Marleny/OpenAI/n8n)

> Nota: acciones que requieren sesión de admin real (cookies) se verifican por **guardas en código** + **endpoints de diagnóstico**.

---

## 1) Estado del repo y build local
- **Local build**: `npm run build` ✅ (Next.js 16.1.3)
- **TypeScript**: ✅ sin errores

---

## 2) Smoke test (producción)
Script: `scripts/smoke-prod.mjs`

Resultados ✅:
- Health:
  - `GET /api/health/supabase` ✅
  - `GET /api/health/marleny` ✅
  - `GET /api/health/openai` ✅
  - `GET /api/health/automation` ✅
- Automatización:
  - `GET /api/automation/candidates` ✅ (200)
  - `GET /api/automation/self-test` ✅ (200, **inserta 1 draft**)
  - `POST /api/automation/editorial-orchestrate?test=true` ✅ (200, **inserta 1 draft**, devuelve `id`)
- Cache reset:
  - `GET /api/cache/version` ✅ (200)
  - `GET /api/cache/clear?...` ✅ (302 + header `Clear-Site-Data`)

---

## 3) Auth/Admin — login y reset de contraseña
### 3.1 Login admin (cookies SSR)
- UI: `src/app/admin/login/ui.tsx`
- Login real se hace server-side: `POST /api/auth/login` ✅ (setea cookies SSR para middleware)

### 3.2 “Ojito” mostrar/ocultar contraseña
- Implementado en `src/app/admin/login/ui.tsx` ✅

### 3.3 Olvidé mi contraseña (email)
Implementación ✅:
- Botón “Restablecer contraseña (email)” en `/admin/login`
  - Usa Supabase Auth `resetPasswordForEmail` (cliente browser)
  - `redirectTo`: `/admin/force-password-change`

### 3.4 Página de cambio de contraseña (doble modo)
`/admin/force-password-change` funciona en 2 modos:
- **Modo A (forced-change)**: usuario ya tiene sesión SSR → usa `POST /api/auth/update-password` + `POST /api/admin/clear-must-change`
- **Modo B (recovery email)**: llega con `?code=` → hace `exchangeCodeForSession(code)` y luego `auth.updateUser({ password })` en browser, y envía al usuario a login.

Archivos:
- `src/app/admin/force-password-change/ui.tsx`

---

## 4) Editorial (admin) y publicación
### 4.1 Cola editorial
Ruta: `/admin/content`
- Aprueba/rechaza/edita drafts ✅
- Publica blog a Centro Informativo vía `POST /api/admin/news/publish` ✅
- Envía a n8n (WAIT) vía `POST /api/automation/submit` ✅ (solo `approved`)

### 4.2 Publicar a redes (gobernado por Admin Panel)
Ruta: `/admin/content`
- Botón: **“Publicar a redes (n8n)”** ✅
- Crea publicaciones por plataforma y (opcional) envía a n8n inmediatamente.

API:
- `POST /api/admin/publications/publish-from-draft` ✅

Modelo de credenciales:
- La app **NO guarda tokens de redes**.
- n8n **sí** guarda credenciales (Meta, X, Telegram, etc.) y ejecuta publicación.

---

## 5) Cache reset global (usuarios)
Objetivo: forzar que dispositivos con “versión vieja” limpien cachés del sitio.

Implementación ✅:
- Botón en `/admin`: “Reset de caché (usuarios)” (verde) → `POST /api/admin/cache-bust`
- Watcher global en `src/app/layout.tsx` → `CacheResetWatcher`
- Disparo: compara `cache_version`; si cambió, navega a `/api/cache/clear`
- `GET /api/cache/clear` envía `Clear-Site-Data: "cache", "storage"` y redirige a la página previa.

Persistencia:
- `public.app_settings` (solo key `cache_version`) con policy de lectura pública solo para esa key.

---

## 6) n8n y redes (checklist)
Checklist actualizado en:
- `docs/admin/ADMIN_MANUAL.md` ✅

Incluye: Facebook/IG/X/Threads/Telegram/WhatsApp/YouTube/LinkedIn/Reddit y prueba rápida desde `/admin/content`.

---

## 7) Fixes realizados durante el audit
- Añadido “ojito” en login admin.
- Añadido flujo real de **reset password por email**.
- Hardening de página `force-password-change` para soportar `?code=` (recovery).

---

## 8) Riesgos/limitaciones conocidas (aceptables)
- No existe forma de “borrar el caché del navegador completo”; solo del **origen** (lo que hace `Clear-Site-Data`).
- Publicación real a redes depende de conectores/credenciales en n8n (por diseño).

