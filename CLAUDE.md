# CLAUDE.md — Personalizador de virolas de mates

# MATE SHOP — VISUAL/DEPLOYMENT HANDOFF

**Leé esto primero, siempre, antes de cualquier otra sección de este archivo.**

El personalizador (`src/editor/`) ya tiene una funcionalidad completa, probada y
auditada — está **congelada**. El desarrollador que trabaja en esta copia del
repositorio está autorizado a trabajar en **visual y deployment** (integrar la
landing existente del cliente, cambios de diseño/CSS, y desplegar en Hostinger) —
nunca en la lógica del editor. En paralelo, otra línea de trabajo separada se ocupa
de Tiendanube/backend/checkout — tampoco es responsabilidad de este handoff.

Reglas no negociables para Claude Code en este repositorio:

- **No modificar la lógica del editor** (todo lo que vive en `src/editor/canvas/`,
  `src/editor/icons/`, `src/editor/history/`, `src/editor/persistence/`,
  `src/editor/export/`, `src/editor/state/`, `src/editor/fonts/`, y la parte `.tsx`
  — no el `.css` hermano — de `src/editor/panels/` y `src/components/layout/`). Ver
  el detalle completo, con las rutas reales del proyecto y por qué, en
  **`docs/TEAM-HANDOFF.md`** — es la fuente de verdad, no la resumas de memoria.
- **Antes de modificar cualquier archivo `.ts`/`.tsx` dentro de `src/editor/`,
  detenerse y explicar por qué hace falta** — no asumir que un cambio visual
  requiere tocar ese archivo sin confirmarlo primero.
- **No cambiar el comportamiento mobile** (selección por toque, pellizco de dos
  dedos en texto/íconos, rotación de íconos, scroll, protección multitouch).
- **No cambiar el comportamiento desktop** (selección, mover, resize, rotar,
  toolbar, Undo/Redo, Reset) — los cambios visuales pueden cambiar cómo se ve un
  control, nunca qué hace.
- **No cambiar exportación** (SVG/PDF/combinada), **no cambiar persistencia**
  (`localStorage`), **no cambiar historial** (Undo/Redo), **no cambiar la lógica de
  íconos/vectorización** (catálogo, subida de imágenes, normalización de paths).
- Si no podés determinar con certeza si un archivo afecta el funcionamiento del
  editor: **detenete y preguntá antes de modificarlo.** No es una sugerencia.

Documentos de referencia para esta etapa (leerlos en este orden):
1. `docs/TEAM-HANDOFF.md` — qué está congelado, qué se puede tocar, ejemplos reales.
2. `docs/DEPLOYMENT-HANDOFF.md` — instalar, buildear, desplegar en Hostinger,
   integrar la landing.
3. `docs/HANDOFF-CHECKLIST.md` — checklist de verificación antes de dar algo por
   terminado.

---

## Objetivo
App web independiente (fuera de Tienda Nube) donde los clientes personalizan la virola
de su mate. Cualquiera puede diseñar libremente sin cuenta. Solo quien tiene una compra
válida en Tienda Nube puede enviar el diseño definitivo a producción.

Contexto de negocio y experiencia de usuario completos: ver `docs/PRODUCT.md`.

## Arquitectura (ver docs/ARCHITECTURE.md para el detalle y las decisiones)

**Estado real actual** (esta sección reemplaza el plan original de abajo, que nunca
se construyó así — se deja documentado para que quede claro qué cambió y por qué):
- El frontend es una **aplicación única bajo `src/`** (React + TypeScript + Vite),
  **no** un monorepo `apps/web`/`apps/api`/`packages/shared` — mientras el proyecto
  sea standalone (sin backend todavía), ese monorepo sería sobreingeniería. El editor
  vive autocontenido en `src/editor/`, listo para moverse a un `apps/web/` el día
  que se arme el monorepo real con backend, sin reescribirlo.
- Motor gráfico del editor: **Fabric.js 6.0.2**, ya decidido y validado (ver
  `docs/DECISIONS.md`, D4 — se descartó Konva y Fabric.js 5.3.1 explícitamente).
- Backend/integración con Tienda Nube: **todavía no existe** — es la otra línea de
  trabajo en curso, en paralelo a este handoff (ver la sección "MATE SHOP —
  VISUAL/DEPLOYMENT HANDOFF" arriba). No asumir que ya hay una capa `OrderProvider`
  ni ningún endpoint real.
- Deploy final: Hostinger — ver `docs/DEPLOYMENT-HANDOFF.md` para el detalle real
  (qué necesita el hosting, cómo se buildea, qué queda pendiente de decidir).

## Identificación del diseño (crítico)
El diseño NUNCA se identifica solo con el número de pedido. Se identifica con
`orderId + lineItemId (SKU) + unitIndex`, porque un pedido puede tener más de un
producto y/o más de una unidad del mismo producto. El disparador del flujo post-compra
es el webhook `order/paid` (no el checkout). Ver `docs/DECISIONS.md` (D1, D2, D3) y el
flujo completo en `docs/PRODUCT.md`.

## Reglas no negociables de seguridad
- Nunca exponer tokens/secretos/credenciales en el frontend ni en Git.
- Toda validación de compra se hace server-side contra la API real de Tienda Nube,
  nunca confiando en datos que mande el cliente.
- Sanitizar cualquier SVG o imagen subida por usuarios.
- Rate limiting en endpoints sensibles (validación de pedido, envío de diseño).
- Ante cualquier duda de seguridad: parar y preguntar antes de implementar.
- No usar `bypassPermissions` ni desactivar controles para ir más rápido.

## Reglas de trabajo
- No asumir datos técnicos que no confirmamos (medidas reales de producción, formato
  final de exportación, límites exactos de la API de Tienda Nube) — dejarlos marcados
  como pendientes en `docs/PRODUCTION-SPECS.md` y `docs/TIENDANUBE.md`.
- No hacer refactors grandes no relacionados con la tarea pedida.
- No cambiar arquitectura existente sin explicar el motivo.
- No hacer deploy de producción sin pasar `.claude/skills/deploy-check.md`.
- Antes de una funcionalidad importante, seguir `.claude/skills/feature-planning.md`.
- Trabajo con el dueño del proyecto que no programa: explicar en español simple qué se
  hizo, cómo probarlo, y cuál es el siguiente paso, al cierre de cada tarea relevante.

## Estructura de carpetas (real, verificada — no el plan original de monorepo)
```
src/editor/         → el editor completo (CONGELADO, ver arriba) — canvas, íconos,
                       history, persistence, export, state, fonts, panels (.tsx)
src/components/      → layout genérico (TopBar, Sidebar) — .tsx congelado, .css libre
src/pages/           → EditorPage (única página de la app)
src/config/          → virola.config.ts (congelado), brand.ts (visual)
public/icons/         → catálogo de íconos ya generado (manifest.json + thumbnails)
scripts/icon-import/ → pipeline offline que generó public/icons/ (no se importa
                       desde src/, pero tocarlo puede corromper el catálogo)
docs/                → documentación del proyecto (ver abajo)
.claude/skills/       → procedimientos reutilizables
.claude/agents/        → subagentes especializados
```

No existe (todavía) ningún `apps/web`/`apps/api`/`packages/shared` — ver la nota en
"Arquitectura" arriba sobre por qué el plan original de monorepo no se construyó así.

## Documentación del proyecto
- `docs/TEAM-HANDOFF.md` — handoff visual/deployment: qué está congelado, qué se
  puede tocar (leer primero si estás en la línea de trabajo visual/deployment).
- `docs/DEPLOYMENT-HANDOFF.md` — instalar, buildear, desplegar en Hostinger.
- `docs/HANDOFF-CHECKLIST.md` — checklist de verificación.
- `docs/PRODUCT.md` — visión, usuarios, flujos, estados (pendiente de completar).
- `docs/ARCHITECTURE.md` — arquitectura, módulos, decisiones de stack.
- `docs/TIENDANUBE.md` — integración, eventos, datos pendientes (pendiente de completar).
- `docs/PRODUCTION-SPECS.md` — medidas, plantillas, formatos, pendientes (pendiente de completar).
- `docs/DECISIONS.md` — decisiones técnicas y alternativas consideradas.

## Skills del proyecto
- `.claude/skills/feature-planning.md` — antes de encarar una funcionalidad importante.
- `.claude/skills/production-check.md` — antes de dar por terminada una funcionalidad
  de diseño/editor.
- `.claude/skills/tiendanube-integration.md` — para cualquier trabajo con la API de
  Tienda Nube.
- `.claude/skills/deploy-check.md` — antes de desplegar a producción.

## Subagentes
- `editor-specialist` — motor gráfico, canvas, coordenadas, texto curvo, serialización.
- `integration-specialist` — Tienda Nube, webhooks, pedidos, tokens, emails.
- `security-reviewer` — revisión de cambios sensibles (auth, uploads, secretos, endpoints).

## Primera tarea — YA COMPLETADA (se deja como referencia histórica)
Esta sección describía el arranque del proyecto (evaluar Fabric.js vs Konva, crear
`docs/`/`.claude/`, proponer arquitectura inicial). Ya se hizo — el editor está
construido, probado y congelado (ver la sección "MATE SHOP — VISUAL/DEPLOYMENT
HANDOFF" al principio de este archivo). No es una tarea pendiente para una sesión
nueva de Claude Code.
