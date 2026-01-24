## Runbook — Keepalive (Supabase / Railway / n8n)

### Objetivo
Evitar que servicios “duerman” o se desconecten por inactividad (especialmente en planes free).

Este repo implementa **dos capas reales**:
- **Railway Worker (scheduler)**: llama periódicamente `GET /api/cron/keepalive`
- **GitHub Actions (schedule)**: redundancia que también llama el mismo endpoint

> El endpoint está protegido por `CRON_SECRET` (Bearer).

---

### 1) Endpoint
- Ruta: `GET /api/cron/keepalive`
- Auth:
  - Header: `Authorization: Bearer <CRON_SECRET>`
  - Alternativa (automatización): `x-automation-token: <MP26_AUTOMATION_TOKEN>`

Qué hace:
- **Supabase**: query mínima (HEAD select) a `politicians` (usa service role server-side).
- **HTTP keepalive**: pings a URLs públicas configuradas para mantener “calientes” servicios externos.

Salida: JSON con métricas sin secretos (solo `host`, `ok`, `status`, `ms`).

---

### 2) Variables de entorno (App / Vercel y/o Railway)
Requeridas:
- `CRON_SECRET`: secreto para Worker / GitHub Actions

Opcionales:
- `KEEPALIVE_URLS`: lista separada por coma con endpoints públicos a pingear.
  - Ejemplo: `https://n8n-production-1504.up.railway.app,https://tu-worker.up.railway.app/health`
- `N8N_INSTANCE_URL`: alternativa simple (si no usas `KEEPALIVE_URLS`)

---

### 3) Railway Worker (recomendado)
El worker (`workers/`) ejecuta pings periódicos sin depender de Vercel Cron (útil si hay límites de plan).

Variables en Railway Worker:
- `MP26_BASE_URL` = `https://<tu-dominio-vercel>`
- `CRON_SECRET` = igual al de la app

> Nota: `vercel.json` mantiene `"crons": []` para evitar bloqueos por límites de scheduling.

---

### 4) GitHub Actions (redundancia)
Workflow: `.github/workflows/keepalive.yml`

Configurar **GitHub Secrets** en el repo:
- `MP26_KEEPALIVE_URL`:
  - ejemplo: `https://<tu-dominio>/api/cron/keepalive`
- `MP26_CRON_SECRET`:
  - el mismo valor que `CRON_SECRET` en Vercel

---

### 5) Diagnóstico
Si el keepalive falla:
- Revisa el response status (401 indica token/secret incorrecto).
- Verifica que `SUPABASE_SERVICE_ROLE_KEY` esté presente en Vercel (para ping Supabase).
- Verifica que `KEEPALIVE_URLS` apunte a endpoints públicos correctos.

