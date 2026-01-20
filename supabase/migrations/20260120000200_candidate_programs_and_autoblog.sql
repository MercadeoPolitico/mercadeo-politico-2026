-- Candidate fixes:
-- - Add auto_blog_enabled toggle (stops cron + manual generation when OFF)
-- - Update Eduard region to Colombia (senate is national)
-- - Seed proposals for Jose Angel + Eduard into politicians.proposals (if empty)

begin;

alter table public.politicians
  add column if not exists auto_blog_enabled boolean not null default true;

-- Senate is national
update public.politicians
set region = 'Colombia',
    updated_at = now()
where id = 'eduardo-buitrago';

-- Seed proposals (only if empty)
update public.politicians
set proposals = case
  when proposals is null or length(trim(proposals)) = 0 then
    $jose$
# Propuesta Programática
## José Ángel Martínez
### Cámara de Representantes – Meta

*Una representación con disciplina, humanidad y territorio*
El Meta necesita representantes que conozcan el país real, el trabajo honesto y el valor del servicio.
Esta propuesta no es un listado de promesas: es una *agenda de trabajo legislativo y territorial*, construida desde la experiencia, el respeto por la comunidad y el compromiso con Colombia.

---

## 1. El Meta primero: territorio, gente y oportunidades
Como Representante a la Cámara, José Ángel Martínez trabajará para que el Meta tenga una voz firme y constante en el Congreso de la República.
Su prioridad será:
- Defender una mayor inversión nacional en *vías terciarias, conectividad y servicios básicos*, especialmente en zonas rurales.
- Impulsar iniciativas que fortalezcan al *campesino, al ganadero, al emprendedor y al comercio local*, facilitando acceso a programas del Estado.
- Ejercer control político para que los recursos destinados al Meta *sí lleguen y sí se ejecuten correctamente*.

El Meta no puede seguir siendo estratégico solo en el discurso.

---

## 2. Dignidad para quienes sirven y protegen a Colombia
La seguridad del país empieza por el respeto a quienes han dedicado su vida a servir.
José Ángel Martínez promoverá desde el Congreso:
- El acceso oportuno y digno a *salud, pensiones y bienestar* para miembros activos y retirados de la Fuerza Pública.
- Programas de *reintegración laboral, educativa y social* para veteranos, heridos en servicio y sus familias.
- El reconocimiento institucional y social del servicio prestado, siempre desde el respeto a la Constitución y los derechos humanos.

Defender a quienes sirven al país no es ideología: es justicia.

---

## 3. Seguridad con comunidad, no desde el escritorio
La seguridad no se construye solo con fuerza, sino con confianza y presencia del Estado.
Desde su labor legislativa y de control político, impulsará:
- Estrategias de *seguridad con enfoque territorial*, adaptadas a la realidad urbana y rural del Meta.
- Coordinación efectiva entre *Fuerza Pública, autoridades locales y comunidades*.
- Seguimiento riguroso a los recursos destinados a seguridad y convivencia ciudadana.

Sin comunidad, no hay seguridad sostenible.

---

## 4. Política con ética, control y participación ciudadana
Representar es servir, escuchar y rendir cuentas.
José Ángel Martínez se compromete a:
- Ejercer un *control político serio, técnico y responsable*, sin protagonismos.
- Mantener *canales permanentes de escucha ciudadana* en el Meta.
- Informar de manera clara y periódica su gestión legislativa.

La política debe volver a ser un servicio, no un privilegio.

---

## Una propuesta honesta
Esta es una propuesta posible, responsable y construida desde la experiencia real.
No promete milagros.
Propone trabajo, coherencia y representación digna para el Meta.
$jose$
  else proposals
end,
updated_at = now()
where id = 'jose-angel-martinez';

commit;

