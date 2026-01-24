## Mercadeo Político Digital 2026 — Presentación para Candidatos

### Qué es
Una plataforma de comunicación política **ética, automatizada y gobernada** para Colombia 2026:
- Publica noticias y análisis cívico en un **Centro Informativo** (sitio web)
- Genera versiones listas para redes (Facebook/Instagram/Threads/X/Telegram/Reddit)
- Mantiene el control editorial en el **Admin Panel** (sin depender de personas técnicas)

---

## Problema que resolvemos
- La campaña pierde tiempo “reaccionando tarde” a la agenda pública.
- Se publica contenido sin consistencia de tono, datos o identidad.
- El equipo se desgasta operando herramientas sueltas (WhatsApp + redes + documentos + diseñadores).
- No hay gobierno: quién aprueba, quién publica, qué se puede automatizar.

---

## Qué hace el sistema (en simple)
### 1) Centro Informativo Ciudadano (web)
- Publica artículos cívicos, verificables y útiles.
- Cada artículo muestra:
  - **Título** (sin mencionar al candidato)
  - **Subtítulo editorial**: `Nombre · Cargo · Eje/Propuesta…`
  - Fuente (si existe)

### 2) Automatización “sin caos” (con torre de control)
- La IA genera borradores + variantes por red.
- El Admin Panel decide:
  - qué se aprueba
  - qué se publica
  - a qué redes se envía (solo redes autorizadas)

### 3) Publicación en redes (con autorización del dueño)
- El administrador genera un **enlace**.
- Se lo envía al dueño de la red por WhatsApp.
- El dueño aprueba/rechaza.
- El sistema registra quién autorizó y cuándo.

---

## Arquitectura (sin secretos)
- **Frontend / Backend**: Next.js (App Router) + TypeScript
- **Base de datos y Auth**: Supabase (Postgres + RLS)
- **Hosting web + cron**: Vercel
- **Automatización**: n8n (Railway) como motor de ejecución

Principios:
- El Admin Panel es la **torre de control** (no se “opera n8n” manualmente).
- La app **no expone secretos** en UI.
- La autorización de publicación **la concede el dueño** mediante enlace.

---

## Flujo operativo recomendado (semana a semana)
1. AUTO ON (si se desea):
   - El sistema crea y publica 1 noticia por candidato cada 4 horas (y la envía a redes autorizadas).
2. Revisión humana (cuando aplique):
   - Admin revisa borradores en `/admin/content`
   - Ajusta texto/variantes
   - Aprueba y publica
3. Redes sociales:
   - Solo se envía a redes con autorización `approved`

---

## Qué recibe el candidato (beneficios directos)
- **Constancia**: presencia diaria sin depender de “estar disponible”.
- **Narrativa**: coherencia por ejes y programa.
- **Velocidad**: respuesta rápida a noticias regionales/nacionales.
- **Gobierno**: trazabilidad de autorizaciones, decisiones y publicación.
- **Escala**: la plataforma soporta múltiples candidatos sin duplicar trabajo.

---

## Implementación (onboarding)
### Paso 1 — Perfil del candidato
- Biografía, propuestas, tarjetón

### Paso 2 — Conectar redes (autorización)
- Registrar destino social (URL)
- Generar enlace
- Enviar por WhatsApp
- El dueño aprueba

### Paso 3 — Arranque controlado
- Activar AUTO ON (opcional)
- Revisar primeras publicaciones

---

## Cumplimiento y responsabilidad
- No se publican datos personales de ciudadanía.
- Se evita desinformación (enfoque cívico y verificable).
- Firma/descargos editoriales en el contenido generado (según configuración).

