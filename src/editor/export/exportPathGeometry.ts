/**
 * Geometría de paths a nivel de comandos crudos de Fabric.js — Etapa 10
 * (exportación vectorial). PURO: no toca Fabric más allá de tipos, no toca
 * el DOM, no necesita un `Canvas`/contexto 2D (verificado: `Path`/`Group`
 * de Fabric 6.0.2 pueden construirse e inspeccionarse en Node sin ningún
 * shim — a diferencia de `IText`, que sí necesita medir texto con un
 * contexto 2D real, ver `textExport.ts`).
 *
 * Fabric.js normaliza internamente CUALQUIER comando de path (incluidos
 * arcos `A`) a solo `M`/`L`/`C`/`Q`/`Z` al parsear un `d` (verificado
 * empíricamente: `new Path('M... A...')` produce `.path` sin ningún
 * comando `A`, ya convertido a `C`) — así que este módulo nunca necesita
 * manejar arcos.
 */
import { util, type TMat2D } from 'fabric';
import type { VirolaConfig } from '../../config/virola.config';

/** Comando crudo de Fabric: `['M', x, y]`, `['C', x1,y1,x2,y2,x,y]`, etc. — mismo formato que expone `path.path`. */
export type FabricPathCommand = readonly [string, ...number[]];

/**
 * Ingredientes de la conversión canvas-px → página-mm que usa el documento
 * final — Etapa 12B (agregada para que `pdfDocument.ts` posicione la
 * geometría EXACTAMENTE igual que `svgDocument.ts`, ya que ambos formatos
 * dibujan a partir de la MISMA geometría de entrada, en el mismo espacio de
 * coordenadas absolutas del canvas). Antes esto vivía solo inline, como
 * números sueltos, dentro de `buildSvgDocument` — ahora es la única fuente
 * de verdad, para que nunca haya dos fórmulas de escala/centrado que puedan
 * desincronizarse entre formatos.
 */
export interface CanvasToPageTransform {
  /** Escala uniforme px→mm (recíproco de `config.mmToPx`). */
  scale: number;
  /** Centro del canvas en px — el origen que se resta ANTES de escalar. */
  canvasCenterPx: { x: number; y: number };
  /** Centro de la página en mm — lo que se suma DESPUÉS de escalar (la página es cuadrada: mismo valor en X e Y). */
  pageCenterMm: number;
}

export function computeCanvasToPageTransform(config: VirolaConfig): CanvasToPageTransform {
  return {
    scale: 1 / config.mmToPx,
    canvasCenterPx: { x: config.width / 2, y: config.height / 2 },
    pageCenterMm: config.outerDiameterMm / 2,
  };
}

function transformXY(x: number, y: number, offset: { x: number; y: number }, matrix: TMat2D): { x: number; y: number } {
  return util.transformPoint({ x: x - offset.x, y: y - offset.y }, matrix);
}

/**
 * Aplica el offset interno de Fabric (`path.pathOffset` — el centro del
 * bounding box en espacio local del path, que Fabric resta internamente al
 * renderizar) y una matriz de transformación afín a una lista de comandos
 * — el resultado queda en el MISMO espacio de coordenadas que `matrix`
 * produce (típicamente el espacio absoluto del canvas, si `matrix` viene de
 * `path.calcTransformMatrix()`, que ya compone automáticamente la
 * transformación de cualquier `Group` contenedor — verificado
 * empíricamente).
 */
export function transformFabricPathCommands(
  commands: readonly FabricPathCommand[],
  pathOffset: { x: number; y: number },
  matrix: TMat2D,
): FabricPathCommand[] {
  return commands.map((cmd): FabricPathCommand => {
    const code = cmd[0];
    switch (code) {
      case 'M':
      case 'L': {
        const p = transformXY(cmd[1], cmd[2], pathOffset, matrix);
        return [code, p.x, p.y];
      }
      case 'C': {
        const p1 = transformXY(cmd[1], cmd[2], pathOffset, matrix);
        const p2 = transformXY(cmd[3], cmd[4], pathOffset, matrix);
        const p = transformXY(cmd[5], cmd[6], pathOffset, matrix);
        return ['C', p1.x, p1.y, p2.x, p2.y, p.x, p.y];
      }
      case 'Q': {
        const p1 = transformXY(cmd[1], cmd[2], pathOffset, matrix);
        const p = transformXY(cmd[3], cmd[4], pathOffset, matrix);
        return ['Q', p1.x, p1.y, p.x, p.y];
      }
      case 'Z':
        return ['Z'];
      default:
        // No debería ocurrir (ver el comentario del archivo: Fabric nunca
        // deja otro código en `.path`) — se conserva tal cual en vez de
        // tirar, para no romper la exportación entera por un comando
        // inesperado de una versión futura de Fabric.
        return cmd;
    }
  });
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Re-serializa comandos crudos de Fabric a un `d` de SVG estándar. */
export function serializeFabricPathCommands(commands: readonly FabricPathCommand[]): string {
  return commands
    .map((cmd) => {
      const code = cmd[0];
      switch (code) {
        case 'M': return `M${round(cmd[1])},${round(cmd[2])}`;
        case 'L': return `L${round(cmd[1])},${round(cmd[2])}`;
        case 'C': return `C${round(cmd[1])},${round(cmd[2])} ${round(cmd[3])},${round(cmd[4])} ${round(cmd[5])},${round(cmd[6])}`;
        case 'Q': return `Q${round(cmd[1])},${round(cmd[2])} ${round(cmd[3])},${round(cmd[4])}`;
        case 'Z': return 'Z';
        default: return '';
      }
    })
    .join(' ');
}

/** Divide una lista de comandos (potencialmente varios subtrazos M...Z M...Z) en sus subtrazos individuales. */
export function splitIntoSubpaths(commands: readonly FabricPathCommand[]): FabricPathCommand[][] {
  const subpaths: FabricPathCommand[][] = [];
  let current: FabricPathCommand[] = [];
  for (const cmd of commands) {
    if (cmd[0] === 'M') {
      if (current.length > 0) subpaths.push(current);
      current = [cmd];
    } else {
      current.push(cmd);
    }
  }
  if (current.length > 0) subpaths.push(current);
  return subpaths;
}

/**
 * Área con signo (shoelace) de UN subtrazo — usa los puntos de anclaje de
 * cada comando (ignora los de control de curvas, misma aproximación
 * "suficiente para el signo" que ya usa `svgIconExtractor.ts`/`polygonArea`
 * para lo mismo). El SIGNO (no el valor absoluto) es lo único que importa
 * acá: determina el sentido de bobinado (CW/CCW) bajo la convención de
 * coordenadas del canvas (Y crece hacia abajo).
 */
export function signedSubpathArea(subpath: readonly FabricPathCommand[]): number {
  const points: [number, number][] = [];
  for (const cmd of subpath) {
    const code = cmd[0];
    if (code === 'Z') continue;
    const x = cmd[cmd.length - 2] as number;
    const y = cmd[cmd.length - 1] as number;
    points.push([x, y]);
  }
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

/**
 * Invierte el sentido de bobinado de UN subtrazo — recorre los mismos
 * segmentos en orden inverso, con los puntos de control de cada curva
 * también invertidos (un `C p1 p2 fin` reversado es `C p2 p1 inicio`).
 * Necesario para combinar capas `ink`/`paper` (Etapa 8E, `iconElement.ts`)
 * en un único `d` con `fill-rule: nonzero` donde el agujero (`paper`)
 * quede geométricamente correcto — mismo principio ya verificado
 * empíricamente contra la salida real de `vectortracer` en la Etapa 9D.1
 * (exterior e interior con bobinado opuesto).
 */
export function reverseSubpathWinding(subpath: readonly FabricPathCommand[]): FabricPathCommand[] {
  const closed = subpath[subpath.length - 1]?.[0] === 'Z';
  const body = closed ? subpath.slice(0, -1) : subpath;
  if (body.length === 0 || body[0][0] !== 'M') {
    return [...subpath]; // subtrazo degenerado — no hay nada seguro que invertir
  }

  interface Segment {
    kind: 'L' | 'C' | 'Q';
    from: [number, number];
    to: [number, number];
    c1?: [number, number];
    c2?: [number, number];
  }

  let cursor: [number, number] = [body[0][1], body[0][2]];
  const segments: Segment[] = [];
  for (let i = 1; i < body.length; i++) {
    const cmd = body[i];
    const code = cmd[0];
    if (code === 'L') {
      const to: [number, number] = [cmd[1], cmd[2]];
      segments.push({ kind: 'L', from: cursor, to });
      cursor = to;
    } else if (code === 'C') {
      const c1: [number, number] = [cmd[1], cmd[2]];
      const c2: [number, number] = [cmd[3], cmd[4]];
      const to: [number, number] = [cmd[5], cmd[6]];
      segments.push({ kind: 'C', from: cursor, c1, c2, to });
      cursor = to;
    } else if (code === 'Q') {
      const c1: [number, number] = [cmd[1], cmd[2]];
      const to: [number, number] = [cmd[3], cmd[4]];
      segments.push({ kind: 'Q', from: cursor, c1, to });
      cursor = to;
    }
  }

  const endPoint = cursor;
  const out: FabricPathCommand[] = [['M', endPoint[0], endPoint[1]]];
  for (const seg of [...segments].reverse()) {
    if (seg.kind === 'L') {
      out.push(['L', seg.from[0], seg.from[1]]);
    } else if (seg.kind === 'C' && seg.c1 && seg.c2) {
      out.push(['C', seg.c2[0], seg.c2[1], seg.c1[0], seg.c1[1], seg.from[0], seg.from[1]]);
    } else if (seg.kind === 'Q' && seg.c1) {
      out.push(['Q', seg.c1[0], seg.c1[1], seg.from[0], seg.from[1]]);
    }
  }
  if (closed) out.push(['Z']);
  return out;
}
