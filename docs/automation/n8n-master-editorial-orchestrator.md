# n8n — Master Editorial Orchestrator (mercadeo-politico-2026)

Este documento describe **un workflow maestro** en n8n para orquestar generación editorial basada en noticias,
usando:
- **GDELT** (noticias)
- **Marleny AI (MSI)** (interpretación política / coherencia / ética)
- **OpenAI (opcional)** (análisis de sentimiento + keywords + adaptación por plataforma; sin “significado político”)

> Fuente de verdad: **Supabase + Next.js**.  
> n8n solo orquesta llamadas a API y scheduling.

---

## 1) Requisitos (sin secretos)

### En el App (Vercel / server)
- `AUTOMATION_API_TOKEN` (token para n8n → Next.js)
- `MARLENY_AI_ENABLED="true"`, `MARLENY_AI_ENDPOINT`, `MARLENY_AI_API_KEY`
- (Opcional) `OPENAI_ENABLED="true"`, `OPENAI_API_KEY`, `OPENAI_MODEL` (y opcional `OPENAI_BASE_URL`)

### En n8n (env o credenciales)
Define variables de entorno en n8n (o credenciales) para no hardcodear:
- `MP26_BASE_URL` (ej. tu dominio en Vercel)
- `MP26_AUTOMATION_TOKEN` (igual a `AUTOMATION_API_TOKEN`)

---

## 2) Endpoints usados (Next.js)

Token header requerido: `x-automation-token: <AUTOMATION_API_TOKEN>`

- `GET /api/automation/candidates`
  - devuelve lista dinámica de candidatos (tabla `politicians`)
- `POST /api/automation/editorial-orchestrate`
  - body: `{ "candidate_id": "...", "max_items": 1 }`
  - crea borrador en `ai_drafts` con `source="n8n"` y `status="pending_review"`
  - respeta `auto_blog_enabled` (si OFF → `skipped`)

---

## 3) Scheduling recomendado (fase 1, sin auto-publicación)

Regla:
- **Senado**: hasta 4 ejecuciones/día
- **Cámara**: menos ejecuciones, foco regional

Implementación sugerida:
- Un **Cron** n8n cada 6 horas.
- Dentro del workflow:
  - filtra candidatos con `auto_blog_enabled=true`
  - aplica un “stagger” determinista (hash del candidate_id) para escalonar horas por candidato.

---

## 4) Workflow JSON

Importa este archivo en n8n:
- `docs/automation/n8n-master-editorial-orchestrator.json`

Luego ajusta (env en n8n):
- `MP26_BASE_URL`
- `MP26_AUTOMATION_TOKEN`
- `N8N_WEBHOOK_TOKEN`

### Seguridad del webhook (server-to-server)
El workflow expone un Webhook trigger `mp26-editorial-orchestrator` y **rechaza llamadas públicas**:
- El backend llama el webhook con header `x-n8n-webhook-token: <N8N_WEBHOOK_TOKEN>`
- El workflow valida el token en el nodo:
  - `IF webhook token ok?`
  - Si no coincide → `Respond 401 (unauthorized)`

### Activación sin UI (recomendado)
Si el webhook devuelve **404** incluso con URL correcta, el workflow no está activo/importado.

Opción recomendada (sin entrar a n8n como Admin):
1) Crear una vez un API key en n8n (Settings → n8n API) y guardarlo como `N8N_API_KEY` (secreto, server-only).
2) Ejecutar el ensure idempotente desde este repo:

```bash
node scripts/ensure-n8n-workflow-ready.mjs
```

---

## 5) Review & Publish (fase 1)

Este workflow **NO publica**.
Todo queda en cola editorial:
- Admin revisa en `/admin/content`
- Publicación a “Centro informativo ciudadano” se hace con el botón de publicación existente.

