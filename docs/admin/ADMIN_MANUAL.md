# Manual del Administrador — mercadeo-politico-2026

## Acceso y roles
- **Admin / Super Admin**: acceso total al panel interno (`/admin`).
- **Político**: acceso limitado vía **enlace exclusivo** (generado en el workspace del candidato).

## 1) Ingresar al Admin Panel
1. Ve a `/admin/login`.
2. Inicia sesión con tu email/password.
3. Si te aparece “cambio de contraseña obligatorio”, completa `/admin/force-password-change`.

## 2) Dashboard (estado del sistema)
En `/admin` verás indicadores de estado:
- **Synthetic Intelligence (Actuation)**: Marleny AI.
- **Synthetic Intelligence (Volume)**: OpenAI (apoyo).
- **n8n forwarding**: si el envío hacia n8n está habilitado.

## 3) Gestión de candidatos (workspaces)
1. Ve a `/admin/politicians`.
2. Entra al workspace del candidato: `/admin/politicians/[id]`.

En el workspace puedes:
- **Editar perfil**: biografía, propuestas, número de tarjetón.
- **Guardar cambios**: botón “Guardar cambios/Guardar perfil”.
- **Auto-blog** (ON/OFF): habilita o detiene generación automática de borradores.
- **Auto-publicación** (ON/OFF): habilita la publicación automática donde aplique (solo si hay integraciones configuradas).

## 4) Marketing Hub (archivos + generación)
En el workspace del candidato:
- **Zona de archivos**:
  - Sube imágenes, videos o PDFs al bucket `politician-media`.
  - Copia el URL público para usarlo en publicaciones o como referencia.
- **Generación de blogs**:
  - “Generar blog automático (noticias)” crea un borrador (cola `ai_drafts`) usando noticias por geolocalización.
  - “Orquestación editorial (n8n/2-AI)” crea un borrador completo con variantes por plataforma (blog / facebook / x / reddit) y SEO.

## 5) Cola editorial (revisión humana)
En `/admin/content`:
1. Selecciona un borrador de la lista.
2. Revisa y edita:
   - Texto principal (blog)
   - Variantes (facebook / instagram / x), si existen
3. Acciones:
   - **Aprobar**: cambia el estado a `approved`.
   - **Publicar en Centro informativo**: publica en `/centro-informativo` (solo para `blog` y si está `approved` o `edited`).
   - **Enviar a n8n (WAIT)**: envía el borrador aprobado a n8n para flujos externos (publicación, scheduling, etc.).

## 6) Publicaciones en redes (manual y autorizado)
El sistema funciona así (sin guardar tokens en la app):
- La app **no guarda credenciales** de redes sociales.
- **n8n guarda las credenciales** (conectores oficiales) y recibe el contenido desde la app.

### Flujo recomendado (gobernado, seguro)
1. Admin genera y aprueba un borrador en `/admin/content`.
2. Admin crea publicaciones por red desde el workspace del candidato (`/admin/politicians/[id]` → sección “Publicaciones”).
3. El político (opcional) aprueba desde su enlace exclusivo.
4. Cuando una publicación está `approved`, el admin puede presionar **“Enviar a automatización”**:
   - Se envía a n8n con `platform`, `content`, `variants` y `media_urls`.

### Qué redes están soportadas “por diseño”
Depende de lo que esté configurado en n8n, pero el sistema ya maneja el concepto de `platform`:
- `facebook`, `instagram`, `threads`, `tiktok`, `x`, `youtube`
- Se puede extender a otras redes si n8n tiene nodo/credencial.

## 7) Auto-publicación (cuando está habilitada)
Si activas **Auto-publicación** en el perfil del candidato:
- La automatización puede crear/publicar contenido sin aprobación manual (según workflow).
- Úsalo solo cuando:
  - las redes estén conectadas en n8n
  - haya un proceso editorial definido

## 8) Diagnóstico rápido (sin secretos)
Útil cuando “no publica” o “no crea drafts”:
- `GET /api/health/supabase`
- `GET /api/health/marleny`
- `GET /api/health/openai`
- `GET /api/health/automation` (token de automatización configurado, sin exponerlo)

## 9) Smoke test (verificación automática)
En el repo existe un script que prueba producción:
- `scripts/smoke-prod.mjs`

Valida:
- health checks
- `GET /api/automation/candidates`
- `GET /api/automation/self-test` (inserta 1 draft de prueba)
- `POST /api/automation/editorial-orchestrate?test=true` (inserta 1 draft de prueba)

> Nota: requiere que el token esté en `.env.local` o en variables de entorno del shell.

