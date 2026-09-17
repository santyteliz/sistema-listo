/**
 * Extracción de geometría vectorial de un PDF — Etapa 2 (extracción base) +
 * Etapa 4 (paint type real, corrección de relleno/trazo) del plan de
 * biblioteca de íconos. Herramienta OFFLINE (Node), nunca corre en el
 * browser ni se importa desde `src/` — el editor no sabe que esto existe.
 *
 * Usa `pdfjs-dist` (el motor real de PDF.js, el mismo que usa Firefox) para
 * INTERPRETAR el PDF — nunca para dibujar/rasterizar: se consume la API de
 * bajo nivel `page.getOperatorList()`, que devuelve la secuencia YA
 * interpretada de operadores de dibujo (moveTo/lineTo/curveTo/fill/clip/
 * transform/etc., con streams comprimidos, fuentes y todo lo demás del
 * formato PDF ya resueltos por pdf.js) — nosotros solo recorremos esa
 * lista y la convertimos a un `d` de SVG. No se escribe ningún parser de
 * PDF propio.
 *
 * CÓMO SE ARMA LA GEOMETRÍA (verificado leyendo el código fuente real de
 * `pdfjs-dist@6.3.289`, no asumido):
 *
 * - Cada operador `constructPath` (`OPS.constructPath`) trae sus datos como
 *   `argsArray[i] = [paintType, [drawOpsStream], minMax]`. `drawOpsStream`
 *   es un `Float32Array` que codifica la secuencia real de sub-operaciones
 *   EN EL MISMO array, intercalando código de operación y sus coordenadas:
 *   `0` moveTo (2 números), `1` lineTo (2), `2` curveTo (6 — Bézier
 *   cúbica), `3` quadraticCurveTo (4), `4` closePath (0) — constantes
 *   confirmadas en `node_modules/pdfjs-dist/legacy/build/pdf.mjs`, función
 *   `makePathFromDrawOPS`/objeto `DrawOPS`. Mapeo directo y exacto a los
 *   comandos SVG `M`/`L`/`C`/`Q`/`Z` — PDF no tiene un operador de arco
 *   elíptico nativo, así que la extracción real nunca necesita `A`.
 *
 * - **`argsArray[i][0]` — HALLAZGO CENTRAL de la Etapa 4** (ver el informe
 *   de esa etapa, "Resultado de la prueba mínima"): pdf.js NO emite un
 *   operador de pintado (`fill`/`stroke`/etc.) por separado después de un
 *   `constructPath` — lo FUSIONA como primer argumento del propio
 *   `constructPath`. Verificado con una prueba real sobre 3 PDFs de 3
 *   categorías distintas (`ANIMALES_04`, `Escudo_07`, `FUTBOL_13`): cada
 *   uno tenía cientos/decenas de `constructPath` cuyo `args[0]` era
 *   literalmente el código numérico de `OPS.stroke`(20)/`OPS.fill`(22)/
 *   `OPS.eoFill`(23)/etc. — NUNCA un operador `fill`/`stroke` aparte. La
 *   versión anterior de este archivo (Etapa 2) ignoraba este dato (lo
 *   documentaba como "`_`, no lo necesitamos") y usaba un heurístico
 *   distinto ("¿el operador anterior en la lista plana fue `clip`?") para
 *   decidir qué descartar — esa es la causa raíz confirmada de que
 *   geometría de trazo (`stroke`) y de relleno (`fill`/`eoFill`) terminaran
 *   mezcladas en un solo `d`, y de que el fill-rule (`evenodd`) real del
 *   diseño se ignorara por completo. Esta versión lee `args[0]` en cada
 *   `constructPath` y expone el paint type real — la clasificación de qué
 *   hacer con cada uno (conservar como relleno, como trazo, descartar por
 *   redundante, o marcar `manual-review`) vive en `composeIconGeometry.ts`,
 *   NO acá: este módulo solo EXTRAE datos fieles al PDF, nunca decide.
 *
 * - Un `constructPath` con paint type `endPath` (`OPS.endPath`, código 28)
 *   es un path que se CONSTRUYE pero nunca se pinta — típicamente el
 *   recorte de página completa (`W n` en PDF: define un clip y no pinta
 *   nada) — se descarta siempre, sin heurísticos ("el operador anterior
 *   fue clip") que puedan fallar: el propio dato de pdf.js ya lo dice sin
 *   ambigüedad.
 *
 * - Las coordenadas de cada `constructPath` están en el sistema de
 *   coordenadas LOCAL vigente en ese punto del stream — hace falta
 *   acumular la matriz de transformación (CTM) del propio stream de
 *   contenido (operadores `save`/`restore`/`transform`, una pila de
 *   matrices 2D estándar) para llevarlas a espacio de página. Sobre eso se
 *   aplica, una sola vez al final, `page.getViewport({ scale: 1 }).transform`
 *   — la MISMA matriz que ya usa el renderizador oficial de pdf.js para ir
 *   de espacio de página (PDF, Y creciendo hacia arriba) a espacio de
 *   pantalla/SVG (Y creciendo hacia abajo) — así el eje Y queda invertido
 *   correctamente sin necesitar una fórmula propia ad-hoc.
 *
 * - `OPS.setLineWidth` (Etapa 4, nuevo): igual que la CTM, el ancho de
 *   trazo declarado en el PDF (`w` en el content stream) es parte del
 *   graphics state — respeta `save`/`restore` — y está en el mismo espacio
 *   LOCAL que las coordenadas del path en ese punto. Se acumula en una
 *   pila paralela a la de matrices, y se guarda YA multiplicado por el
 *   factor de escala de la matriz final vigente en ese `constructPath`
 *   (`scaleOf(finalMatrix)`, la raíz cuadrada del determinante absoluto de
 *   su parte lineal 2x2 — exacta para escalas uniformes, una aproximación
 *   razonable si hubiera escala no uniforme/sesgo, caso no visto en la
 *   práctica) — así el consumidor (`composeIconGeometry.ts`) recibe un
 *   ancho ya en espacio de PÁGINA, comparable entre distintos paths del
 *   mismo ícono sin tener que conocer la CTM él mismo.
 *
 * SEGURIDAD: la salida de este módulo son SIEMPRE listas de comandos de
 * path (números + letras de comando) — nunca se interpreta como HTML, nunca
 * se inserta con `innerHTML`, nunca se guarda markup SVG completo. El único
 * consumidor final de la geometría es `normalizeIconPath` (Etapa 1, sin
 * duplicar su lógica acá) seguido de `new Path(d, {...})` de Fabric.js — la
 * misma ruta segura ya usada por los 6 íconos actuales.
 */
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { computeBoundingBox, type BoundingBox } from '../../src/editor/icons/normalizeIconPath.ts';

/**
 * Paint type real de un `constructPath`, tal cual lo codifica pdf.js en
 * `argsArray[i][0]` — ver el comentario grande del archivo. `'other'` es un
 * cajón defensivo para un código que hoy no debería aparecer nunca (pdf.js
 * no tiene más operadores de pintado que los de esta lista) — si algún día
 * apareciera, se trata como geometría a IGNORAR (nunca se asume que es
 * relleno "por las dudas"), y queda una advertencia para poder investigarlo.
 */
export type PdfPaintType =
  | 'fill' | 'eoFill'
  | 'stroke' | 'closeStroke'
  | 'fillStroke' | 'eoFillStroke'
  | 'closeFillStroke' | 'closeEOFillStroke'
  | 'endPath'
  | 'other';

/** Un `constructPath` es de tipo relleno si su paint type real pinta relleno (con cualquier fill-rule), incluidos los combinados con trazo (`fillStroke`/`eoFillStroke`/variantes con `close`). */
export function isFillPaintType(paintType: PdfPaintType): boolean {
  return paintType === 'fill' || paintType === 'eoFill'
    || paintType === 'fillStroke' || paintType === 'eoFillStroke'
    || paintType === 'closeFillStroke' || paintType === 'closeEOFillStroke';
}

/** Un `constructPath` es de tipo trazo si su paint type real traza (con o sin relleno combinado). */
export function isStrokePaintType(paintType: PdfPaintType): boolean {
  return paintType === 'stroke' || paintType === 'closeStroke'
    || paintType === 'fillStroke' || paintType === 'eoFillStroke'
    || paintType === 'closeFillStroke' || paintType === 'closeEOFillStroke';
}

/** Regla de relleno real de un paint type de tipo relleno — `null` si no aplica (paint type de trazo puro). */
export function fillRuleOfPaintType(paintType: PdfPaintType): 'nonzero' | 'evenodd' | null {
  switch (paintType) {
    case 'fill':
    case 'fillStroke':
    case 'closeFillStroke':
      return 'nonzero';
    case 'eoFill':
    case 'eoFillStroke':
    case 'closeEOFillStroke':
      return 'evenodd';
    default:
      return null;
  }
}

/** Un `constructPath` individual, con su paint type real y su geometría — la unidad que consume `composeIconGeometry.ts` para decidir qué termina en el ícono final. Nunca incluye paths `endPath` (se descartan acá mismo, en la extracción). */
export interface PaintedPathGroup {
  paintType: PdfPaintType;
  /** Uno o más subpaths (`M...Z`) pintados JUNTOS por el mismo operador — así es como un solo `eoFill` puede definir un contorno exterior + un agujero interior en un mismo compound path. */
  subpaths: EmittedCommand[][];
  /** Bounding box combinado de TODOS los subpaths de este grupo. */
  boundingBox: BoundingBox;
  /** Cantidad total de comandos (M/L/C/Q/Z) de este grupo — para comparar tamaño/complejidad contra un posible grupo "gemelo" (ver Caso C de la Etapa 4). */
  commandCount: number;
  /**
   * Ancho de trazo efectivo (ya multiplicado por la escala de la matriz
   * vigente — ver el comentario grande del archivo), en el mismo espacio de
   * página que `boundingBox`. Solo tiene sentido para grupos de trazo
   * (`isStrokePaintType`) — para un grupo puramente de relleno, el valor
   * queda igual (último ancho de trazo vigente en el graphics state en ese
   * punto) pero nunca se usa, porque un relleno no se traza.
   */
  effectiveLineWidth: number;
}

export interface PdfExtractionResult {
  /** Cantidad de páginas del PDF (se espera 1; más de 1 se reporta como advertencia en el clasificador). */
  numPages: number;
  /** Un elemento por cada `constructPath` NO-`endPath` del PDF, en el orden real del stream — nunca geometría de recorte/no pintada. */
  paintGroups: PaintedPathGroup[];
  /** true si el PDF contiene al menos una imagen rasterizada (XObject de imagen, máscara de imagen, o imagen inline). */
  hasRasterImage: boolean;
  /** true si el PDF contiene texto pintado directamente (operadores `showText`/variantes) — texto no convertido a trazos. */
  hasLiveText: boolean;
  /** Mensajes de advertencia recolectados durante la extracción de ESTE archivo (ej. operador no reconocido) — informativos, no necesariamente fatales. */
  warnings: string[];
}

export type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/**
 * Composición de matrices afines 2D (PDF/SVG). `multiply(base, m)` calcula
 * la matriz que aplica `m` PRIMERO y `base` DESPUÉS (es decir, equivale a
 * `m × base` en notación de vector-fila) — NO "aplica `m` después de
 * `base`" como podría sugerir leer los nombres de los parámetros de
 * izquierda a derecha.
 *
 * ⚠️ ETAPA 7B — historia de este contrato, para quien toque este archivo
 * después: se demostró matemáticamente (descomposición 3×3 completa,
 * ver `pdfMatrixComposition.test.ts`) y empíricamente contra
 * `FUTBOL_56.pdf` (real, del cliente) que esta función compone en el
 * orden "`m` primero, `base` después", NO en el orden que su comentario
 * original (Etapa 2/4) decía ("aplica `m` después de `base`"). Los DOS
 * lugares donde se usa (abajo, en este mismo archivo) ya están escritos
 * para respetar el orden REAL de esta función — no se cambió la fórmula
 * interna, para no tener que retocar los dos call sites a la vez (menor
 * superficie de cambio, ver el informe de la Etapa 7C):
 *
 * 1. `matrixStack[top] = multiply(top, nuevoCm)` — acumular `cm`: la
 *    semántica de PDF pide "nuevoCm primero, CTM vieja después", que es
 *    EXACTAMENTE lo que esta función da con esos argumentos en ese orden.
 *    Sin cambios respecto a etapas previas.
 * 2. `multiply(viewportMatrix, CTM)` — combinar la CTM local con el
 *    viewport: acá hace falta "CTM primero, viewport después"; con la
 *    fórmula real de esta función eso se obtiene pasando `viewportMatrix`
 *    como `base` y la CTM como `m` (el orden de argumentos CONTRARIO al
 *    que tenía antes de la Etapa 7C, que pasaba `(CTM, viewportMatrix)` y
 *    por eso producía el resultado invertido/corrupto documentado en la
 *    Etapa 7A/7B).
 *
 * Se exportan `Matrix`/`multiply`/`applyMatrix` para poder testear esta
 * función REAL (no una copia) desde `pdfMatrixComposition.test.ts`.
 */
export function multiply(base: Matrix, m: Matrix): Matrix {
  const [a0, b0, c0, d0, e0, f0] = base;
  const [a1, b1, c1, d1, e1, f1] = m;
  return [
    a1 * a0 + b1 * c0,
    a1 * b0 + b1 * d0,
    c1 * a0 + d1 * c0,
    c1 * b0 + d1 * d0,
    e1 * a0 + f1 * c0 + e0,
    e1 * b0 + f1 * d0 + f0,
  ];
}

export function applyMatrix(m: Matrix, x: number, y: number): { x: number; y: number } {
  const [a, b, c, d, e, f] = m;
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

/** Factor de escala lineal de la parte 2x2 de una matriz afín — raíz cuadrada del valor absoluto de su determinante. Exacto para escalas uniformes (el caso real observado); una aproximación razonable (media geométrica de los dos ejes) si hubiera escala no uniforme. */
function scaleOf(m: Matrix): number {
  const [a, b, c, d] = m;
  return Math.sqrt(Math.abs(a * d - b * c));
}

/** Un punto (posiblemente con control points, ya en espacio final) de un comando de path a emitir. */
export type EmittedCommand =
  | { code: 'M' | 'L'; x: number; y: number }
  | { code: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { code: 'Q'; x1: number; y1: number; x: number; y: number }
  | { code: 'Z' };

const RASTER_OPS = new Set([
  OPS.paintImageXObject,
  OPS.paintInlineImageXObject,
  OPS.paintImageXObjectRepeat,
  OPS.paintImageMaskXObject,
  OPS.paintImageMaskXObjectGroup,
  OPS.paintImageMaskXObjectRepeat,
  OPS.paintInlineImageXObjectGroup,
  OPS.paintSolidColorImageMask,
]);

const TEXT_PAINT_OPS = new Set([OPS.showText, OPS.showSpacedText, OPS.nextLineShowText, OPS.nextLineSetSpacingShowText]);

/** Traduce el código numérico real de pdf.js (`args[0]` de un `constructPath`) al `PdfPaintType` semántico — construido a partir de las constantes `OPS.*` (nunca números mágicos), para no depender de que los valores numéricos se mantengan iguales entre versiones de `pdfjs-dist`. */
const PAINT_TYPE_BY_CODE = new Map<number, PdfPaintType>([
  [OPS.fill, 'fill'],
  [OPS.eoFill, 'eoFill'],
  [OPS.stroke, 'stroke'],
  [OPS.closeStroke, 'closeStroke'],
  [OPS.fillStroke, 'fillStroke'],
  [OPS.eoFillStroke, 'eoFillStroke'],
  [OPS.closeFillStroke, 'closeFillStroke'],
  [OPS.closeEOFillStroke, 'closeEOFillStroke'],
  [OPS.endPath, 'endPath'],
]);

function paintTypeFromCode(code: unknown, warnings: string[]): PdfPaintType {
  if (typeof code === 'number') {
    const known = PAINT_TYPE_BY_CODE.get(code);
    if (known) {
      return known;
    }
  }
  warnings.push(`constructPath con un paint type numérico desconocido (${String(code)}) — tratado como "other" (se ignora, nunca se asume relleno).`);
  return 'other';
}

/**
 * Convierte el `Float32Array` de sub-operaciones de un `constructPath` (ver
 * el comentario grande del archivo) a comandos de path, aplicando la matriz
 * (CTM local acumulada, YA compuesta con la del viewport) a cada punto.
 *
 * Devuelve un ARRAY DE SUBPATHS (no una lista plana): un `constructPath`
 * puede traer varios `M...` independientes en el mismo stream (ej. un
 * ícono con "agujeros"/detalles internos, como ya pasa con "leaf"/"mate"/
 * "sun" en `iconLibrary.ts`) — todos pintados juntos por el MISMO paint
 * type (ver `PaintedPathGroup`), que es justamente cómo un solo `eoFill`
 * resuelve un agujero real: contorno exterior + interior, un solo llamado
 * de pintado.
 */
function drawOpsToSubpaths(drawOps: Float32Array, matrix: Matrix): EmittedCommand[][] {
  const subpaths: EmittedCommand[][] = [];
  let current: EmittedCommand[] = [];

  // Defensivo: un stream de PDF/pdf.js bien formado siempre arranca con
  // `moveTo`, pero si alguna vez no fuera así, este primer subpath vacío
  // se filtra al final (`subpaths.filter`) en vez de perder el primer
  // comando o tirar.
  subpaths.push(current);

  let i = 0;
  while (i < drawOps.length) {
    const op = drawOps[i++];
    switch (op) {
      case 0: { // moveTo — arranca un subpath nuevo
        const p = applyMatrix(matrix, drawOps[i++], drawOps[i++]);
        current = [{ code: 'M', x: p.x, y: p.y }];
        subpaths.push(current);
        break;
      }
      case 1: { // lineTo
        const p = applyMatrix(matrix, drawOps[i++], drawOps[i++]);
        current.push({ code: 'L', x: p.x, y: p.y });
        break;
      }
      case 2: { // curveTo (cúbica)
        const p1 = applyMatrix(matrix, drawOps[i++], drawOps[i++]);
        const p2 = applyMatrix(matrix, drawOps[i++], drawOps[i++]);
        const p = applyMatrix(matrix, drawOps[i++], drawOps[i++]);
        current.push({ code: 'C', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, x: p.x, y: p.y });
        break;
      }
      case 3: { // quadraticCurveTo
        const p1 = applyMatrix(matrix, drawOps[i++], drawOps[i++]);
        const p = applyMatrix(matrix, drawOps[i++], drawOps[i++]);
        current.push({ code: 'Q', x1: p1.x, y1: p1.y, x: p.x, y: p.y });
        break;
      }
      case 4: // closePath
        current.push({ code: 'Z' });
        break;
      default:
        // No debería pasar (PDF/pdf.js no tienen más códigos acá) — se
        // ignora ese único sub-comando y se sigue, en vez de descartar todo
        // el ícono por un dato inesperado.
        break;
    }
  }
  return subpaths.filter((s) => s.length > 0);
}

export function serializeCommands(commands: EmittedCommand[]): string {
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
        case 'Z': return 'Z';
      }
    })
    .join(' ');
}

/** Extrae TODOS los `constructPath` pintados (nunca `endPath`) de la primera página de un PDF, con su paint type real. Nunca tira por contenido del PDF en sí (raster/texto/anomalías quedan como banderas/warnings) — sí puede tirar si el archivo no es un PDF legible en absoluto. */
export async function extractPathFromPdf(pdfBytes: Uint8Array): Promise<PdfExtractionResult> {
  const warnings: string[] = [];
  // `getDocument({ data })` TRANSFIERE (detach, zero-copy) el buffer
  // subyacente del `Uint8Array` que se le pasa — confirmado probándolo
  // (`data.byteLength` pasa a 0 después de la llamada). Se le pasa una
  // COPIA acá — nunca el array del caller — para que esta función sea
  // segura de usar sin que quien la llama tenga que conocer este detalle
  // interno de pdf.js.
  const loadingTask = getDocument({ data: pdfBytes.slice(), isEvalSupported: false, useSystemFonts: false });
  const doc = await loadingTask.promise;
  const numPages = doc.numPages;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const viewportMatrix = viewport.transform as Matrix;
  const viewportScale = scaleOf(viewportMatrix);

  const opList = await page.getOperatorList();

  let hasRasterImage = false;
  let hasLiveText = false;
  const matrixStack: Matrix[] = [IDENTITY];
  const lineWidthStack: number[] = [1]; // 1.0 = ancho de línea por defecto del PDF si nunca se llamó a setLineWidth (spec, no una decisión nuestra)
  const rawPaintGroups: { paintType: PdfPaintType; subpaths: EmittedCommand[][]; effectiveLineWidth: number }[] = [];

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i];

    if (RASTER_OPS.has(fn)) {
      hasRasterImage = true;
    } else if (TEXT_PAINT_OPS.has(fn)) {
      hasLiveText = true;
    }

    switch (fn) {
      case OPS.save: {
        matrixStack.push(matrixStack[matrixStack.length - 1]);
        lineWidthStack.push(lineWidthStack[lineWidthStack.length - 1]);
        break;
      }
      case OPS.restore: {
        if (matrixStack.length > 1) {
          matrixStack.pop();
          lineWidthStack.pop();
        } else {
          warnings.push('restore sin save correspondiente (pila de transformaciones desbalanceada) — se ignoró.');
        }
        break;
      }
      case OPS.transform: {
        const [a, b, c, d, e, f] = args as Matrix;
        const top = matrixStack[matrixStack.length - 1];
        matrixStack[matrixStack.length - 1] = multiply(top, [a, b, c, d, e, f]);
        break;
      }
      case OPS.setLineWidth: {
        const [width] = args as [number];
        lineWidthStack[lineWidthStack.length - 1] = width;
        break;
      }
      case OPS.constructPath: {
        // `args[0]` es el paint type real (ver el comentario grande del
        // archivo) — `args[1]` es `[Float32Array]` (un array de 1 elemento
        // envolviendo el stream real), nunca el Float32Array directo.
        const paintType = paintTypeFromCode((args as unknown[])[0], warnings);
        const wrapped = (args as unknown[])[1] as unknown[] | undefined;
        const stream = wrapped && wrapped[0] instanceof Float32Array ? (wrapped[0] as Float32Array) : null;
        if (!stream) {
          warnings.push(`constructPath sin datos de trazo reconocibles en el operador #${i} — ignorado.`);
          break;
        }
        if (paintType === 'endPath') {
          // Path construido pero nunca pintado (típicamente el recorte de
          // página completa) — se descarta acá mismo, sin heurísticos: el
          // propio dato de pdf.js ya dice que esto no se pinta.
          break;
        }
        // ETAPA 7C: orden de argumentos corregido — ver el comentario grande
        // sobre `multiply()` más arriba. Se necesita "CTM primero, viewport
        // después"; con la fórmula real de `multiply()` (que compone
        // "segundo argumento primero, primero después") eso se logra
        // pasando `viewportMatrix` como `base` y la CTM local como `m`.
        const finalMatrix = multiply(viewportMatrix, matrixStack[matrixStack.length - 1]);
        const subpaths = drawOpsToSubpaths(stream, finalMatrix);
        const effectiveLineWidth = lineWidthStack[lineWidthStack.length - 1] * scaleOf(finalMatrix);
        void viewportScale; // ya incluido en finalMatrix — no hace falta aplicarlo aparte.
        rawPaintGroups.push({ paintType, subpaths, effectiveLineWidth });
        break;
      }
      default:
        break;
    }
  }

  // `computeBoundingBox` tira si un subpath no tiene ningún punto real (ej.
  // un `Z` suelto sin `M` previo — no debería pasar con datos de pdf.js
  // bien formados, pero es un dato externo, no una garantía). Se descarta
  // ESE subpath puntual con un warning en vez de perder la extracción
  // completa del archivo por un fragmento degenerado; si un grupo entero
  // queda sin ningún subpath válido, se descarta el grupo completo.
  const paintGroups: PaintedPathGroup[] = [];
  for (const group of rawPaintGroups) {
    const validSubpaths: EmittedCommand[][] = [];
    let commandCount = 0;
    let boundingBox: BoundingBox | null = null;
    for (const subpath of group.subpaths) {
      try {
        const bbox = computeBoundingBox(subpath);
        validSubpaths.push(subpath);
        commandCount += subpath.length;
        boundingBox = boundingBox
          ? {
            minX: Math.min(boundingBox.minX, bbox.minX),
            minY: Math.min(boundingBox.minY, bbox.minY),
            maxX: Math.max(boundingBox.maxX, bbox.maxX),
            maxY: Math.max(boundingBox.maxY, bbox.maxY),
          }
          : bbox;
      } catch {
        warnings.push('se descartó un subpath sin geometría real (sin puntos M/L/C/Q) — dato degenerado.');
      }
    }
    if (validSubpaths.length > 0 && boundingBox) {
      paintGroups.push({
        paintType: group.paintType,
        subpaths: validSubpaths,
        boundingBox,
        commandCount,
        effectiveLineWidth: group.effectiveLineWidth,
      });
    }
  }

  return {
    numPages,
    paintGroups,
    hasRasterImage,
    hasLiveText,
    warnings,
  };
}
