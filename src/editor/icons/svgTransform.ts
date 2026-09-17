/**
 * Matrices afines 2D para el atributo `transform` de SVG — Etapa 8B (subida
 * de íconos SVG propios). Módulo chico y AISLADO a propósito: la Etapa 7B/7C
 * de este proyecto encontró y corrigió un bug real de orden de composición
 * de matrices en `scripts/icon-import/pdfToPaths.ts` (PDF) — para no
 * arrastrar esa misma clase de error acá, esta es una implementación
 * PROPIA, con su contrato documentado sin ambigüedad y probada con tests
 * dedicados (`svgTransform.test.ts`) antes de usarse en el extractor de SVG
 * (`svgIconExtractor.ts`). No se reutiliza `pdfToPaths.ts` (es específico de
 * PDF, vive en `scripts/`, nunca se importa desde `src/` — ver
 * docs/ARCHITECTURE.md, "La representación interna NO está atada a PDF").
 *
 * CONVENCIÓN (vector fila, igual que el resto del proyecto): una matriz
 * `[a, b, c, d, e, f]` representa la 3x3
 *   | a b 0 |
 *   | c d 0 |
 *   | e f 1 |
 * y un punto (x,y) se transforma como `x' = a*x + c*y + e`, `y' = b*x + d*y + f`
 * (`p' = p · M`). Los 6 parámetros de `matrix(a,b,c,d,e,f)` de SVG son,
 * verificado por derivación explícita (transponer la matriz columna-vector
 * que define la spec de SVG da exactamente esta misma tupla de 6 números en
 * el mismo orden), directamente estos mismos 6 números — no hace falta
 * reordenar/transponer nada al parsear `matrix(...)`.
 *
 * `compose(base, m)`: aplica `base` PRIMERO, `m` DESPUÉS — `p'' = (p·base)·m`,
 * que es exactamente el producto matricial `base × m` (`base` como factor
 * IZQUIERDO). Se verifica con tests explícitos contra puntos de control
 * calculados a mano (no contra sí misma) — ver `svgTransform.test.ts`.
 */

export type Matrix = [number, number, number, number, number, number];

export const IDENTITY_MATRIX: Matrix = [1, 0, 0, 1, 0, 0];

/** Aplica `base` primero, `m` después (`base × m`, ver el comentario grande de arriba). */
export function compose(base: Matrix, m: Matrix): Matrix {
  const [a0, b0, c0, d0, e0, f0] = base;
  const [a1, b1, c1, d1, e1, f1] = m;
  return [
    a0 * a1 + b0 * c1,
    a0 * b1 + b0 * d1,
    c0 * a1 + d0 * c1,
    c0 * b1 + d0 * d1,
    e0 * a1 + f0 * c1 + e1,
    e0 * b1 + f0 * d1 + f1,
  ];
}

export function applyToPoint(m: Matrix, x: number, y: number): { x: number; y: number } {
  const [a, b, c, d, e, f] = m;
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

export function translateMatrix(tx: number, ty: number): Matrix {
  return [1, 0, 0, 1, tx, ty];
}

export function scaleMatrix(sx: number, sy: number): Matrix {
  return [sx, 0, 0, sy, 0, 0];
}

/** `deg` en grados, sentido igual al de SVG (positivo = horario en pantalla, Y hacia abajo). */
export function rotateMatrix(deg: number): Matrix {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [cos, sin, -sin, cos, 0, 0];
}

export function skewXMatrix(deg: number): Matrix {
  return [1, 0, Math.tan((deg * Math.PI) / 180), 1, 0, 0];
}

export function skewYMatrix(deg: number): Matrix {
  return [1, Math.tan((deg * Math.PI) / 180), 0, 1, 0, 0];
}

/**
 * Determina si la parte lineal 2x2 de una matriz es una "similitud"
 * (rotación + escala UNIFORME, sin sesgo) — condición `a≈d && b≈-c`. Bajo
 * una similitud, un círculo siempre se transforma en un círculo (nunca en
 * una elipse), con radio multiplicado por `sqrt(a²+b²)` — se usa en
 * `svgIconExtractor.ts` para decidir si un arco circular puede transformarse
 * de forma EXACTA bajo una rotación, en vez de tener que rechazar el
 * archivo (ver esa nota ahí para el porqué).
 */
export function isSimilarity(m: Matrix, tolerance = 1e-6): boolean {
  const [a, b, c, d] = m;
  return Math.abs(a - d) <= tolerance && Math.abs(b + c) <= tolerance;
}

/** Factor de escala de una similitud (ver `isSimilarity`) — raíz de a²+b². */
export function similarityScale(m: Matrix): number {
  const [a, b] = m;
  return Math.sqrt(a * a + b * b);
}

/** true si la parte lineal 2x2 no tiene rotación NI sesgo (b≈0, c≈0) — escala independiente por eje, posiblemente no uniforme, siempre válida para transformar un rectángulo/elipse sin rotación. */
export function isAxisAligned(m: Matrix, tolerance = 1e-6): boolean {
  const [, b, c] = m;
  return Math.abs(b) <= tolerance && Math.abs(c) <= tolerance;
}

/**
 * Parsea un atributo `transform` de SVG (`translate(...) rotate(...) ...`,
 * separados por espacios y/o comas) a una matriz combinada única.
 *
 * Orden de composición (spec de SVG/CSS): la lista se aplica de DERECHA A
 * IZQUIERDA (la última función listada es la más "interna", la que toca la
 * geometría primero) — `transform="translate(10,0) scale(2)"` escala
 * primero, después traslada. Implementado recorriendo la lista en su orden
 * de aparición y acumulando `acc = compose(nuevaFunción, acc)` — cada
 * función nueva se aplica ANTES que todo lo ya acumulado (que queda "más
 * afuera"), lo que reproduce exactamente esa regla. Ver
 * `svgTransform.test.ts` para el caso verificado a mano.
 *
 * Devuelve `IDENTITY_MATRIX` si el atributo es `null`/vacío. Tira `Error`
 * (mensaje interno, el llamador lo traduce a un mensaje amigable) ante una
 * función de transform no reconocida o con una cantidad de parámetros
 * inválida — nunca ignora silenciosamente una transformación que no puede
 * interpretar (ver la filosofía de "rechazar en vez de adivinar" del
 * pedido de esta etapa).
 */
export function parseTransformAttribute(value: string | null | undefined): Matrix {
  if (!value || value.trim().length === 0) {
    return IDENTITY_MATRIX;
  }
  const functionPattern = /([A-Za-z]+)\s*\(([^)]*)\)/g;
  const functions: { name: string; args: number[] }[] = [];
  let matchedSpan = '';
  let match: RegExpExecArray | null;
  while ((match = functionPattern.exec(value)) !== null) {
    const args = (match[2].match(/-?(?:\d+\.\d+|\.\d+|\d+)(?:[eE][+-]?\d+)?/g) ?? []).map(Number);
    functions.push({ name: match[1], args });
    matchedSpan += match[0];
  }
  // Si queda contenido no-espacio/no-coma fuera de lo que matchearon las
  // funciones reconocidas (typo, sintaxis no soportada), NUNCA se ignora en
  // silencio: se rechaza el `transform` completo — "rechazar en vez de
  // adivinar" (ver el pedido de esta etapa).
  const normalize = (s: string) => s.replace(/[\s,]/g, '');
  if (functions.length === 0 || normalize(matchedSpan).length !== normalize(value).length) {
    throw new Error(`transform con sintaxis no reconocida: "${value}".`);
  }

  let acc: Matrix = IDENTITY_MATRIX;
  for (const fn of functions) {
    const m = transformFunctionToMatrix(fn.name, fn.args);
    acc = compose(m, acc);
  }
  return acc;
}

function transformFunctionToMatrix(name: string, args: number[]): Matrix {
  switch (name) {
    case 'translate': {
      if (args.length === 1) return translateMatrix(args[0], 0);
      if (args.length === 2) return translateMatrix(args[0], args[1]);
      throw new Error(`transform "translate" con cantidad de argumentos inválida (${args.length}).`);
    }
    case 'scale': {
      if (args.length === 1) return scaleMatrix(args[0], args[0]);
      if (args.length === 2) return scaleMatrix(args[0], args[1]);
      throw new Error(`transform "scale" con cantidad de argumentos inválida (${args.length}).`);
    }
    case 'rotate': {
      if (args.length === 1) return rotateMatrix(args[0]);
      if (args.length === 3) {
        const [deg, cx, cy] = args;
        return compose(translateMatrix(-cx, -cy), compose(rotateMatrix(deg), translateMatrix(cx, cy)));
      }
      throw new Error(`transform "rotate" con cantidad de argumentos inválida (${args.length}).`);
    }
    case 'skewX': {
      if (args.length === 1) return skewXMatrix(args[0]);
      throw new Error(`transform "skewX" con cantidad de argumentos inválida (${args.length}).`);
    }
    case 'skewY': {
      if (args.length === 1) return skewYMatrix(args[0]);
      throw new Error(`transform "skewY" con cantidad de argumentos inválida (${args.length}).`);
    }
    case 'matrix': {
      if (args.length === 6) return [args[0], args[1], args[2], args[3], args[4], args[5]];
      throw new Error(`transform "matrix" con cantidad de argumentos inválida (${args.length}).`);
    }
    default:
      throw new Error(`función de transform no reconocida: "${name}".`);
  }
}
