/**
 * Adaptador PURO y deliberadamente chico: convierte comandos de path ya
 * parseados (`AbsCommand[]`, el mismo tipo que ya produce
 * `normalizeIconPath.ts`/consume `textOutlineExport.ts`) a las operaciones
 * que entiende `jsPDF.path()` — Etapa 12B.
 *
 * POR QUÉ SE REUTILIZA `AbsCommand`/`parsePathCommands` EN VEZ DE
 * `FabricPathCommand`: los extractores existentes (`iconExportGeometry.ts`,
 * `circularLineExportGeometry.ts`, `textOutlineExport.ts`) ya dejan cada
 * shape como un `d` de SVG ya serializado dentro de `SvgShapeSpec` — ESE
 * `d` es hoy el contrato compartido entre formatos (lo que ya arma
 * `svgDocument.ts`). Cambiar los extractores para exponer comandos
 * estructurados en vez de un `d` string tocaría el pipeline del SVG ya
 * aprobado (Etapa 10/11) sin necesidad: en cambio, este módulo PARSEA ese
 * mismo `d` con `parsePathCommands` (ya existente, ya testeado, usado hoy
 * para íconos) — cero cambios al pipeline SVG, y de paso se hereda gratis
 * el soporte de `Q` que YA tiene `AbsCommand` (a diferencia de
 * `FabricPathCommand`, que nunca lo necesita porque Fabric normaliza arcos
 * a `C` — ver el comentario de `exportPathGeometry.ts` — pero el texto
 * vectorizado por `vectortracer`, en principio, podría emitirlo).
 *
 * `jsPDF.path(lines)` (ver su propio código fuente, `src/jspdf.js`) solo
 * entiende 4 operaciones: `m` (mover), `l` (línea), `c` (curva cúbica) y
 * `h` (cerrar subtrazo) — no tiene un operador de arco ni de curva
 * cuadrática, por eso las conversiones de abajo.
 */
import type { AbsCommand } from '../icons/normalizeIconPath';
import { applyToPoint, type Matrix } from '../icons/svgTransform';

export type JsPdfPathOp =
  | { op: 'm'; c: [number, number] }
  | { op: 'l'; c: [number, number] }
  | { op: 'c'; c: [number, number, number, number, number, number] }
  | { op: 'h' };

/**
 * Convierte una curva cuadrática (`Q`, un solo punto de control) a la curva
 * cúbica equivalente (`C`, dos puntos de control) — conversión estándar,
 * exacta (no una aproximación): los puntos de control cúbicos son el punto
 * inicial y el final, cada uno desplazado 2/3 del camino hacia el único
 * punto de control cuadrático.
 */
function quadraticToCubicControlPoints(
  from: { x: number; y: number },
  control: { x: number; y: number },
  to: { x: number; y: number },
): { c1: { x: number; y: number }; c2: { x: number; y: number } } {
  const c1 = { x: from.x + (2 / 3) * (control.x - from.x), y: from.y + (2 / 3) * (control.y - from.y) };
  const c2 = { x: to.x + (2 / 3) * (control.x - to.x), y: to.y + (2 / 3) * (control.y - to.y) };
  return { c1, c2 };
}

/**
 * Punto de entrada. `commands` viene en el espacio de coordenadas ABSOLUTO
 * del canvas (px) — `matrix` es la ÚNICA transformación aplicada (canvas-px
 * → página-mm, ver `computeCanvasToPageTransform` en `exportPathGeometry.ts`,
 * la misma fuente de verdad que usa el SVG) — nunca una corrección
 * individual por shape.
 *
 * Tira un error explícito ante un comando `A` (arco) — no debería aparecer
 * nunca en la práctica (Fabric normaliza arcos de íconos/líneas a `C`, y
 * `vectortracer` no emite arcos en el texto vectorizado, verificado contra
 * una muestra real en la investigación de la Etapa 12) — mejor fallar fuerte
 * y visible que dibujar mal una curva silenciosamente.
 */
export function absCommandsToJsPdfOps(commands: readonly AbsCommand[], matrix: Matrix): JsPdfPathOp[] {
  const ops: JsPdfPathOp[] = [];
  let cursor = { x: 0, y: 0 };

  for (const cmd of commands) {
    switch (cmd.code) {
      case 'M': {
        const p = applyToPoint(matrix, cmd.x, cmd.y);
        ops.push({ op: 'm', c: [p.x, p.y] });
        cursor = p;
        break;
      }
      case 'L': {
        const p = applyToPoint(matrix, cmd.x, cmd.y);
        ops.push({ op: 'l', c: [p.x, p.y] });
        cursor = p;
        break;
      }
      case 'C': {
        const p1 = applyToPoint(matrix, cmd.x1, cmd.y1);
        const p2 = applyToPoint(matrix, cmd.x2, cmd.y2);
        const p = applyToPoint(matrix, cmd.x, cmd.y);
        ops.push({ op: 'c', c: [p1.x, p1.y, p2.x, p2.y, p.x, p.y] });
        cursor = p;
        break;
      }
      case 'Q': {
        // Se convierte en el espacio YA transformado (página-mm): una
        // transformación afín (traslación+escala uniforme, sin sesgo) lleva
        // curvas cuadráticas a curvas cuadráticas y la conversión a cúbica
        // es lineal en los puntos — da exactamente igual convertir antes o
        // después de transformar. Se hace después por simplicidad (un único
        // punto "cursor" ya transformado).
        const control = applyToPoint(matrix, cmd.x1, cmd.y1);
        const to = applyToPoint(matrix, cmd.x, cmd.y);
        const { c1, c2 } = quadraticToCubicControlPoints(cursor, control, to);
        ops.push({ op: 'c', c: [c1.x, c1.y, c2.x, c2.y, to.x, to.y] });
        cursor = to;
        break;
      }
      case 'Z':
        ops.push({ op: 'h' });
        break;
      case 'A':
        throw new Error(
          'absCommandsToJsPdfOps: comando de arco (A) inesperado — jsPDF.path() no tiene operador de arco. ' +
          'No debería ocurrir en la práctica (ver el comentario del archivo); si aparece, hace falta implementar ' +
          'una conversión arco→cúbica explícita antes de habilitar este caso.',
        );
    }
  }

  return ops;
}
