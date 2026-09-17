/**
 * Normalizador de path de ícono — Etapa 1 del plan de biblioteca de íconos.
 *
 * CONTRATO DE ENTRADA (a propósito acotado, ver la nota de seguridad al
 * final): recibe únicamente el contenido de un atributo `d` de SVG (datos
 * de trazo — comandos de path: M/L/H/V/C/S/Q/T/A/Z, absolutos o relativos)
 * — NUNCA un documento `<svg>...</svg>` completo, NUNCA HTML, NUNCA
 * markup con estilos/transforms/grupos. Es el mismo tipo de dato que ya
 * usa `IconDefinition.svgPath` en `iconLibrary.ts` hoy — este módulo no
 * inventa un formato nuevo, prepara ESE MISMO formato de forma consistente
 * sin importar de dónde haya salido el `d` original.
 *
 * QUÉ HACE: recalcula el bounding box REAL de la geometría (nunca confía
 * en un viewBox externo declarado, que puede tener aire de sobra o estar
 * mal — ver el pedido "sin depender del viewBox original del asset"),
 * centra esa geometría y la reescala UNIFORME (mismo factor en X e Y, para
 * no deformar el ícono) para que quede dentro del viewBox de referencia
 * `0 0 100 100` que ya usan los 6 íconos actuales, con un margen chico —
 * mismo criterio de margen conservador que ya usa el resto del proyecto
 * (ej. `ICON_MARGIN_PX`/`TEXT_RADIAL_MARGIN_PX`).
 *
 * QUÉ NO HACE (a propósito, ver "No sobreingeniería" en el pedido): no
 * parsea SVG completo (sin `<g>`, sin `transform`, sin múltiples
 * elementos, sin estilos) — ese es un problema mucho más grande
 * ("parser universal de SVG") que no hace falta resolver para poder
 * normalizar un `d` ya extraído. Separar la extracción del `d` (de un PDF,
 * de un SVG subido, etc. — trabajo de la Etapa 2/5, todavía sin
 * implementar) de esta normalización geométrica es justamente lo que
 * mantiene esta pieza chica, aislada y fácil de probar.
 *
 * "Sin color propio" / "sin metadata innecesaria": no son pasos explícitos
 * acá — son una consecuencia DIRECTA del contrato de entrada/salida: un
 * `d` de SVG nunca contiene color ni metadata (eso vive en atributos del
 * elemento `<path>`, fuera del `d`), así que no hay nada que "limpiar" —
 * la función simplemente nunca los ve ni los produce.
 */

/**
 * Techo defensivo de comandos a procesar — ver la nota de seguridad al
 * final. Subido de 5000 a 20000 durante la Etapa 2 (importación real):
 * 5000 fue elegido en la Etapa 1 mirando solo los 6 íconos simples de
 * `iconLibrary.ts`, y resultó demasiado bajo para arte vectorial real y
 * legítimamente detallado del cliente (un ícono real de engranajes ya lo
 * superaba en ~10% con apenas 5518 comandos) — sigue siendo una defensa
 * contra un archivo patológico, no una regla de diseño del catálogo (la
 * decisión de qué tan "simple" debe ser un ícono para el catálogo la toma
 * el clasificador del importador — ver `scripts/icon-import/classifyIcon.ts`
 * —, no este límite).
 */
const MAX_COMMANDS = 20_000;

/** Viewbox de referencia — el mismo que ya usan los 6 íconos de `iconLibrary.ts` (comentario en ese archivo: "El viewBox de referencia de todos los `d` es `0 0 100 100`"). */
const REFERENCE_VIEWBOX_SIZE = 100;

/**
 * Margen que queda libre alrededor del ícono normalizado, como fracción del
 * viewBox de referencia por lado (5% ⇒ el ícono ocupa el rango [5, 95] en
 * su eje más largo). Elegido mirando el margen que ya tienen a mano los
 * íconos actuales (ej. el corazón de `iconLibrary.ts` ocupa X∈[5,95],
 * Y∈[2,88]) — así un ícono normalizado por esta función no se ve
 * "más pegado al borde" que uno escrito a mano.
 */
const NORMALIZE_MARGIN_RATIO = 0.05;

const DRAWABLE_SIZE = REFERENCE_VIEWBOX_SIZE * (1 - 2 * NORMALIZE_MARGIN_RATIO);

/** Cuántos números consume cada tipo de comando (por repetición implícita). */
const ARITY: Record<string, number> = {
  M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7, Z: 0,
};

interface RawCommand {
  /** Letra tal cual apareció (mayúscula = absoluto, minúscula = relativo). */
  code: string;
  params: number[];
}

/**
 * Forma normal interna: todo en coordenadas ABSOLUTAS, `H`/`V` ya
 * convertidos a `L`, `S`/`T` ya convertidos a `C`/`Q` (con el punto de
 * control reflejado resuelto) — así el resto del módulo (bbox, transformar,
 * re-serializar) solo necesita conocer 4 formas, no las 10 originales.
 */
export type AbsCommand =
  | { code: 'M' | 'L'; x: number; y: number }
  | { code: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { code: 'Q'; x1: number; y1: number; x: number; y: number }
  | { code: 'A'; rx: number; ry: number; xAxisRotation: number; largeArcFlag: 0 | 1; sweepFlag: 0 | 1; x: number; y: number }
  | { code: 'Z' };

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface NormalizedIconPath {
  /** El nuevo `d`, centrado y escalado uniformemente al viewBox de referencia `0 0 100 100`. */
  d: string;
  /** Bounding box real detectado en el `d` ORIGINAL (antes de normalizar) — informativo, útil para depurar/loguear durante la importación de la Etapa 2. */
  sourceBoundingBox: BoundingBox;
  /**
   * Factor de escala uniforme que se aplicó para pasar del bounding box
   * original al viewBox de referencia (`DRAWABLE_SIZE / Math.max(width,
   * height)`) — campo ADITIVO agregado en la Etapa 4 del plan de biblioteca
   * de íconos: cualquier otra magnitud del diseño original que dependa de
   * la escala (ej. el ancho de trazo real de un ícono `stroke`-only,
   * tomado del PDF vía `OPS.setLineWidth`) tiene que multiplicarse por este
   * MISMO factor para seguir siendo proporcionalmente correcta en el
   * viewBox normalizado — evita que el importador tenga que recalcular por
   * su cuenta una fórmula que ya vive acá (y podría desincronizarse).
   */
  scale: number;
}

/** Separa un `d` en comandos crudos (letra + sus números), sin resolver todavía repetición implícita ni relatividad. */
function tokenize(d: string): RawCommand[] {
  const commandPattern = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  const numberPattern = /[+-]?(?:\d+\.\d+|\.\d+|\d+)(?:[eE][+-]?\d+)?/g;
  const commands: RawCommand[] = [];
  let match: RegExpExecArray | null;
  while ((match = commandPattern.exec(d)) !== null) {
    const code = match[1];
    const params = (match[2].match(numberPattern) ?? []).map(Number);
    commands.push({ code, params });
    if (commands.length > MAX_COMMANDS) {
      throw new Error(`normalizeIconPath: el path supera el máximo de ${MAX_COMMANDS} comandos — posible dato inválido o malicioso.`);
    }
  }
  return commands;
}

/** Divide los parámetros de un comando repetible (M/L/T/H/V/C/S/Q/A) en grupos según su aridad, expandiendo la repetición implícita del `d` (ej. "L10,10 20,20" = dos lineto). */
function splitByArity(code: string, params: number[]): number[][] {
  const upper = code.toUpperCase();
  const arity = ARITY[upper];
  if (arity === 0) {
    return params.length === 0 ? [[]] : (() => { throw new Error(`normalizeIconPath: el comando "${code}" no admite parámetros.`); })();
  }
  if (params.length === 0 || params.length % arity !== 0) {
    throw new Error(`normalizeIconPath: cantidad de parámetros inválida para el comando "${code}" (esperaba múltiplos de ${arity}, vino ${params.length}).`);
  }
  const groups: number[][] = [];
  for (let i = 0; i < params.length; i += arity) {
    groups.push(params.slice(i, i + arity));
  }
  return groups;
}

/**
 * Convierte los comandos crudos (con repetición implícita y relatividad
 * todavía sin resolver) a la forma normal absoluta. Sigue la especificación
 * de SVG para: repetición implícita de M→L, reflejo del punto de control en
 * S/T (reflejado respecto del punto actual si el comando anterior no era
 * del mismo "family" — C/S para S, Q/T para T — o igual al punto actual si
 * no había uno compatible), y conversión de relativo a absoluto acumulando
 * el punto actual.
 */
function toAbsoluteCommands(raw: RawCommand[]): AbsCommand[] {
  const result: AbsCommand[] = [];
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let lastCubicControl: { x: number; y: number } | null = null;
  let lastQuadraticControl: { x: number; y: number } | null = null;

  for (const { code, params } of raw) {
    const upper = code.toUpperCase();
    const isRelative = code !== upper;
    const groups = splitByArity(code, params);

    // Reflejo válido solo para el comando INMEDIATO siguiente a uno
    // compatible — cualquier otro comando en el medio lo invalida.
    if (upper !== 'C' && upper !== 'S') {
      lastCubicControl = null;
    }
    if (upper !== 'Q' && upper !== 'T') {
      lastQuadraticControl = null;
    }

    groups.forEach((g, groupIndex) => {
      switch (upper) {
        case 'M': {
          // Per la spec de SVG (Paths — "moveto"): si un M/m viene seguido
          // de MÁS de un par de coordenadas, todos los pares A PARTIR DEL
          // SEGUNDO son linetos implícitos (mismo M/m, pero se comportan
          // como L/l) — nunca movetos adicionales. Antes de este fix
          // (Etapa 8E, encontrado al diagnosticar por qué ciertas capas de
          // "boca 02.svg" no pintaban NADA: cada par de coordenadas se
          // empujaba como un `M` nuevo, así que un polígono de 5 puntos
          // escrito como `m x,y dx1,dy1 dx2,dy2 dx3,dy3 dx4,dy4` (forma muy
          // común en exportaciones de Inkscape) se convertía en 5 subpaths
          // de UN SOLO PUNTO cada uno — sin ningún segmento que los una,
          // así que el área rellena terminaba siendo cero. Afecta cualquier
          // `d` que use esta abreviatura, no solo capas `paper` — un bug de
          // parseo preexistente (Etapa 1), no algo nuevo de esta etapa.
          const [px, py] = g;
          const x = isRelative ? cx + px : px;
          const y = isRelative ? cy + py : py;
          if (groupIndex === 0) {
            result.push({ code: 'M', x, y });
            sx = x; sy = y;
          } else {
            result.push({ code: 'L', x, y });
          }
          cx = x; cy = y;
          break;
        }
        case 'L': {
          const [px, py] = g;
          const x = isRelative ? cx + px : px;
          const y = isRelative ? cy + py : py;
          result.push({ code: 'L', x, y });
          cx = x; cy = y;
          break;
        }
        case 'H': {
          const [px] = g;
          const x = isRelative ? cx + px : px;
          result.push({ code: 'L', x, y: cy });
          cx = x;
          break;
        }
        case 'V': {
          const [py] = g;
          const y = isRelative ? cy + py : py;
          result.push({ code: 'L', x: cx, y });
          cy = y;
          break;
        }
        case 'C': {
          const [x1r, y1r, x2r, y2r, xr, yr] = g;
          const x1 = isRelative ? cx + x1r : x1r;
          const y1 = isRelative ? cy + y1r : y1r;
          const x2 = isRelative ? cx + x2r : x2r;
          const y2 = isRelative ? cy + y2r : y2r;
          const x = isRelative ? cx + xr : xr;
          const y = isRelative ? cy + yr : yr;
          result.push({ code: 'C', x1, y1, x2, y2, x, y });
          lastCubicControl = { x: x2, y: y2 };
          cx = x; cy = y;
          break;
        }
        case 'S': {
          const [x2r, y2r, xr, yr] = g;
          const x2 = isRelative ? cx + x2r : x2r;
          const y2 = isRelative ? cy + y2r : y2r;
          const x = isRelative ? cx + xr : xr;
          const y = isRelative ? cy + yr : yr;
          const reflected: { x: number; y: number } = lastCubicControl ? { x: 2 * cx - lastCubicControl.x, y: 2 * cy - lastCubicControl.y } : { x: cx, y: cy };
          result.push({ code: 'C', x1: reflected.x, y1: reflected.y, x2, y2, x, y });
          lastCubicControl = { x: x2, y: y2 };
          cx = x; cy = y;
          break;
        }
        case 'Q': {
          const [x1r, y1r, xr, yr] = g;
          const x1 = isRelative ? cx + x1r : x1r;
          const y1 = isRelative ? cy + y1r : y1r;
          const x = isRelative ? cx + xr : xr;
          const y = isRelative ? cy + yr : yr;
          result.push({ code: 'Q', x1, y1, x, y });
          lastQuadraticControl = { x: x1, y: y1 };
          cx = x; cy = y;
          break;
        }
        case 'T': {
          const [xr, yr] = g;
          const x = isRelative ? cx + xr : xr;
          const y = isRelative ? cy + yr : yr;
          const reflected: { x: number; y: number } = lastQuadraticControl ? { x: 2 * cx - lastQuadraticControl.x, y: 2 * cy - lastQuadraticControl.y } : { x: cx, y: cy };
          result.push({ code: 'Q', x1: reflected.x, y1: reflected.y, x, y });
          lastQuadraticControl = { x: reflected.x, y: reflected.y };
          cx = x; cy = y;
          break;
        }
        case 'A': {
          const [rx, ry, xAxisRotation, laf, sf, xr, yr] = g;
          const x = isRelative ? cx + xr : xr;
          const y = isRelative ? cy + yr : yr;
          result.push({
            code: 'A',
            rx: Math.abs(rx),
            ry: Math.abs(ry),
            xAxisRotation,
            largeArcFlag: laf ? 1 : 0,
            sweepFlag: sf ? 1 : 0,
            x,
            y,
          });
          cx = x; cy = y;
          break;
        }
        case 'Z': {
          result.push({ code: 'Z' });
          cx = sx; cy = sy;
          break;
        }
        default:
          throw new Error(`normalizeIconPath: comando de path no reconocido "${code}".`);
      }
    });
  }

  return result;
}

/**
 * Bounding box de una lista de comandos absolutos. Para curvas (C/Q), usa
 * los puntos de anclaje Y de control — un límite SIEMPRE seguro (nunca más
 * chico que la curva real): toda curva de Bézier queda contenida en el
 * casco convexo de sus puntos de control, así que el bounding box de esos
 * puntos nunca corta la curva, aunque puede ser un poco más grande que el
 * mínimo estricto. Para arcos (A), no se resuelve la elipse real (fuera de
 * alcance para esta etapa — ver el comentario grande al principio del
 * archivo): se acota de forma conservadora con el punto final ± el mayor
 * radio del arco, mismo criterio de "margen conservador" que ya usa el
 * resto del proyecto en vez de una fórmula exacta.
 */
export function computeBoundingBox(commands: AbsCommand[]): BoundingBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function include(x: number, y: number): void {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  for (const cmd of commands) {
    switch (cmd.code) {
      case 'M':
      case 'L':
        include(cmd.x, cmd.y);
        break;
      case 'C':
        include(cmd.x1, cmd.y1);
        include(cmd.x2, cmd.y2);
        include(cmd.x, cmd.y);
        break;
      case 'Q':
        include(cmd.x1, cmd.y1);
        include(cmd.x, cmd.y);
        break;
      case 'A': {
        const pad = Math.max(cmd.rx, cmd.ry);
        include(cmd.x - pad, cmd.y - pad);
        include(cmd.x + pad, cmd.y + pad);
        break;
      }
      case 'Z':
        break;
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    throw new Error('normalizeIconPath: no se pudo calcular un bounding box válido (¿path vacío?).');
  }

  return { minX, minY, maxX, maxY };
}

function round(n: number): number {
  // 3 decimales: de sobra para un viewBox de 100 unidades (~0.001% de
  // resolución) y compacto — evita que el ruido de punto flotante de la
  // transformación afine/escala infle el tamaño del `d` final.
  return Math.round(n * 1000) / 1000;
}

/** Re-serializa la forma absoluta normal a un string `d`, un comando por segmento, separados por espacio (mismo estilo que ya usa `iconLibrary.ts`). */
function serialize(commands: AbsCommand[]): string {
  return commands
    .map((cmd) => {
      switch (cmd.code) {
        case 'M':
          return `M${round(cmd.x)},${round(cmd.y)}`;
        case 'L':
          return `L${round(cmd.x)},${round(cmd.y)}`;
        case 'C':
          return `C${round(cmd.x1)},${round(cmd.y1)} ${round(cmd.x2)},${round(cmd.y2)} ${round(cmd.x)},${round(cmd.y)}`;
        case 'Q':
          return `Q${round(cmd.x1)},${round(cmd.y1)} ${round(cmd.x)},${round(cmd.y)}`;
        case 'A':
          return `A${round(cmd.rx)},${round(cmd.ry)} ${round(cmd.xAxisRotation)} ${cmd.largeArcFlag},${cmd.sweepFlag} ${round(cmd.x)},${round(cmd.y)}`;
        case 'Z':
          return 'Z';
      }
    })
    .join(' ');
}

/**
 * Tokeniza y resuelve un `d` de SVG a comandos absolutos (`AbsCommand[]`),
 * SIN normalizar (centrar/escalar) — expone la primera mitad del trabajo
 * que ya hacía `normalizeIconPath` internamente (Etapa 8B, extractor de SVG
 * subidos por el usuario: necesita los comandos absolutos de un `<path d>`
 * en su espacio de coordenadas LOCAL, para poder aplicarles la matriz de
 * `transform` del SVG ANTES de pasar el resultado combinado por
 * `normalizeIconPath`) — no es una función nueva, es `tokenize` +
 * `toAbsoluteCommands` (ya existían, sin cambios) con un nombre público.
 * Tira los mismos `Error` que ya tiraba `normalizeIconPath` ante datos
 * inválidos (path vacío, comando no reconocido, aridad incorrecta).
 */
export function parsePathCommands(rawPathD: string): AbsCommand[] {
  if (typeof rawPathD !== 'string' || rawPathD.trim().length === 0) {
    throw new Error('normalizeIconPath: el path de entrada está vacío.');
  }
  const raw = tokenize(rawPathD);
  if (raw.length === 0) {
    throw new Error('normalizeIconPath: no se encontró ningún comando de path SVG válido en la entrada.');
  }
  return toAbsoluteCommands(raw);
}

/**
 * Normaliza un `d` de path de ícono: recalcula su bounding box real,
 * lo centra y lo reescala UNIFORME (preserva la proporción del dibujo
 * original — un ícono ancho y bajo sigue siendo ancho y bajo, nunca se
 * deforma a cuadrado) para que quede dentro de `0 0 100 100`, con el
 * margen de `NORMALIZE_MARGIN_RATIO` en su eje más largo.
 *
 * Determinístico: la misma entrada produce siempre la misma salida (no hay
 * ningún estado global ni aleatoriedad involucrados).
 *
 * Tira `Error` (nunca devuelve un resultado silenciosamente inválido) ante
 * entrada vacía, sin comandos reconocibles, o un bounding box degenerado
 * (un solo punto, sin ancho NI alto) — un `svgPath` así no puede escalarse
 * de forma significativa, y un ícono "roto" nunca debería llegar en
 * silencio hasta `new Path(...)`.
 */
/** Factor de escala + centro (origen y destino) para pasar de un bounding box real al viewBox de referencia — la mitad "calcular" de la normalización, separada de la mitad "aplicar" (`applyNormalizationTransform`) para poder compartir AMBAS entre `normalizeIconPath` (un solo `d`) y `normalizeIconLayers` (varios `d` que deben quedar alineados entre sí, ver más abajo). */
interface NormalizationTransform {
  scale: number;
  centerX: number;
  centerY: number;
  targetCenter: number;
}

function computeNormalizationTransform(boundingBox: BoundingBox): NormalizationTransform {
  const width = boundingBox.maxX - boundingBox.minX;
  const height = boundingBox.maxY - boundingBox.minY;
  if (width === 0 && height === 0) {
    throw new Error('normalizeIconPath: el path no tiene extensión (¿es un único punto?) — no se puede normalizar.');
  }
  return {
    scale: DRAWABLE_SIZE / Math.max(width, height),
    centerX: (boundingBox.minX + boundingBox.maxX) / 2,
    centerY: (boundingBox.minY + boundingBox.maxY) / 2,
    targetCenter: REFERENCE_VIEWBOX_SIZE / 2,
  };
}

/** Aplica una `NormalizationTransform` YA CALCULADA a una lista de comandos absolutos — nunca recalcula bbox/escala por su cuenta, así que llamarla con la MISMA transform sobre varias listas de comandos distintas (`normalizeIconLayers`) las deja alineadas entre sí exactamente como estaban en el espacio original. */
function applyNormalizationTransform(commands: AbsCommand[], t: NormalizationTransform): AbsCommand[] {
  function transformPoint(x: number, y: number): { x: number; y: number } {
    return {
      x: (x - t.centerX) * t.scale + t.targetCenter,
      y: (y - t.centerY) * t.scale + t.targetCenter,
    };
  }
  return commands.map((cmd): AbsCommand => {
    switch (cmd.code) {
      case 'M':
      case 'L': {
        const p = transformPoint(cmd.x, cmd.y);
        return { code: cmd.code, x: p.x, y: p.y };
      }
      case 'C': {
        const p1 = transformPoint(cmd.x1, cmd.y1);
        const p2 = transformPoint(cmd.x2, cmd.y2);
        const p = transformPoint(cmd.x, cmd.y);
        return { code: 'C', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, x: p.x, y: p.y };
      }
      case 'Q': {
        const p1 = transformPoint(cmd.x1, cmd.y1);
        const p = transformPoint(cmd.x, cmd.y);
        return { code: 'Q', x1: p1.x, y1: p1.y, x: p.x, y: p.y };
      }
      case 'A': {
        const p = transformPoint(cmd.x, cmd.y);
        return { ...cmd, rx: cmd.rx * t.scale, ry: cmd.ry * t.scale, x: p.x, y: p.y };
      }
      case 'Z':
        return cmd;
    }
  });
}

export function normalizeIconPath(rawPathD: string): NormalizedIconPath {
  if (typeof rawPathD !== 'string' || rawPathD.trim().length === 0) {
    throw new Error('normalizeIconPath: el path de entrada está vacío.');
  }

  const raw = tokenize(rawPathD);
  if (raw.length === 0) {
    throw new Error('normalizeIconPath: no se encontró ningún comando de path SVG válido en la entrada.');
  }

  const absolute = toAbsoluteCommands(raw);
  const sourceBoundingBox = computeBoundingBox(absolute);
  const transform = computeNormalizationTransform(sourceBoundingBox);
  const transformed = applyNormalizationTransform(absolute, transform);

  return { d: serialize(transformed), sourceBoundingBox, scale: transform.scale };
}

export interface NormalizedIconLayers {
  /** Un `d` normalizado por capa, en el MISMO orden que se pasó en `rawLayerPathDs` — el orden de pintado nunca se reordena acá. */
  layerPathDs: string[];
  /** Bounding box real de la UNIÓN de todas las capas (nunca de cada una por separado). */
  sourceBoundingBox: BoundingBox;
  /** Mismo significado que en `NormalizedIconPath.scale` — un único factor, compartido por todas las capas. */
  scale: number;
}

/**
 * Igual que `normalizeIconPath`, pero para VARIAS capas que deben quedar
 * alineadas entre sí (Etapa 8E — SVG compuesto: escudo + banda + letras,
 * etc.). La diferencia crítica con llamar `normalizeIconPath` una vez por
 * capa: acá el bounding box y la escala se calculan UNA sola vez, sobre la
 * UNIÓN de la geometría de todas las capas, y esa MISMA transformación se
 * aplica a cada capa — así conservan exactamente su posición relativa
 * original. Normalizar cada capa por separado (cada una centrada en su
 * PROPIO bbox) rompería el diseño: dos formas que en el original estaban
 * una al lado de la otra terminarían las dos centradas en el mismo punto.
 *
 * Reutiliza `parsePathCommands`/`computeBoundingBox` (ya usados por
 * `svgIconExtractor.ts`) y la misma lógica de escala/centrado que
 * `normalizeIconPath` — no hay un segundo parser ni una segunda fórmula de
 * normalización, solo se comparte el cálculo entre más de un `d`.
 */
export function normalizeIconLayers(rawLayerPathDs: readonly string[]): NormalizedIconLayers {
  if (rawLayerPathDs.length === 0) {
    throw new Error('normalizeIconPath: no hay ninguna capa para normalizar.');
  }
  const perLayerAbsolute = rawLayerPathDs.map((d) => parsePathCommands(d));
  const allCommands = perLayerAbsolute.flat();
  const sourceBoundingBox = computeBoundingBox(allCommands);
  const transform = computeNormalizationTransform(sourceBoundingBox);
  const layerPathDs = perLayerAbsolute.map((commands) => serialize(applyNormalizationTransform(commands, transform)));

  return { layerPathDs, sourceBoundingBox, scale: transform.scale };
}

/**
 * NOTA DE SEGURIDAD (ver docs/ARCHITECTURE.md, "SVG y seguridad" — la
 * misma decisión que ya rige `iconLibrary.ts`/`iconElement.ts`):
 *
 * Esta función jamás interpreta el string de entrada como SVG/XML/HTML: no
 * hay ningún `DOMParser`, `innerHTML`, ni `loadSVGFromString` involucrado
 * en todo el archivo. Se trata siempre como un string de datos —se
 * tokeniza con expresiones regulares contra un alfabeto fijo de comandos
 * de path (`MLHVCSQTAZ`) y números—, nunca se ejecuta ni se renderiza
 * directamente. Cualquier contenido que no sea una letra de comando
 * reconocida o un número válido se ignora silenciosamente al tokenizar
 * (no puede inyectar nada: no hay ninguna ruta desde el texto de entrada
 * hasta el DOM salvo pasar, al final, por `new Path(d, {...})` de
 * Fabric.js — la misma ruta segura que ya usan los 6 íconos actuales).
 * `MAX_COMMANDS` acota el trabajo máximo por llamada, como defensa
 * adicional ante una entrada patológicamente grande.
 */
