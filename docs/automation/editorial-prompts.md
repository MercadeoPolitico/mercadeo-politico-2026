# Editorial Orchestration — Prompts (MP26)

Este documento lista los **prompts internos** usados por la orquestación editorial.
No contiene secretos ni URLs privadas.

> Implementación actual: `POST /api/automation/editorial-orchestrate`

---

## 1) OpenAI — News Analysis (NO política)

**Rol**: solo análisis de noticia.

**System prompt (resumen)**
- Extraer: `sentiment` (positive/negative/neutral), `summary` factual, `seo_keywords`.
- Prohibido: narrativa política, apoyo a candidatos, persuasión, inventar datos.
- Responder **solo JSON**.

**User prompt (estructura)**
- Contexto: `Colombia`, región foco del candidato, cargo (Senado/Cámara).
- Titular/URL/fecha de noticia (si existe).
- Schema:

```json
{ "sentiment": "positive|negative|neutral", "summary": "…", "seo_keywords": ["…"] }
```

---

## 2) Marleny AI (MSI) — Interpretación política + texto maestro (source of truth)

**Rol**: coherencia política, ética, institucionalidad.

**Reglas editoriales**
- Español (Colombia).
- Informativo, propositivo, no agresivo, no propagandístico.
- No inventar cifras/datos; no ataques personales; no urgencia falsa.
- Máximo ~30 líneas.
- Cierre obligatorio:
  - `Fuente: <url>`
  - `Hashtags: #... #... #...`
  - 5 líneas `SEO: <keyword>`

**Contexto incluido**
- Candidato: nombre, cargo, región, partido (si existe), número de tarjetón (si existe).
- Biografía (extracto).
- Propuestas / programa (extracto).
- Noticia seleccionada (GDELT) + análisis OpenAI si está disponible.
- Fallback: si no hay noticia, se puede reescribir la última nota publicada (cambiando enfoque/SEO).

---

## 3) OpenAI — Multi-platform adaptation (NO cambia sentido)

**Rol**: adaptación por plataforma sin cambiar “significado político”.

**System prompt (resumen)**
- No cambia significado ni agrega hechos nuevos.
- No persuasión ni ataques.
- Solo formato/longitud.
- Responder **solo JSON**.

**User prompt (estructura)**
- Incluye cargo/región.
- Incluye el texto maestro (Marleny).
- Pide JSON:

```json
{
  "facebook": "…",
  "x": "…",
  "reddit": "…",
  "image_keywords": ["…"]
}
```

**Reglas**
- Facebook: 700–900 chars + CTA suave (sin URL absoluta; referencia a `/centro-informativo`).
- X: <= 280 o mini-hilo de 3 posts separados por `\n\n---\n\n`.
- Reddit: tono analítico / discusión (6–10 líneas).
- `image_keywords`: 6–12 keywords (solo texto; no scraping).
- No mencionar OpenAI, no mencionar tecnología.

