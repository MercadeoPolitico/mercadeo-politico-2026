# Runbook — Conectar redes por OAuth (Meta / X / Reddit) — MVP

Objetivo: que el Admin genere un enlace en `/admin/networks` y el **dueño** conecte su cuenta desde el celular.

Este MVP:
- **No rompe** el flujo actual de autorización por enlace (`/autorizar?token=...`).
- Guarda conexiones en Supabase:
  - `public.social_oauth_states` (estado CSRF, 10 min)
  - `public.social_oauth_connections` (tokens cifrados)

---

## 0) Pre-requisitos (una sola vez)

### A) URL base del sitio (Vercel)
En Vercel (Environment Variables), confirma:
- `NEXT_PUBLIC_SITE_URL` = tu dominio (ej. `https://mercadeo-politico-2026.vercel.app`)

### B) Cifrado obligatorio (tokens en Supabase)
Genera una llave **32 bytes** y guárdala en Vercel como **server-only**:
- `OAUTH_TOKEN_ENCRYPTION_KEY`

Comandos (PowerShell):

**Base64 (recomendado):**
```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object {Get-Random -Maximum 256}))
```

**Hex (alternativa):**
```powershell
-join ((1..32 | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) }))
```

> Nota: el sistema rechazará guardar tokens si esta variable falta o tiene formato inválido.

### C) n8n (Railway) — variables para publicar vía “OAuth bridge”
En el servicio de n8n (Railway), agrega:
- `MP26_APP_BASE_URL` = tu dominio (ej. `https://mercadeo-politico-2026.vercel.app`)
- `MP26_AUTOMATION_TOKEN` = el mismo valor que `AUTOMATION_API_TOKEN` / `MP26_AUTOMATION_TOKEN` en Vercel

Esto permite que el workflow publique vía `POST /api/automation/social/publish` cuando `credential_ref` empiece por `oauth:`.

---

## 1) Meta (Facebook Pages / Instagram Business)

### 1.1 Crear App en Meta Developers
1) Entra a Meta for Developers.
2) Crea una App (tipo “Business” suele ser lo más común).
3) Habilita el producto **Facebook Login**.

### 1.2 Configurar Redirect URL
Agrega como Redirect URL:
- `https://TU_DOMINIO/api/public/oauth/meta/callback`

### 1.3 Guardar variables en Vercel (server-only)
- `OAUTH_META_CLIENT_ID`
- `OAUTH_META_CLIENT_SECRET`

### 1.4 Scopes del MVP
El MVP pide inicialmente:
- `pages_show_list`

Para publicar, Meta puede requerir permisos adicionales y App Review (depende del objetivo exacto: páginas/IG).

---

## 2) X (Twitter)

### 2.1 Crear App en X Developer
1) Entra a X Developer portal.
2) Crea proyecto/app.
3) Habilita OAuth 2.0 (User context) con PKCE.

### 2.2 Configurar Redirect URL
Agrega:
- `https://TU_DOMINIO/api/public/oauth/x/callback`

### 2.3 Guardar variables en Vercel (server-only)
- `OAUTH_X_CLIENT_ID`
- `OAUTH_X_CLIENT_SECRET`

### 2.4 Scopes del MVP
Se solicitan:
- `tweet.read`
- `tweet.write`
- `users.read`
- `offline.access`

---

## 3) Reddit

### 3.1 Crear App en Reddit (script/web app)
1) Entra a Reddit apps.
2) Crea una app tipo OAuth (según tu caso).

### 3.2 Configurar Redirect URL
Agrega:
- `https://TU_DOMINIO/api/public/oauth/reddit/callback`

### 3.3 Guardar variables en Vercel (server-only)
- `OAUTH_REDDIT_CLIENT_ID`
- `OAUTH_REDDIT_CLIENT_SECRET`

### 3.4 Scopes del MVP
Se solicitan:
- `identity`
- `submit`

---

## 4) Uso (Admin → enlace → dueño conecta)

1) Admin va a `/admin/networks`.
2) Abre el bloque **“Conectar redes por enlace (OAuth)”**.
3) Selecciona:
   - red: Meta / X / Reddit
   - candidato
4) Click **“Generar enlace OAuth (copiar)”**.
5) Envía el link por WhatsApp al dueño de la página/cuenta.
6) El dueño abre el enlace, acepta permisos y finaliza.
7) Se registra en Supabase en `social_oauth_connections`.

---

## 5) Validación rápida (sin secretos)

- En `/admin/networks` verás el estado “configurado/no configurado” por red.
- En Supabase puedes contar filas en `social_oauth_connections` (no expone tokens).

---

## 6) Rollback seguro
Si quieres desactivar el flujo OAuth:
- Quita variables `OAUTH_*` en Vercel.
- El sistema seguirá operando con el flujo actual (n8n + autorización por enlace).

