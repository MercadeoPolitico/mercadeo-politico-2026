## Runbook — Auto-blog / Auto-publicación (global)

### Objetivo
Generar y publicar automáticamente **1 noticia por político cada 4 horas**, y enviarla a redes sociales **solo si** existe autorización aprobada.

---

### 1) Control (Admin Panel)
Ruta: `/admin/content`
- Toggle arriba a la derecha: **AUTO ON/OFF**

Comportamiento:
- **ON**: habilita cron global.
- **OFF**: cron se detiene (no crea ni publica automáticamente).

Configuración (en base de datos):
- `app_settings.auto_blog_global_enabled` = `"true" | "false"` (default: `"true"`)
- `app_settings.auto_blog_every_hours` = `"4"` (default: 4)

---

### 2) Scheduler (Railway Worker)
Endpoint: `GET /api/cron/auto-blog` (protegido por `CRON_SECRET`)

Cadencia:
- Se ejecuta cada ~20 min (Railway Worker).
- Por candidato, respeta:
  - `politicians.auto_blog_enabled = true`
  - `politicians.auto_publish_enabled = true`
  - `politicians.last_auto_blog_at` (no repite antes de 4h)

Motor:
- Llama internamente `POST /api/automation/editorial-orchestrate`
  - Ese motor genera draft + autopublish en Centro Informativo
  - Envío a redes: best-effort a n8n usando destinos **approved**

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
- Si publica en web pero no en redes:
  - No hay destinos `approved` en `/admin/networks`
  - n8n no está configurado o no responde

