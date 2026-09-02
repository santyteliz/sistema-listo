# CLAUDE.md — Personalizador de virolas de mates

## Objetivo
App web independiente (fuera de Tienda Nube) donde los clientes personalizan la virola
de su mate. Cualquiera puede diseñar libremente sin cuenta. Solo quien tiene una compra
válida en Tienda Nube puede enviar el diseño definitivo a producción.

Contexto de negocio y experiencia de usuario completos: ver `docs/PRODUCT.md`.

## Arquitectura (ver docs/ARCHITECTURE.md para el detalle y las decisiones)
- Frontend: React + TypeScript + Vite.
- Backend: Node.js + TypeScript, desacoplado en capa `OrderProvider` para Tienda Nube.
- Motor gráfico del editor: a definir en el prototipo inicial (ver Fase 1) — evaluar
  Fabric.js vs Konva antes de comprometerse.
- Deploy final: Hostinger (self-hosted), NO WordPress.
- Monorepo simple (`apps/web`, `apps/api`, `packages/shared`) — sin sobreingeniería,
  ajustar tamaño real al del MVP.

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

## Estructura de carpetas
```
apps/web/         → frontend
apps/api/          → backend
packages/shared/    → tipos y lógica compartida
docs/               → documentación del proyecto (ver abajo)
.claude/skills/      → procedimientos reutilizables
.claude/agents/       → subagentes especializados
```

## Documentación del proyecto
- `docs/PRODUCT.md` — visión, usuarios, flujos, estados.
- `docs/ARCHITECTURE.md` — arquitectura, módulos, decisiones de stack.
- `docs/TIENDANUBE.md` — integración, eventos, datos pendientes.
- `docs/PRODUCTION-SPECS.md` — medidas, plantillas, formatos, pendientes.
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

## Primera tarea (no construir toda la app todavía)
1. Analizar este proyecto y proponer arquitectura inicial.
2. Identificar decisiones que dependen de datos que aún no tenemos.
3. Evaluar Fabric.js vs Konva y recomendar uno para el MVP.
4. Crear `docs/`, este `CLAUDE.md`, `.claude/skills/`, `.claude/agents/`.
5. Mostrar un plan de implementación por fases.
6. Detenerse antes de programar el prototipo del editor y esperar confirmación.
