## Incidents — mercadeo-politico-2026

### 1) “No se aplican migraciones / columnas faltantes”
**Síntomas**
- Errores al publicar (subtitle, RSS health, trazabilidad)

**Causa**
- Migraciones no aplicadas en Supabase.

**Fix**
- Ejecutar migraciones nuevas en Supabase (SQL Editor) o `supabase db push` (CLI).

---

### 2) “AUTO ON pero no publica”
**Causas comunes**
- Worker no está corriendo (Railway).
- Faltan env vars (`MP26_BASE_URL`, `CRON_SECRET`) en el worker.
- `politicians.auto_blog_enabled` o `auto_publish_enabled` está en false.

**Fix**
- Ver runbook: `docs/runbooks/AUTO_BLOG.md`.

---

### 3) “Enlace de autorización no funciona”
**Causas comunes**
- Token expirado (5h).
- Migración de trazabilidad no aplicada (campos nuevos).

**Fix**
- Generar nuevo enlace en `/admin/networks`.
- Ver runbook: `docs/runbooks/SOCIAL_AUTH.md`.

---

### 4) “RSS en rojo (caída)”
**Causas comunes**
- RSS no responde o cambió formato.
- Latencia alta.

**Fix**
- Desactivar temporalmente o cambiar URL.
- Ver `GET /api/admin/rss/list?with_health=1` (admin).

