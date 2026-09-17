# Personalizador de mates — MateShop

App web independiente donde los clientes de MateShop diseñan el grabado de la virola
de su mate: texto curvo, íconos de un catálogo propio (o subiendo su propia imagen),
y líneas circulares decorativas. El diseño se guarda solo en el navegador y se
exporta como SVG/PDF vectoriales listos para producción.

## Instalar

Requiere Node.js (probado con Node v24; Node 20 LTS o más nuevo debería funcionar).

```bash
npm install
```

## Ejecutar en desarrollo

```bash
npm run dev
```

Levanta el editor en `http://localhost:5173/` (también accesible desde otros
dispositivos de la misma red — ver la URL "Network" que imprime la terminal).

## Build de producción

```bash
npm run build
```

Genera `dist/` (contenido 100% estático — HTML/CSS/JS/WASM). Falla si hay errores de
TypeScript (`tsc -b` corre antes del build de Vite, a propósito).

## Comandos disponibles

| Comando | Qué hace |
|---|---|
| `npm run dev` | servidor de desarrollo (Vite) |
| `npm run build` | `tsc -b` + build de producción a `dist/` |
| `npm run lint` | `oxlint` sobre `src/` |
| `npm run preview` | sirve `dist/` localmente para probar el build ya generado |
| `npx tsx --test $(find src -name "*.test.ts" -o -name "*.test.tsx")` | corre toda la suite de tests (no hay un script `npm test` — ver `docs/HANDOFF-CHECKLIST.md`) |

## Documentación

- `docs/TEAM-HANDOFF.md` — **empezar por acá** si vas a hacer cambios visuales o de
  deployment: qué está congelado, qué se puede tocar, ejemplos concretos.
- `docs/DEPLOYMENT-HANDOFF.md` — instalar, buildear y desplegar en Hostinger.
- `docs/HANDOFF-CHECKLIST.md` — checklist de verificación local/editor/mobile/deploy.
- `docs/ARCHITECTURE.md` — arquitectura del editor y decisiones de diseño técnico.
- `docs/DECISIONS.md` — decisiones técnicas ya tomadas y por qué (ej. Fabric.js vs
  Konva, identificación de pedidos).
- `docs/PRODUCT.md`, `docs/PRODUCTION-SPECS.md`, `docs/TIENDANUBE.md` — pendientes de
  completar (contexto de negocio/integración con Tienda Nube, todavía en curso en
  otra línea de trabajo — no necesarios para tareas visuales/deployment).
- `CLAUDE.md` — reglas para Claude Code en este repositorio.

## Estado del proyecto

El editor **ya está funcional y validado** (funcionalidad completa + una auditoría de
QA dedicada). A partir de este punto, su funcionamiento está **congelado**: cualquier
trabajo visual o de integración/deployment no debe alterar cómo se comporta el
editor. El detalle completo — qué carpetas están congeladas, qué se puede modificar
libremente, y ejemplos concretos de cambio visual vs. funcional — está en
`docs/TEAM-HANDOFF.md`.

## Stack

React 19 + TypeScript + Vite 8 + Fabric.js 6.0.2. Sin backend, sin base de datos, sin
routing (aplicación de una sola página).
