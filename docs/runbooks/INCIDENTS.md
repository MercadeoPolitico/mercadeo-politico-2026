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

### 2.1) “AUTO ON pero publica en ráfagas / patrón de spam”
**Síntomas**
- Varias publicaciones salen al mismo minuto o en ventanas muy cortas.

**Causa**
- Muchos candidatos quedan “due” al mismo tiempo.

**Fix**
- El backend ya aplica mitigación:
  - jitter determinístico por candidato: `app_settings.auto_blog_jitter_minutes` (default 37)
  - límite por corrida (`max_per_run` calculado)
- Si quieres más dispersión, sube `auto_blog_jitter_minutes` (ej. 55–75).

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

---

### 5) "Publicar en Facebook da error" (n8n / redes)
**Causas comunes**
- Destino sin `page_id` (Facebook requiere ID de página, no de usuario).
- Token OAuth expirado o revocado (reconectar por enlace OAuth en Admin → n8n/Redes).
- Meta Graph API devuelve error (revisar respuesta 502: `meta_code` / `meta_message`).

**Fix**
- Admin → n8n/Redes: destino Facebook debe tener ruteo con `target_id` = ID de la página.
- Reconectar Meta: generar enlace OAuth (APP), enviar por WhatsApp, completar flujo.
- En n8n (Railway): `MP26_APP_BASE_URL` y `MP26_AUTOMATION_TOKEN` para llamar `POST /api/automation/social/publish`.
- Ver runbook `OAUTH_CONNECT_META_X_REDDIT.md`.

