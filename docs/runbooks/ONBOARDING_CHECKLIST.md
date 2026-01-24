## Onboarding checklist — mercadeo-politico-2026

### Seguridad
- No commitear `.env*` ni tokens/keys.
- No imprimir secretos en logs.

---

## A) Admin listo
- Existe super_admin/admin en `public.profiles`.
- Login en `/admin/login` funciona.
- Si aplica, `force-password-change` funciona.

---

## B) Redes sociales (autorización por enlace)
En `/admin/networks`:
- Crear destino social
- Generar enlace (copiar)
- Abrir enlace como dueño en `/autorizar?token=...`
- Ver estado `approved` + trazabilidad (quién/cuándo)

---

## C) RSS (gestionable por admin)
En `/admin/networks`:
- Crear fuente RSS (name/region/rss_url/active)
- Ver señal automática (verde/amarillo/rojo)

---

## D) Auto-blog/autopublish (global)
En `/admin/content`:
- AUTO ON (default)
- Verificar que `/api/cron/auto-blog` corre (por Worker)

---

## E) Scheduler (Railway Worker)
- Worker corriendo y loguea:
  - `keepalive` cada ~15 min
  - `auto_blog` cada ~20 min

