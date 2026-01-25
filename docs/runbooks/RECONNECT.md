# Runbook — Reconnect / “Ponerse al día” (Windows + PowerShell)

Este runbook existe para cuando se corta una sesión y necesitas dejar el proyecto **operativo otra vez** sin adivinar.

## 0) Regla de oro (evitar bucles raros)
- Para flujos de login OAuth en CLIs (Vercel/Supabase/Railway), usa **Chrome** (no Edge) si Edge te ha fallado antes.

## 1) Pull + sanity checks (repo)

```powershell
cd "F:\mercadeo-politico-2026"
git status -sb
git pull
npm ci
npm run smoke
```

Si `smoke:n8n` falla con `401`, ver sección 4.

## 2) Docker (logout/login) — PowerShell

### Logout (Docker)

```powershell
docker logout
docker logout "ghcr.io" 2>$null
docker logout "registry-1.docker.io" 2>$null
```

### Login (Docker Hub)
Si necesitas loguearte con un usuario específico (ej. `merryprosperity`):

```powershell
docker login -u "merryprosperity"
```

Modo no-interactivo (recomendado si estás automatizando):

```powershell
$env:DOCKER_PASSWORD = "<PEGAR_AQUI>"
$env:DOCKER_PASSWORD | docker login -u "merryprosperity" --password-stdin
Remove-Item Env:DOCKER_PASSWORD -ErrorAction SilentlyContinue
```

## 3) CLIs (logout/login) — PowerShell

### Vercel
```powershell
npx --yes vercel whoami
# Logout (si quedó en una cuenta equivocada):
npx --yes vercel logout
# Si necesitas re-login:
npx --yes vercel login
```

### Railway
```powershell
npx --yes @railway/cli whoami
# Logout (si quedó en una cuenta equivocada):
npx --yes @railway/cli logout
# Si necesitas re-login:
npx --yes @railway/cli login
```

### Supabase
La CLI se autentica con token (o `SUPABASE_ACCESS_TOKEN` en entorno).

Login:
```powershell
npx --yes supabase login
```

“Logout” (manual): borra el token guardado si existe:
```powershell
Remove-Item "$HOME\.supabase\access-token" -Force -ErrorAction SilentlyContinue
```

## 4) n8n (Railway) — checklist cuando algo falla

### Síntoma A: `curl https://<tu-n8n>.up.railway.app` da `502`
- Revisa logs: si aparece `EACCES: permission denied, open '/data/.n8n/config'`
  - Solución reproducible en este repo: `railway/n8n/Dockerfile` (n8n como root en Railway).

### Síntoma B: `smoke:n8n` / `n8n:ensure` falla con `401 unauthorized`
Necesitas que el **Public API** esté habilitado y que el API key sea válido **para esa instancia**:
- `N8N_PUBLIC_API_DISABLED=false`
- `N8N_API_KEY` (creado en n8n UI → Settings → n8n API)
- Si tienes Basic Auth:
  - `N8N_BASIC_AUTH_ACTIVE=true`
  - `N8N_BASIC_AUTH_USER=...`
  - `N8N_BASIC_AUTH_PASSWORD=...`

Verificación desde el repo (no imprime secretos):

```powershell
npm run smoke:n8n
npm run n8n:ensure
```

## 5) Deploy “por integración Git”
Este repo está pensado para que al hacer `git push`, los providers conectados (Vercel/Railway) se actualicen por webhook.

Checklist rápido post-push:
- `npm run smoke:prod`
- `curl -I "https://<tu-n8n>.up.railway.app/"` (debe ser 200/30x/401, no 502)

