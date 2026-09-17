/**
 * Extractor de geometría de un SVG subido por el usuario — Etapa 8B (carga
 * de íconos SVG propios). Único punto de entrada real del módulo:
 * `extractIconFromSvg(svgText)` — recibe el CONTENIDO TEXTUAL de un
 * archivo `.svg` y devuelve, o bien una geometría lista para
 * `normalizeIconPath` (`{d, paintMode, fillRule, strokeWidth?}` ya
 * normalizada), o bien un mensaje de error YA amigable para mostrar al
 * usuario (nunca un error técnico del parser).
 *
 * FILOSOFÍA (pedida explícitamente para esta etapa): "si no podemos
 * garantizar una conversión correcta, rechazamos el archivo" — nunca
 * "intentamos adivinar qué quiso hacer el SVG". Cada rechazo tiene un
 * motivo concreto y verificable, igual que el criterio ya usado en
 * `scripts/icon-import/classifyIcon.ts` para los PDFs del catálogo (no se
 * reutiliza ese archivo — es específico de PDF — pero se replica la MISMA
 * actitud: ante cualquier ambigüedad real, no forzar un resultado).
 *
 * SEGURIDAD (ver docs/ARCHITECTURE.md, "SVG y seguridad" — mismo principio
 * ya aplicado en todo el proyecto): el SVG se parsea con
 * `DOMParser().parseFromString(..., 'image/svg+xml')` a un `Document`
 * COMPLETAMENTE DESCONECTADO del DOM real — nunca se inserta en la página,
 * nunca se usa `innerHTML`, nunca se renderiza. Un documento desconectado
 * de `DOMParser` NO ejecuta `<script>` ni dispara manejadores de evento
 * (`onload`, etc.) — igual se los detecta y rechaza explícitamente acá,
 * como defensa adicional y explícita (no confiar solo en "total no se
 * ejecuta"). El único dato que sale de este módulo hacia el resto del
 * editor es un string de comandos de path (números + letras M/L/C/Q/A/Z) —
 * la misma clase de dato segura que ya produce `pdfToPaths.ts`/
 * `composeIconGeometry.ts` para el catálogo, nunca markup.
 *
 * QUÉ NO HACE A PROPÓSITO (alcance de esta etapa, ver el pedido):
 *  - No interpreta gradientes/patrones/filtros/máscaras/clip-paths — un
 *    SVG que los use se rechaza.
 *  - No interpreta `<svg>` anidado (viewports anidados) — se rechaza.
 *  - No interpreta CSS externo (`<style>` con selectores) — solo lee
 *    presentation attributes (`fill`/`stroke`/`fill-rule`/`stroke-width`)
 *    y, como mucho, un atributo `style="fill:...;stroke:...` inline simple
 *    (nunca se evalúa como CSS real, solo se separan pares `prop:valor`
 *    por `;`).
 *  - No necesita leer `viewBox`/`width`/`height` del `<svg>` raíz para el
 *    resultado final: igual que ya hace `normalizeIconPath.ts` con el
 *    CropBox de un PDF ("nunca confía en un viewBox externo declarado"),
 *    acá se recalcula el bounding box REAL de la geometría ya combinada y
 *    se recentra/reescala con eso — un `viewBox` mal declarado, o
 *    simplemente ausente, no cambia el resultado final.
 */
import { normalizeIconPath, normalizeIconLayers, parsePathCommands, type AbsCommand } from './normalizeIconPath.ts';
import { compose, applyToPoint, parseTransformAttribute, isSimilarity, similarityScale, isAxisAligned, IDENTITY_MATRIX, type Matrix } from './svgTransform.ts';
import { groupColors } from './svgColorGrouping.ts';
import type { IconPaintMode, IconLayer } from './iconLibrary.ts';

export interface SvgIconGeometry {
  /**
   * Ya normalizado (`normalizeIconPath.ts`) — listo para usar tal cual como
   * `IconAsset.svgPath`. Cuando `layers` está presente (ver abajo), este
   * campo es solo un fallback best-effort (unión de las capas `ink`,
   * ignorando las `paper`) para consumidores que no sepan leer `layers` —
   * nunca la representación real a renderizar.
   */
  svgPath: string;
  paintMode: IconPaintMode;
  fillRule: 'nonzero' | 'evenodd';
  /** Solo presente si `paintMode === 'stroke'` — ya multiplicado por el `scale` de la normalización, mismo criterio que usa el importador de PDF (`classifyIcon.ts`). */
  strokeWidth?: number;
  /**
   * Presente cuando el SVG tiene más de una forma con relleno (Etapa 8E) —
   * ver `IconLayer` (`iconLibrary.ts`) para el significado de `role` y por
   * qué el orden del arreglo es el orden de pintado real, nunca
   * reordenado. `undefined` para cualquier ícono de una sola forma (el
   * caso simple de siempre, sin cambios).
   */
  layers?: IconLayer[];
}

export type SvgExtractionResult =
  | { ok: true; geometry: SvgIconGeometry }
  | { ok: false; message: string };

/** Tags que rechazan el archivo completo si aparecen en cualquier parte del documento — ver la nota de seguridad grande de arriba. */
const FORBIDDEN_TAGS = new Set([
  'script', 'foreignobject', 'image', 'text', 'tspan', 'style',
  'lineargradient', 'radialgradient', 'pattern', 'filter', 'mask', 'clippath', 'svg',
]);

/** Tags de forma soportados — cualquier otro tag desconocido (que no sea un contenedor conocido como `g`/`defs`/`use`/`svg` raíz) se ignora silenciosamente SOLO si no aporta geometría por sí mismo (ver `walk`). */
const SHAPE_TAGS = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polygon', 'polyline']);

/** Límite defensivo de elementos recorridos (incluye expansión de `<use>`) — evita que un SVG patológico (o una cadena de `<use>` que se referencia mucho) cuelgue el navegador. */
const MAX_ELEMENTS_WALKED = 2000;
/** Límite defensivo de comandos de path ANTES de normalizar — más chico que el techo genérico de `normalizeIconPath` (20 000) a propósito, para poder dar un mensaje más amigable antes de llegar a ese límite genérico. */
const MAX_COMMANDS_BEFORE_NORMALIZE = 5000;
/** Techo de tamaño de texto del propio archivo — un SVG deícono legítimo nunca necesita esto; por encima, ni se intenta parsear. */
const MAX_SVG_TEXT_LENGTH = 2_000_000; // ~2MB de texto
/**
 * Umbral de la Regla 2 (Etapa 8C, ver `extractGeometryFromRootElement`):
 * si el área combinada del grupo minoritario (relleno o trazo, el que sea
 * más chico) es menos de este porcentaje del área del grupo mayoritario,
 * se lo considera "detalle decorativo prescindible" y se descarta en vez
 * de rechazar el archivo entero. 25% es deliberadamente conservador — dos
 * elementos de escala realmente comparable (ej. un ícono partido a la
 * mitad entre relleno y trazo) quedan MUY por encima de este umbral y
 * siguen rechazándose, tal como se pedía.
 */
const MINORITY_AREA_RATIO_THRESHOLD = 0.25;

function err(message: string): SvgExtractionResult {
  return { ok: false, message };
}

interface PaintContext {
  fill: string;
  stroke: string;
  fillRule: 'nonzero' | 'evenodd';
  strokeWidth: number;
}

const DEFAULT_PAINT: PaintContext = { fill: 'black', stroke: 'none', fillRule: 'nonzero', strokeWidth: 1 };

/** Parseo MUY acotado de `style="prop:valor;prop2:valor2"` — nunca CSS real, solo separa por `;`/`:` y se queda únicamente con las propiedades que nos importan (pintado + `display`/`visibility`, ver Etapa 8B.4). */
function parseInlineStyle(style: string | null): Partial<Record<'fill' | 'stroke' | 'fill-rule' | 'stroke-width' | 'display' | 'visibility', string>> {
  const result: Partial<Record<'fill' | 'stroke' | 'fill-rule' | 'stroke-width' | 'display' | 'visibility', string>> = {};
  if (!style) return result;
  for (const decl of style.split(';')) {
    const idx = decl.indexOf(':');
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim();
    if (prop === 'fill' || prop === 'stroke' || prop === 'fill-rule' || prop === 'stroke-width' || prop === 'display' || prop === 'visibility') {
      result[prop] = value;
    }
  }
  return result;
}

function resolvePaintContext(el: Element, inherited: PaintContext): PaintContext {
  const style = parseInlineStyle(el.getAttribute('style'));
  const fill = style.fill ?? el.getAttribute('fill') ?? inherited.fill;
  const stroke = style.stroke ?? el.getAttribute('stroke') ?? inherited.stroke;
  const fillRuleRaw = style['fill-rule'] ?? el.getAttribute('fill-rule') ?? inherited.fillRule;
  const fillRule: 'nonzero' | 'evenodd' = fillRuleRaw === 'evenodd' ? 'evenodd' : 'nonzero';
  const strokeWidthRaw = style['stroke-width'] ?? el.getAttribute('stroke-width');
  // Etapa 8B.4: un `stroke-width="0"` EXPLÍCITO se conserva tal cual (0),
  // en vez de "perderse" y caer de vuelta al valor heredado — antes, `0 >
  // 0` era falso y esto silenciosamente reemplazaba un 0 explícito por el
  // ancho del ancestro (o el default de la spec), haciendo que un trazo
  // deliberadamente desactivado con `stroke-width="0"` terminara
  // pintándose con un ancho de 1 igual. Solo se cae al heredado cuando el
  // atributo está AUSENTE o no es un número válido — nunca cuando dice
  // explícitamente "0".
  let strokeWidth = inherited.strokeWidth;
  if (strokeWidthRaw !== null && strokeWidthRaw !== undefined && strokeWidthRaw !== '') {
    const parsed = Number(strokeWidthRaw);
    strokeWidth = Number.isFinite(parsed) && parsed >= 0 ? parsed : inherited.strokeWidth;
  }
  return {
    fill: fill.trim().toLowerCase(),
    stroke: stroke.trim().toLowerCase(),
    fillRule,
    strokeWidth,
  };
}

function isNone(value: string): boolean {
  return value === 'none' || value === '';
}

/**
 * Etapa 8B.4: `display:none`/`visibility:hidden` (atributo o dentro de
 * `style`) — deliberadamente NO es un motor de CSS general (no hay
 * cascada real, no hay "un hijo con `visibility:visible` puede
 * desocultarse dentro de un ancestro oculto"): un elemento oculto por
 * cualquiera de estos dos, SIN excepción, hace que NI él NI ninguno de
 * sus descendientes aporten geometría — ver el uso en `walk()`, que
 * corta la recursión ahí mismo en vez de seguir bajando.
 */
function isElementHidden(el: Element): boolean {
  const style = parseInlineStyle(el.getAttribute('style'));
  const display = (style.display ?? el.getAttribute('display'))?.trim().toLowerCase();
  const visibility = (style.visibility ?? el.getAttribute('visibility'))?.trim().toLowerCase();
  return display === 'none' || visibility === 'hidden';
}

/**
 * Recolecta un elemento y TODOS sus descendientes (recursivo sobre
 * `.children`) — a propósito no usa `Element.getElementsByTagName('*')`
 * (un método específico del DOM real): así, tanto `checkForbiddenContent`
 * como `buildIdMap` funcionan igual sobre un `Element` real del navegador
 * (producción, vía `DOMParser`) y sobre un objeto simulado de test (ver
 * `svgIconExtractor.test.ts`) que solo implementa `.localName`,
 * `.getAttribute()`, `.attributes` y `.children` — sin necesitar `jsdom` ni
 * ninguna otra dependencia nueva solo para poder testear esta lógica con
 * `node --test` (que no tiene DOM real). Esto no cambia ningún
 * comportamiento de producción: un `Element` real sigue funcionando
 * exactamente igual.
 */
function collectAllDescendants(el: Element): Element[] {
  const result: Element[] = [el];
  for (const child of Array.from(el.children)) {
    result.push(...collectAllDescendants(child));
  }
  return result;
}

/** Chequeo de seguridad — recorre TODO el documento (incluso dentro de `<defs>`) buscando cualquier cosa peligrosa o no soportada. Devuelve un mensaje de error, o `null` si está todo bien. */
function checkForbiddenContent(root: Element): string | null {
  const all = collectAllDescendants(root);
  for (const el of all) {
    const tag = el.localName?.toLowerCase() ?? '';
    if (el !== root && FORBIDDEN_TAGS.has(tag)) {
      return 'Este SVG contiene elementos no compatibles.';
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value;
      if (name.startsWith('on')) {
        return 'Este SVG contiene elementos no compatibles.';
      }
      if (/javascript:/i.test(value)) {
        return 'Este SVG contiene elementos no compatibles.';
      }
      if ((name === 'href' || name === 'xlink:href') && !value.startsWith('#')) {
        return 'Este SVG contiene referencias externas no compatibles.';
      }
      if ((name === 'clip-path' || name === 'mask' || name === 'filter') && !isNone(value.trim().toLowerCase())) {
        return 'Este SVG contiene elementos no compatibles.';
      }
      if (name === 'style' && /url\(/i.test(value)) {
        return 'Este SVG contiene referencias externas no compatibles.';
      }
    }
  }
  return null;
}

function getNumberAttr(el: Element, name: string, fallback: number): number {
  const raw = el.getAttribute(name);
  if (raw === null || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** M/L en línea recta a partir de un array plano [x0,y0,x1,y1,...], cerrando el subpath si `close` es true. */
function polyCommands(points: number[], close: boolean): AbsCommand[] {
  if (points.length < 4) return []; // menos de 2 puntos: no hay geometría real
  const commands: AbsCommand[] = [{ code: 'M', x: points[0], y: points[1] }];
  for (let i = 2; i < points.length - 1; i += 2) {
    commands.push({ code: 'L', x: points[i], y: points[i + 1] });
  }
  if (close) commands.push({ code: 'Z' });
  return commands;
}

function parsePointsAttr(raw: string | null): number[] {
  if (!raw) return [];
  const nums = raw.match(/-?(?:\d+\.\d+|\.\d+|\d+)(?:[eE][+-]?\d+)?/g);
  if (!nums) return [];
  const values = nums.map(Number);
  return values.length % 2 === 0 ? values : values.slice(0, values.length - 1);
}

/** Convierte un elemento de forma (en su espacio LOCAL, sin transform aplicado todavía) a comandos absolutos. `null` si el elemento no aporta geometría real (spec-compliant: ancho/alto/radio <= 0, `points` insuficientes, etc.) — nunca tira por esto, es un caso normal de SVG. */
function shapeToLocalCommands(el: Element): AbsCommand[] | null {
  const tag = el.localName.toLowerCase();
  switch (tag) {
    case 'path': {
      const d = el.getAttribute('d');
      if (!d || d.trim() === '') return null;
      return parsePathCommands(d);
    }
    case 'rect': {
      const x = getNumberAttr(el, 'x', 0);
      const y = getNumberAttr(el, 'y', 0);
      const width = getNumberAttr(el, 'width', 0);
      const height = getNumberAttr(el, 'height', 0);
      if (width <= 0 || height <= 0) return null;
      let rx = getNumberAttr(el, 'rx', NaN);
      let ry = getNumberAttr(el, 'ry', NaN);
      if (Number.isNaN(rx) && Number.isNaN(ry)) { rx = 0; ry = 0; }
      else if (Number.isNaN(rx)) rx = ry;
      else if (Number.isNaN(ry)) ry = rx;
      rx = Math.min(Math.max(rx, 0), width / 2);
      ry = Math.min(Math.max(ry, 0), height / 2);
      if (rx === 0 || ry === 0) {
        return [
          { code: 'M', x, y },
          { code: 'L', x: x + width, y },
          { code: 'L', x: x + width, y: y + height },
          { code: 'L', x, y: y + height },
          { code: 'Z' },
        ];
      }
      return [
        { code: 'M', x: x + rx, y },
        { code: 'L', x: x + width - rx, y },
        { code: 'A', rx, ry, xAxisRotation: 0, largeArcFlag: 0, sweepFlag: 1, x: x + width, y: y + ry },
        { code: 'L', x: x + width, y: y + height - ry },
        { code: 'A', rx, ry, xAxisRotation: 0, largeArcFlag: 0, sweepFlag: 1, x: x + width - rx, y: y + height },
        { code: 'L', x: x + rx, y: y + height },
        { code: 'A', rx, ry, xAxisRotation: 0, largeArcFlag: 0, sweepFlag: 1, x, y: y + height - ry },
        { code: 'L', x, y: y + ry },
        { code: 'A', rx, ry, xAxisRotation: 0, largeArcFlag: 0, sweepFlag: 1, x: x + rx, y },
        { code: 'Z' },
      ];
    }
    case 'circle': {
      const cx = getNumberAttr(el, 'cx', 0);
      const cy = getNumberAttr(el, 'cy', 0);
      const r = getNumberAttr(el, 'r', 0);
      if (r <= 0) return null;
      // Mismo truco de "2 arcos" ya usado en iconLibrary.ts ("sun"/"mate") para círculos.
      return [
        { code: 'M', x: cx - r, y: cy },
        { code: 'A', rx: r, ry: r, xAxisRotation: 0, largeArcFlag: 1, sweepFlag: 1, x: cx + r, y: cy },
        { code: 'A', rx: r, ry: r, xAxisRotation: 0, largeArcFlag: 1, sweepFlag: 1, x: cx - r, y: cy },
        { code: 'Z' },
      ];
    }
    case 'ellipse': {
      const cx = getNumberAttr(el, 'cx', 0);
      const cy = getNumberAttr(el, 'cy', 0);
      const rx = getNumberAttr(el, 'rx', 0);
      const ry = getNumberAttr(el, 'ry', 0);
      if (rx <= 0 || ry <= 0) return null;
      return [
        { code: 'M', x: cx - rx, y: cy },
        { code: 'A', rx, ry, xAxisRotation: 0, largeArcFlag: 1, sweepFlag: 1, x: cx + rx, y: cy },
        { code: 'A', rx, ry, xAxisRotation: 0, largeArcFlag: 1, sweepFlag: 1, x: cx - rx, y: cy },
        { code: 'Z' },
      ];
    }
    case 'line': {
      const x1 = getNumberAttr(el, 'x1', 0);
      const y1 = getNumberAttr(el, 'y1', 0);
      const x2 = getNumberAttr(el, 'x2', 0);
      const y2 = getNumberAttr(el, 'y2', 0);
      if (x1 === x2 && y1 === y2) return null;
      return [{ code: 'M', x: x1, y: y1 }, { code: 'L', x: x2, y: y2 }];
    }
    case 'polygon': {
      const points = parsePointsAttr(el.getAttribute('points'));
      const commands = polyCommands(points, true);
      return commands.length > 0 ? commands : null;
    }
    case 'polyline': {
      const points = parsePointsAttr(el.getAttribute('points'));
      const commands = polyCommands(points, false);
      return commands.length > 0 ? commands : null;
    }
    default:
      return null;
  }
}

function determinant(m: Matrix): number {
  const [a, b, c, d] = m;
  return a * d - b * c;
}

/** Transforma un comando de arco por una matriz afín — solo en los dos casos que se pueden resolver de forma EXACTA (ver `svgTransform.ts`): escala por eje sin rotación, o similitud (rotación + escala uniforme). Cualquier otro caso (sesgo, o rotación combinada con escala no uniforme) tira — se rechaza el archivo en vez de aproximar. */
function transformArcCommand(matrix: Matrix, cmd: Extract<AbsCommand, { code: 'A' }>): AbsCommand {
  const p = applyToPoint(matrix, cmd.x, cmd.y);
  const det = determinant(matrix);
  const flipSweep = det < 0;
  if (cmd.xAxisRotation === 0 && isAxisAligned(matrix)) {
    const [a, , , d] = matrix;
    return {
      ...cmd,
      rx: cmd.rx * Math.abs(a),
      ry: cmd.ry * Math.abs(d),
      sweepFlag: flipSweep ? (cmd.sweepFlag === 1 ? 0 : 1) : cmd.sweepFlag,
      x: p.x,
      y: p.y,
    };
  }
  if (isSimilarity(matrix)) {
    const scale = similarityScale(matrix);
    const [a, b] = matrix;
    const rotationDeg = (Math.atan2(b, a) * 180) / Math.PI;
    return {
      ...cmd,
      rx: cmd.rx * scale,
      ry: cmd.ry * scale,
      xAxisRotation: cmd.xAxisRotation + rotationDeg,
      sweepFlag: flipSweep ? (cmd.sweepFlag === 1 ? 0 : 1) : cmd.sweepFlag,
      x: p.x,
      y: p.y,
    };
  }
  throw new Error('unsupported-arc-transform');
}

function transformCommands(matrix: Matrix, commands: AbsCommand[]): AbsCommand[] {
  return commands.map((cmd): AbsCommand => {
    switch (cmd.code) {
      case 'M':
      case 'L': {
        const p = applyToPoint(matrix, cmd.x, cmd.y);
        return { code: cmd.code, x: p.x, y: p.y };
      }
      case 'C': {
        const p1 = applyToPoint(matrix, cmd.x1, cmd.y1);
        const p2 = applyToPoint(matrix, cmd.x2, cmd.y2);
        const p = applyToPoint(matrix, cmd.x, cmd.y);
        return { code: 'C', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, x: p.x, y: p.y };
      }
      case 'Q': {
        const p1 = applyToPoint(matrix, cmd.x1, cmd.y1);
        const p = applyToPoint(matrix, cmd.x, cmd.y);
        return { code: 'Q', x1: p1.x, y1: p1.y, x: p.x, y: p.y };
      }
      case 'A':
        return transformArcCommand(matrix, cmd);
      case 'Z':
        return cmd;
    }
  });
}

function serializeCommands(commands: AbsCommand[]): string {
  function round(n: number): number {
    return Math.round(n * 1000) / 1000;
  }
  return commands
    .map((c) => {
      switch (c.code) {
        case 'M': return `M${round(c.x)},${round(c.y)}`;
        case 'L': return `L${round(c.x)},${round(c.y)}`;
        case 'C': return `C${round(c.x1)},${round(c.y1)} ${round(c.x2)},${round(c.y2)} ${round(c.x)},${round(c.y)}`;
        case 'Q': return `Q${round(c.x1)},${round(c.y1)} ${round(c.x)},${round(c.y)}`;
        case 'A': return `A${round(c.rx)},${round(c.ry)} ${round(c.xAxisRotation)} ${c.largeArcFlag},${c.sweepFlag} ${round(c.x)},${round(c.y)}`;
        case 'Z': return 'Z';
      }
    })
    .join(' ');
}

interface CollectedShape {
  commands: AbsCommand[];
  filled: boolean;
  stroked: boolean;
  fillRule: 'nonzero' | 'evenodd';
  /** Ancho de trazo YA multiplicado por la escala efectiva de la matriz acumulada de esta forma (mismo criterio que `pdfToPaths.ts` para PDF). */
  effectiveStrokeWidth: number;
  /** Color de relleno YA resuelto (`resolvePaintContext`, con herencia aplicada) — solo tiene sentido cuando `filled` es `true`; usado por la Etapa 8E para agrupar/clasificar `ink`/`paper` (`svgColorGrouping.ts`). Nunca se usa para decidir `none`/herencia (eso ya lo resolvió `resolvePaintContext` antes). */
  fillColor: string;
}

function scaleOf(m: Matrix): number {
  return Math.sqrt(Math.abs(determinant(m)));
}

/**
 * Área real (shoelace) de los subpaths de una forma — trata los puntos de
 * anclaje de cada comando (M/L/C/Q/A → su punto final) como vértices de un
 * polígono, ignorando el "abultamiento" real de curvas: una aproximación
 * DELIBERADA (no geometría exacta) que alcanza para comparar "¿esta forma
 * es grande o chica?" — que es todo lo que necesita la Regla 2 (ver más
 * abajo). Nunca se usa para dibujar, solo para esta comparación de escala.
 */
function polygonArea(commands: AbsCommand[]): number {
  let total = 0;
  let subpathPoints: { x: number; y: number }[] = [];

  function closeSubpath(): void {
    if (subpathPoints.length >= 3) {
      let area = 0;
      for (let i = 0; i < subpathPoints.length; i++) {
        const p1 = subpathPoints[i];
        const p2 = subpathPoints[(i + 1) % subpathPoints.length];
        area += p1.x * p2.y - p2.x * p1.y;
      }
      total += Math.abs(area) / 2;
    }
    subpathPoints = [];
  }

  for (const cmd of commands) {
    if (cmd.code === 'M') {
      closeSubpath();
      subpathPoints.push({ x: cmd.x, y: cmd.y });
    } else if (cmd.code === 'Z') {
      // el shoelace ya cierra el polígono solo (usa `(i+1) % length`).
    } else {
      subpathPoints.push({ x: cmd.x, y: cmd.y });
    }
  }
  closeSubpath();
  return total;
}

/** Longitud total (aproximada, mismo criterio de "usar los puntos de anclaje" que `polygonArea`) de los subpaths de una forma de trazo — para estimar cuánta "tinta" real deja un trazo fino: `longitud × ancho`, mucho más chico que su bounding box cuando la línea es angosta y larga. */
/**
 * Longitud aproximada de un arco elíptico (comando `A`), dado su punto de
 * inicio real — parametrización por centro estándar de la spec de SVG
 * (Apéndice F.6.5: de "extremos" a "centro + ángulo barrido"), tratada
 * como un arco circular de radio `(rx+ry)/2` para la longitud (exacto para
 * un círculo — nuestro caso más común, `<circle>` — y una aproximación
 * razonable para una elipse). Necesaria porque tratar el punto final como
 * si fuera una línea recta (el criterio que usa `polygonArea` para
 * curvas, aceptable ahí porque solo compara ÁREAS) subestima MUCHO la
 * longitud real de un arco — un círculo completo (2 semicírculos) medido
 * así da ~2 veces el radio en vez de las ~6.28 veces reales, y esa
 * subestimación alcanzó a hacer que un caso realmente ambiguo (Regla 2, ver
 * `estimateInkArea`) se aceptara por error durante el desarrollo de esta
 * corrección — de ahí el test dedicado en `svgIconExtractor.test.ts`.
 */
function estimateArcLength(x1: number, y1: number, cmd: Extract<AbsCommand, { code: 'A' }>): number {
  const { rx: rx0, ry: ry0, xAxisRotation, largeArcFlag, sweepFlag, x: x2, y: y2 } = cmd;
  if (rx0 <= 0 || ry0 <= 0 || (x1 === x2 && y1 === y2)) {
    return Math.hypot(x2 - x1, y2 - y1);
  }
  const phi = (xAxisRotation * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx2 = (x1 - x2) / 2;
  const dy2 = (y1 - y2) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  let rx = rx0;
  let ry = ry0;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }

  const sign = largeArcFlag !== sweepFlag ? 1 : -1;
  const num = Math.max(0, rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p);
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const co = den > 0 ? sign * Math.sqrt(num / den) : 0;
  const cxp = (co * (rx * y1p)) / ry;
  const cyp = (co * (-ry * x1p)) / rx;

  function angle(ux: number, uy: number, vx: number, vy: number): number {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    const cross = ux * vy - uy * vx;
    const a = len > 0 ? Math.acos(Math.min(1, Math.max(-1, dot / len))) : 0;
    return cross < 0 ? -a : a;
  }

  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let deltaTheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweepFlag && deltaTheta > 0) deltaTheta -= 2 * Math.PI;
  if (sweepFlag && deltaTheta < 0) deltaTheta += 2 * Math.PI;
  void theta1;

  const meanRadius = (rx + ry) / 2;
  return meanRadius * Math.abs(deltaTheta);
}

function polylineLength(commands: AbsCommand[]): number {
  let total = 0;
  let current: { x: number; y: number } | null = null;
  let subpathStart: { x: number; y: number } | null = null;
  for (const cmd of commands) {
    if (cmd.code === 'M') {
      current = { x: cmd.x, y: cmd.y };
      subpathStart = current;
    } else if (cmd.code === 'Z') {
      if (current && subpathStart) total += Math.hypot(subpathStart.x - current.x, subpathStart.y - current.y);
      current = subpathStart;
    } else if (cmd.code === 'A') {
      const next = { x: cmd.x, y: cmd.y };
      if (current) total += estimateArcLength(current.x, current.y, cmd);
      current = next;
    } else {
      const next = { x: cmd.x, y: cmd.y };
      if (current) total += Math.hypot(next.x - current.x, next.y - current.y);
      current = next;
    }
  }
  return total;
}

/**
 * Estima cuánta "tinta" real aporta un grupo de formas — usada por la
 * Regla 2 (ver `extractGeometryFromRootElement`) para decidir si un grupo
 * (relleno o trazo) es claramente minoritario frente al otro. A propósito
 * NO usa el área del bounding box combinado (`computeBoundingBox`): una
 * línea de trazo fina que atraviesa todo el ancho del diseño tiene un
 * bounding box casi tan grande como el diseño completo, aunque su tinta
 * real (longitud × ancho de trazo) sea mínima — esto se confirmó
 * directamente contra uno de los SVG reales de Zizou (Etapa 8C) que
 * motivó esta corrección: sin este cambio, una línea de detalle angosta
 * se medía como "del mismo tamaño" que el escudo completo.
 */
function estimateInkArea(shapes: CollectedShape[], mode: 'fill' | 'stroke'): number {
  if (mode === 'fill') {
    return shapes.reduce((sum, s) => sum + polygonArea(s.commands), 0);
  }
  return shapes.reduce((sum, s) => sum + polylineLength(s.commands) * Math.max(s.effectiveStrokeWidth, 1e-6), 0);
}

interface WalkState {
  elementsById: Map<string, Element>;
  collected: CollectedShape[];
  elementCount: number;
}

function walk(el: Element, matrix: Matrix, paint: PaintContext, state: WalkState, useStack: Set<string>): void {
  state.elementCount++;
  if (state.elementCount > MAX_ELEMENTS_WALKED) {
    throw new Error('too-complex');
  }
  // Etapa 8B.4: `display:none`/`visibility:hidden` corta acá mismo — NI
  // este elemento NI ninguno de sus descendientes se recorre, así que un
  // <g> oculto ignora todo su contenido de una sola vez (nunca se llega a
  // mirar los hijos). Se chequea ANTES que cualquier otra cosa (incluso
  // antes de decidir si es <use>/forma/contenedor), para que aplique
  // siempre sin importar el tipo de elemento.
  if (isElementHidden(el)) {
    return;
  }
  const tag = el.localName.toLowerCase();
  if (tag === 'defs' || tag === 'symbol') {
    // <defs>: contenedor de definiciones, nunca se dibuja directamente.
    // <symbol> (Etapa 8B.4): tampoco se dibuja directamente por sí solo
    // (spec de SVG) — solo es visible a través de un <use> que lo
    // referencia (ver más abajo, en el manejo de `use`, el caso especial
    // que SÍ recorre los hijos de un <symbol> cuando es el destino de la
    // referencia). Si apareciera suelto (sin ningún <use> apuntándole),
    // no debe aportar geometría por su cuenta — mismo criterio que <defs>.
    return;
  }

  const ownTransform = parseTransformAttribute(el.getAttribute('transform'));
  const worldMatrix = compose(ownTransform, matrix);
  const ownPaint = resolvePaintContext(el, paint);

  if (tag === 'use') {
    const href = el.getAttribute('href') ?? el.getAttribute('xlink:href');
    if (!href || !href.startsWith('#')) {
      throw new Error('use-invalid-reference');
    }
    const id = href.slice(1);
    if (useStack.has(id)) {
      throw new Error('use-circular-reference');
    }
    const target = state.elementsById.get(id);
    if (!target) {
      throw new Error('use-missing-reference');
    }
    // `<use x y transform>`: equivale a envolver el elemento referenciado en
    // un `<g transform="translate(x,y)">` implícito, con el propio
    // `transform` del `<use>` aplicándose IGUAL que en cualquier otro
    // elemento (encima de ese translate implícito, no en su lugar) — ver
    // la spec de SVG. `translateXY` se aplica primero (es la parte "interna"
    // del `<use>`), el `transform` propio después, y recién después de eso
    // se compone con la matriz heredada de los ancestros (`matrix`).
    const x = getNumberAttr(el, 'x', 0);
    const y = getNumberAttr(el, 'y', 0);
    const translateXY: Matrix = [1, 0, 0, 1, x, y];
    const useOwnMatrix = compose(translateXY, ownTransform);
    const combinedUseMatrix = compose(useOwnMatrix, matrix);
    const nextStack = new Set(useStack);
    nextStack.add(id);
    // Etapa 8B.4: si el destino es un <symbol>, el propio <symbol> NUNCA
    // se dibuja a sí mismo (ver el `return` de más arriba para `tag ===
    // 'symbol'`) — así que acá se recorren directamente SUS HIJOS con la
    // matriz/paint ya calculados para este <use>, en vez de llamar
    // `walk(target, ...)` (que, al toparse con `tag === 'symbol'`, no
    // haría nada). El resto de las reglas de seguridad de `<use>` ya se
    // aplicaron arriba sin cambios: referencia local únicamente (`href`
    // debe empezar con "#"), detección de referencia circular
    // (`useStack`), y el destino debe existir.
    if (target.localName?.toLowerCase() === 'symbol') {
      for (const child of Array.from(target.children)) {
        walk(child, combinedUseMatrix, ownPaint, state, nextStack);
      }
    } else {
      walk(target, combinedUseMatrix, ownPaint, state, nextStack);
    }
    return;
  }

  if (SHAPE_TAGS.has(tag)) {
    const localCommands = shapeToLocalCommands(el);
    if (!localCommands || localCommands.length === 0) {
      return;
    }
    const worldCommands = transformCommands(worldMatrix, localCommands);
    const isLine = tag === 'line';
    const hasFill = !isLine && !isNone(ownPaint.fill);
    // Etapa 8B.4: un `stroke-width` resuelto en 0 (ver `resolvePaintContext`)
    // es un trazo efectivamente invisible — se trata igual que `stroke:
    // none`, nunca como `paintMode: 'stroke'` con ancho 0.
    const hasStroke = !isNone(ownPaint.stroke) && ownPaint.strokeWidth > 0;
    // Etapa 8C: un elemento con fill Y stroke a la vez (patrón real y muy
    // común en SVG exportados por Inkscape/Illustrator: un trazo fino del
    // MISMO color, encima del propio relleno, solo para evitar huecos de
    // antialiasing entre formas vecinas) es un caso DISTINTO del de PDF —
    // acá el `fill` y el `stroke` son siempre, por construcción, la MISMA
    // geometría exacta (un solo `d`, dos pinturas), nunca dos operadores
    // separados que apenas coinciden en forma (por eso no hace falta
    // "detectar gemelos" como sí hace `composeIconGeometry.ts` con PDF) —
    // así que quedarse con el relleno y descartar el trazo propio de ESE
    // mismo elemento es siempre seguro y determinista, nunca una
    // adivinanza. Ver `combinedArea`/Regla 2 más abajo para el caso
    // realmente ambiguo (formas DISTINTAS, unas con relleno y otras con
    // trazo puro).
    const filled = hasFill;
    const stroked = hasStroke && !hasFill;
    state.collected.push({
      commands: worldCommands,
      filled,
      stroked,
      fillRule: ownPaint.fillRule,
      effectiveStrokeWidth: ownPaint.strokeWidth * scaleOf(worldMatrix),
      fillColor: ownPaint.fill,
    });
    return;
  }

  if (tag === 'g' || tag === 'a') {
    for (const child of Array.from(el.children)) {
      walk(child, worldMatrix, ownPaint, state, useStack);
    }
    return;
  }

  // Cualquier otro tag desconocido (ej. <metadata>, <title>, <desc>) se
  // ignora sin recorrer sus hijos — no aporta geometría y ya pasó el
  // chequeo de seguridad (no está en FORBIDDEN_TAGS).
}

/** Construye el mapa id → elemento de TODO el documento (incluso dentro de `<defs>`) — necesario para resolver `<use href="#id">` sin importar dónde esté definido el original. */
function buildIdMap(root: Element): Map<string, Element> {
  const map = new Map<string, Element>();
  const all = collectAllDescendants(root);
  for (const el of all) {
    const id = el.getAttribute('id');
    if (id && !map.has(id)) {
      map.set(id, el);
    }
  }
  return map;
}

const FRIENDLY_ERRORS: Record<string, string> = {
  'too-complex': 'El diseño es demasiado complejo para usarlo como ícono.',
  'use-invalid-reference': 'Este SVG contiene referencias externas no compatibles.',
  'use-circular-reference': 'Este SVG contiene una referencia circular no compatible.',
  'use-missing-reference': 'Este SVG hace referencia a un elemento que no existe.',
  'unsupported-arc-transform': 'Este SVG contiene curvas que no podemos convertir con las transformaciones aplicadas.',
};

/**
 * Punto de entrada — ver el comentario grande del archivo.
 */
export function extractIconFromSvg(svgText: string): SvgExtractionResult {
  if (typeof svgText !== 'string' || svgText.trim().length === 0) {
    return err('El archivo no contiene un SVG válido.');
  }
  if (svgText.length > MAX_SVG_TEXT_LENGTH) {
    return err('El diseño es demasiado complejo para usarlo como ícono.');
  }

  // Único punto del módulo que usa `DOMParser` (API de navegador, no
  // existe en Node) — por eso `extractGeometryFromRootElement` (de acá
  // para abajo) está separada en su propia función exportada: es pura
  // lógica sobre un árbol YA parseado (sin ningún parseo de texto/XML
  // adentro), así que se puede testear con `node --test` pasándole un
  // objeto simulado con la misma forma mínima que un `Element` real
  // (`.localName`, `.getAttribute()`, `.attributes`, `.children`) — sin
  // agregar `jsdom` ni ninguna otra dependencia nueva solo para poder
  // probar esta lógica fuera del navegador. Esta función de acá arriba
  // (la que sí llama a `DOMParser`) se verifica manualmente en el
  // navegador (ver el informe de esta etapa), no con un test automatizado.
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  } catch {
    return err('No pudimos leer este SVG.');
  }
  if (doc.getElementsByTagName('parsererror').length > 0) {
    return err('No pudimos leer este SVG.');
  }
  const root = doc.documentElement;
  if (!root || root.localName?.toLowerCase() !== 'svg') {
    return err('El archivo no contiene un SVG válido.');
  }

  return extractGeometryFromRootElement(root);
}

/**
 * Recibe el elemento `<svg>` raíz YA PARSEADO (real, de `DOMParser`, o un
 * objeto simulado en los tests — ver el comentario de `extractIconFromSvg`)
 * y hace todo el trabajo real: chequeo de seguridad, recorrido del árbol,
 * conversión de formas, resolución de paint, y normalización final.
 */
export function extractGeometryFromRootElement(root: Element): SvgExtractionResult {
  const securityMessage = checkForbiddenContent(root);
  if (securityMessage) {
    return err(securityMessage);
  }

  const state: WalkState = { elementsById: buildIdMap(root), collected: [], elementCount: 0 };
  try {
    for (const child of Array.from(root.children)) {
      walk(child, IDENTITY_MATRIX, DEFAULT_PAINT, state, new Set());
    }
  } catch (e) {
    const key = e instanceof Error ? e.message : '';
    return err(FRIENDLY_ERRORS[key] ?? 'No pudimos leer este SVG.');
  }

  if (state.collected.length === 0) {
    return err('El SVG no contiene una geometría válida.');
  }

  // Por construcción (ver el comentario de la Regla 1 en `walk()`), `filled`
  // y `stroked` ya son mutuamente excluyentes por elemento — nunca puede
  // quedar un elemento marcado como los dos a la vez acá.
  let filledShapes = state.collected.filter((s) => s.filled);
  let strokedShapes = state.collected.filter((s) => s.stroked);

  if (filledShapes.length > 0 && strokedShapes.length > 0) {
    // Regla 2 (Etapa 8C): mezcla real entre elementos DISTINTOS — algunos
    // con relleno, otros con trazo puro (`fill:none`). Situación real y
    // común en SVG exportados por herramientas de diseño: el diseño
    // principal en relleno, más algún detalle decorativo (una línea, un
    // borde fino) dibujado aparte con trazo puro. En vez de rechazar
    // siempre, se compara cuánta "tinta" real aporta cada grupo
    // (`estimateInkArea` — área real de relleno vs. longitud×ancho de
    // trazo, NUNCA el bounding box: una línea fina y larga tiene un
    // bounding box grande con poquísima tinta real, ver el comentario de
    // `estimateInkArea`): si un grupo es CLARAMENTE minoritario frente al
    // otro, se
    // lo trata como detalle prescindible y se conserva solo el grupo
    // dominante — nunca al revés, nunca se inventa geometría, solo se
    // omite la parte menor (misma filosofía que "Caso C" del importador
    // de PDF, generalizada: preferir el relleno/trazo dominante en vez de
    // rechazar por una franja de detalle). Si ambos grupos son de escala
    // COMPARABLE, sigue sin poder decidirse de forma determinista cuál es
    // "el diseño real" — se rechaza, igual que antes.
    const filledArea = estimateInkArea(filledShapes, 'fill');
    const strokedArea = estimateInkArea(strokedShapes, 'stroke');
    const minority = Math.min(filledArea, strokedArea);
    const majority = Math.max(filledArea, strokedArea);
    const isMinorityNegligible = majority > 0 && minority / majority < MINORITY_AREA_RATIO_THRESHOLD;
    if (isMinorityNegligible) {
      if (filledArea >= strokedArea) {
        strokedShapes = [];
      } else {
        filledShapes = [];
      }
    } else {
      return err('Este SVG combina relleno y trazo de una forma que no podemos simplificar de forma determinista.');
    }
  }

  let paintMode: IconPaintMode;
  let fillRule: 'nonzero' | 'evenodd' = 'nonzero';
  let rawStrokeWidth: number | undefined;
  let chosenShapes: CollectedShape[];
  /**
   * Etapa 8E: capas pendientes de normalizar (todavía en coordenadas del
   * mundo, sin serializar) — solo se llenan cuando hay MÁS DE UNA forma
   * con relleno. `undefined` para el caso simple (una sola forma, o un
   * ícono de trazo puro), que sigue exactamente el camino de siempre más
   * abajo.
   */
  let pendingLayers: { commands: AbsCommand[]; role: 'ink' | 'paper'; fillRule: 'nonzero' | 'evenodd' }[] | undefined;

  if (filledShapes.length > 0) {
    paintMode = 'fill';
    if (filledShapes.length === 1) {
      fillRule = filledShapes[0].fillRule;
      chosenShapes = filledShapes;
    } else {
      // Etapa 8E: dos o más formas con relleno — NUNCA se vuelven a
      // fusionar en un solo `d` + un solo `fillRule` (esa fusión, vía
      // evenodd evaluado de forma GLOBAL sobre formas originalmente
      // independientes, es la causa raíz confirmada en el Paso 1 de esta
      // etapa: dos formas que se tocan o se superponen levemente terminan
      // canceladas entre sí, como si fueran un agujero anidado de una
      // misma forma — el caso real de "boca 01.svg"). En su lugar, cada
      // forma se conserva como su propia capa, en el MISMO orden en que
      // se recorrió el documento (orden de pintado real), clasificada por
      // color en, como máximo, dos "tonos conceptuales" (`groupColors`,
      // `svgColorGrouping.ts`): la más oscura es `ink` (se pinta con el
      // color de tinta único del editor, igual que siempre), la más clara
      // es `paper` (revela lo pintado antes — nunca introduce blanco real,
      // ver `IconLayer` en `iconLibrary.ts` — el caso real de
      // "boca 02.svg").
      const colorGrouping = groupColors(filledShapes.map((s) => s.fillColor));
      if (!colorGrouping.ok) {
        if (colorGrouping.reason === 'too-many-groups') {
          return err('Este SVG usa más de dos tonos; el personalizador solo admite diseños de dos tonos (tinta y fondo).');
        }
        return err('Este SVG usa un color que no podemos interpretar de forma determinista.');
      }
      const roleByColor = new Map<string, 'ink' | 'paper'>();
      colorGrouping.groups.forEach((group, index) => {
        // `groupColors` siempre devuelve los grupos ordenados de más
        // oscuro a más claro (ver su documentación) — el índice 0 es
        // siempre tinta; con 2 grupos, el índice 1 (el más claro) es
        // papel.
        const role: 'ink' | 'paper' = index === 0 ? 'ink' : 'paper';
        for (const color of group.members) roleByColor.set(color, role);
      });
      pendingLayers = filledShapes.map((s) => ({
        commands: s.commands,
        role: roleByColor.get(s.fillColor) ?? 'ink',
        fillRule: s.fillRule,
      }));
      chosenShapes = filledShapes;
    }
  } else if (strokedShapes.length > 0) {
    paintMode = 'stroke';
    const widths = strokedShapes.map((s) => Math.round(s.effectiveStrokeWidth * 1000) / 1000);
    const uniqueWidths = new Set(widths);
    if (uniqueWidths.size > 1) {
      return err('Este SVG usa anchos de trazo distintos que no podemos simplificar de forma determinista.');
    }
    rawStrokeWidth = widths[0];
    chosenShapes = strokedShapes;
  } else {
    return err('El SVG no contiene una geometría válida.');
  }

  if (pendingLayers) {
    const totalCommands = pendingLayers.reduce((sum, l) => sum + l.commands.length, 0);
    if (totalCommands > MAX_COMMANDS_BEFORE_NORMALIZE) {
      return err('El diseño es demasiado complejo para usarlo como ícono.');
    }
    const rawLayerDs = pendingLayers.map((l) => serializeCommands(l.commands));
    let normalizedLayers;
    try {
      normalizedLayers = normalizeIconLayers(rawLayerDs);
    } catch {
      return err('El SVG no contiene una geometría válida.');
    }
    const layers: IconLayer[] = pendingLayers.map((l, i) => ({
      d: normalizedLayers.layerPathDs[i],
      role: l.role,
      fillRule: l.fillRule,
    }));
    // Fallback `svgPath` best-effort (ver el comentario del campo en
    // `SvgIconGeometry`): solo las capas `ink`, fusionadas con el mismo
    // criterio que se usaba antes de esta etapa — nunca se usa para el
    // renderizado real (siempre pasa por `layers`), solo para no dejar
    // `svgPath` vacío/roto de cara a un consumidor legacy. Nunca puede
    // quedar vacío: el grupo de índice 0 (`ink`) siempre tiene al menos un
    // color, y por lo tanto al menos una forma.
    const inkOnlyCommands = pendingLayers.filter((l) => l.role === 'ink').flatMap((l) => l.commands);
    let fallback;
    try {
      fallback = normalizeIconPath(serializeCommands(inkOnlyCommands));
    } catch {
      return err('El SVG no contiene una geometría válida.');
    }
    return {
      ok: true,
      geometry: {
        svgPath: fallback.d,
        paintMode: 'fill',
        fillRule: 'nonzero',
        layers,
      },
    };
  }

  const allCommands = chosenShapes.flatMap((s) => s.commands);
  if (allCommands.length > MAX_COMMANDS_BEFORE_NORMALIZE) {
    return err('El diseño es demasiado complejo para usarlo como ícono.');
  }

  const combinedD = serializeCommands(allCommands);
  let normalized;
  try {
    normalized = normalizeIconPath(combinedD);
  } catch {
    return err('El SVG no contiene una geometría válida.');
  }

  return {
    ok: true,
    geometry: {
      svgPath: normalized.d,
      paintMode,
      fillRule,
      strokeWidth: paintMode === 'stroke' && rawStrokeWidth !== undefined ? rawStrokeWidth * normalized.scale : undefined,
    },
  };
}
