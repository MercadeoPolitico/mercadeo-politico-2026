## Runbook — Autorización de redes (link + trazabilidad)

### Objetivo
Que el **dueño** de una red social autorice la publicación sin que el admin maneje secretos.

---

### 1) Flujo operativo
Ruta Admin: `/admin/networks`

1. Admin registra un destino social (candidato + URL).
2. Admin presiona **“Generar enlace (copiar)”**.
3. Envía ese enlace por WhatsApp (o el canal que prefiera).
4. El dueño abre `/autorizar?token=...` y elige:
   - Aprobar
   - Rechazar
5. El Admin Panel muestra estado con señal y fecha.

Estados:
- `pending`: invitación pendiente
- `approved`: autorizado
- `expired`: enlace vencido
- `revoked`: revocado (por admin)

---

### 2) Qué se registra (toda la trazabilidad es “safe”)
En DB:
- `politician_social_auth_invites`:
  - `authorized_by_name/email/phone` (lo que el dueño escribe)
  - `authorized_ip`, `authorized_user_agent`
  - `used_at` + `decision`
- `politician_social_destinations`:
  - `authorized_by_*` + `authorized_at`

---

### 3) Endpoint público
- `GET /api/public/network-authorization?token=...`: valida el enlace
- `POST /api/public/network-authorization`: guarda decisión + trazabilidad

---

### 4) Seguridad
- Los tokens no se guardan en texto plano: se guarda `token_hash` (sha256) en DB.
- El enlace expira (por defecto 5 horas).
- El flujo de aprobación/rechazo usa service role server-side (no depende de RLS del visitante).

