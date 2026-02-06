## Runbook — Auto-blog / Auto-publicación (global)

### Objetivo
Generar y publicar automáticamente **1 noticia por candidato cada 8 horas** (**3 por 24 h**), y enviarla a redes sociales **solo si** existe autorización aprobada. Auto publicado por defecto **ON**. Siempre noticias nuevas (evita URLs/títulos ya usados).

---

### 1) Control (Admin Panel)
Ruta: `/admin/content`
- Toggle arriba a la derecha: **AUTO ON/OFF** (por defecto **ON**).

Comportamiento:
- **ON**: habilita cron global; cada candidato recibe 1 publicación por ventana de 8 h (3 en 24 h).
- **OFF**: cron se detiene (no crea ni publica automáticamente).

Configuración (en base de datos):
- `app_settings.auto_blog_global_enabled` = `"true" | "false"` (default: `"true"`)
- `app_settings.auto_blog_every_hours` = `"8"` (default: 8) → 3 publicaciones / 24 h por candidato.
- `app_settings.auto_blog_jitter_minutes` = `"0".."180"` (default: **60**)

Rotación para evitar detección (Facebook y otras redes):
- El **jitter** (p. ej. 60 min) hace que la *siguiente* publicación no sea exactamente a las 8 h, sino entre 8 h y 9 h después (según candidato y ciclo). Así no se ve un patrón fijo tipo “cada 8 h en punto”. Sigue siendo 3 en 24 h, pero con horarios variables (útil si se está viajando o sin supervisión constante).

---

### 2) Scheduler (Railway Worker)
Endpoint: `GET /api/cron/auto-blog` (protegido por `CRON_SECRET`)

Cadencia:
- Se ejecuta cada ~20 min (Railway Worker).
- Por candidato, respeta:
  - `politicians.auto_blog_enabled = true`
  - `politicians.auto_publish_enabled = true`
  - `politicians.last_auto_blog_at` (no repite antes de 8 h + jitter)

Motor:
- **1 llamada** a `POST /api/automation/editorial-orchestrate` por candidato cuando “le toca”.
- Ese motor elige **noticia nueva** (RSS/GDELT), genera draft + autopublish en Centro Informativo, envía a n8n (destinos **approved**).

---

### 3) Variables de entorno requeridas
En la App (Vercel):
- `CRON_SECRET`
- `MP26_AUTOMATION_TOKEN` (o `AUTOMATION_API_TOKEN`)
- Variables de Supabase (incluye `SUPABASE_SERVICE_ROLE_KEY`)
- n8n forwarding (si aplica): `N8N_FORWARD_ENABLED`, `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_TOKEN`

En Railway Worker:
- `MP26_BASE_URL` = `https://<tu-dominio-vercel>`
- `CRON_SECRET` = igual al de la app

---

### 4) Troubleshooting
- Si no genera:
  - `AUTO OFF` en `/admin/content`
  - `CRON_SECRET` no configurado en Vercel
  - `MP26_AUTOMATION_TOKEN` faltante
  - `politicians.auto_blog_enabled` o `auto_publish_enabled` en false
  - **Railway Worker** no está corriendo o no tiene `MP26_BASE_URL` y `CRON_SECRET`
  - Candidatos con `last_auto_blog_at` null se consideran "due" en la primera ejecución del cron
- Si publica en web pero no en redes:
  - No hay destinos `approved` en `/admin/networks`
  - n8n no está configurado o no responde
  - Para Facebook: destino debe tener `target_id` (page_id) y conexión OAuth completada (enlace por WhatsApp)

