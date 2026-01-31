# Runbook — Borrar noticias y regenerar 2 por político

## Objetivo
Borrar todas las publicaciones del Centro Informativo y generar **2 artículos nuevos por político** (imágenes por región y coherentes con el artículo). **Las imágenes solo cambian cuando se regenera el contenido**; el feed lee de Supabase (`citizen_news_posts`), no del código en tiempo real.

---

## 1) Requisitos
- `npm ci` o `npm install` ejecutado antes (el script usa `@supabase/supabase-js` vía createRequire).
- `.env.local` con:
  - `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  - `MP26_BASE_URL` = **URL de producción** (ej. `https://mercadeo-politico-2026.vercel.app`) para que la API use el pipeline de imágenes desplegado.
  - `MP26_AUTOMATION_TOKEN`
- **Producción:** siempre usa `MP26_BASE_URL=https://mercadeo-politico-2026.vercel.app` al ejecutar el script (o ponla en `.env.local`) para que las imágenes sigan la lógica actual (sin RSS en arriendo/vivienda, Commons > AI > RSS).
- Opcional: purgar desde el servidor con `POST /api/automation/ci-purge` (header `x-automation-token`), luego ejecutar el script con `CI_SKIP_PURGE=1` para solo regenerar.
- Dependencias instaladas: `npm ci` o `npm install`.

---

## 2) Orden de ejecución

```powershell
# 1) Smoke rápido (opcional, verifica que la API responde)
npm run smoke:prod

# 2) Borrar todas las noticias y regenerar 2 por político (tarda varios minutos)
npm run ci:purge-regenerate

# 3) Verificar: exactamente 2 publicados por político, con imagen real (no placeholder)
npm run ci:verify

# 4) Reporte por región y por político (imágenes: with_image, placeholder)
npm run ci:report

# 5) Smoke final
npm run smoke
```

---

## 3) Scripts npm
- `ci:purge-regenerate`: purga `citizen_news_posts` y llama a `POST /api/automation/editorial-orchestrate` 2 veces por político (viral + grave), hace top-up si hace falta y deja exactamente 2 por político.
- `ci:verify`: comprueba 2 publicados por político y que cada uno tenga `media_urls` y no sea solo placeholder (`/fallback/news.svg`). Sale con código 1 si falla.
- `ci:report`: imprime resumen por político y por región (posts, with_image, placeholder).

---

## 4) Revisión de imágenes
- **Por político:** ver salida de `npm run ci:report` (by_politician).
- **Por región:** ver salida de `npm run ci:report` (by_region).
- Si hay muchos `placeholder`, el motor no encontró imagen CC/AI suficiente; revisar runbook AUTO_BLOG y variables de Supabase/API.
