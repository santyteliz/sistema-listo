/**
 * Convierte un texto curvo real del canvas a OUTLINES vectoriales
 * independientes de la fuente — Etapa 11 (ver el informe: Opción C,
 * reutilizar `vectortracer`, cero dependencias nuevas).
 *
 * ESTRATEGIA (por qué NO se reimplementa el posicionamiento de cada glifo
 * a mano): en vez de extraer el contorno de cada letra por separado y
 * volver a calcular su posición sobre el arco (lo que arriesgaría no
 * coincidir exactamente con `charSpacing`/kerning/`pathAlign`/`pathSide`
 * reales de Fabric — una segunda implementación de esa matemática, con
 * riesgo real de divergencia sutil), este módulo renderiza el texto YA
 * CURVADO — el objeto `IText` completo, con su `path`/transform reales —
 * a un `<canvas>` oculto en alta resolución (`textObj.render(ctx)`, el
 * mismo método que usa Fabric internamente para dibujarlo en pantalla), y
 * vectoriza ESE resultado con el motor ya validado (`vectortracer`, Etapa
 * 9D-9F). Así se hereda gratis, sin reimplementar nada, exactamente la
 * misma geometría que el usuario ya ve y aprobó en el editor.
 *
 * Reutiliza (nunca duplica) las piezas más riesgosas ya existentes:
 * `binarizeRasterPixels`/`vectorizeBinaryPixels` de `rasterIconExtractor.ts`
 * (la carga/instanciación memoizada del WASM, y la detección de fondo por
 * distancia de color) — la única lógica nueva acá es el render a canvas y
 * el parseo del SVG resultante de vuelta a coordenadas absolutas del
 * canvas real (sin normalizar a 0-100 — a diferencia de un ícono, un
 * texto exportado debe conservar su tamaño/posición REALES, nunca
 * reescalarse a un viewBox de referencia).
 *
 * BROWSER-ONLY: `textObj.render(ctx)` necesita un contexto 2D real
 * (mide/dibuja texto) — no es testeable con `node --test` (mismo límite ya
 * documentado para `decodeRasterImage`, `rasterIconExtractor.ts`). Se
 * verifica a mano en Chrome (ver el informe de esta etapa).
 */
import type { IText } from 'fabric';
import { parsePathCommands, type AbsCommand } from '../icons/normalizeIconPath';
import { compose, applyToPoint, parseTransformAttribute, IDENTITY_MATRIX, type Matrix } from '../icons/svgTransform';
import { binarizeRasterPixels, vectorizeBinaryPixels, type RasterPixelData } from '../icons/rasterIconExtractor';
import { GLYPH_HEIGHT_RATIO } from '../canvas/curvedText';
import { DESIGN_INK_COLOR } from '../canvas/designColors';

/**
 * Factor de sobre-muestreo del render intermedio — un texto de, por ejemplo,
 * 24px de alto en el canvas real se renderiza a 24×8=192px antes de
 * vectorizar, para darle a `vectortracer` resolución suficiente para curvas
 * suaves (mismo criterio de "más resolución = mejor trazo" ya confirmado
 * empíricamente para íconos, Etapa 9F) — importa más acá que para un ícono
 * subido: una tipografía de guión (Sacramento, Alex Brush) tiene trazos
 * finos que a baja resolución podrían perderse o deformarse. Ajustable si
 * las pruebas visuales muestran que hace falta más (o alcanza con menos).
 */
export const TEXT_RENDER_SUPERSAMPLE = 8;

/**
 * Techo defensivo del canvas de render intermedio (px) — evita un canvas
 * absurdamente grande con un texto excepcionalmente largo/grande; si `bbox ×
 * supersample` lo superaría, se reduce el supersample en vez de rechazar el
 * texto.
 *
 * Etapa 12C — INVESTIGACIÓN DE FIDELIDAD: el valor original (3000) estaba
 * recortando el supersample EFECTIVO de CUALQUIER texto curvo en la
 * posición por defecto a 6× en vez del 8× nominal (medido: el bounding box
 * con margen de un texto curvo típico ronda 420-500px — con `×8` eso ya
 * supera 3000, así que el cap se activaba SIEMPRE, no solo en casos
 * extremos). Subido a 4500 (margen sobre los ~500px máximos medidos ×8,
 * ~4000) para que el 8× nominal se cumpla de verdad en el caso normal — la
 * medición (`scratchpad/text-fidelity-poc/`) mostró que esto por sí solo
 * aporta una mejora real pero MENOR frente al umbral de binarización (ver
 * `TEXT_INK_COLOR_DISTANCE_THRESHOLD`); igual se mantiene como techo real
 * (no infinito) para seguir protegiendo contra un canvas absurdo.
 */
export const MAX_TEXT_RENDER_DIMENSION_PX = 4500;

/**
 * Umbral de distancia de color usado SOLO para vectorizar texto (nunca
 * cambia `RASTER_BACKGROUND_COLOR_DISTANCE_THRESHOLD`, el que usa
 * `rasterIconExtractor.ts` por defecto para íconos PNG/WebP subidos — ese
 * queda intacto) — Etapa 12C.
 *
 * CAUSA RAÍZ del "texto más grueso" reportado: el umbral por defecto (60)
 * clasifica como tinta cualquier píxel a más de ~16% de cobertura de tinta
 * (fue elegido para íconos subidos, donde conviene un margen generoso de
 * antialiasing) — eso corre el borde binarizado bien hacia el lado del
 * fondo del degradado de antialiasing, agrandando sistemáticamente cada
 * letra. Este umbral corresponde en cambio a ~50% de cobertura — la
 * convención estándar del "borde real" de una forma antialiaseada.
 *
 * MEDIDO (`scratchpad/text-fidelity-poc/`, comparando el render real de
 * Fabric contra el resultado vectorizado con una métrica de cobertura de
 * tinta, no solo "a ojo"): en las 9 tipografías probadas, este umbral baja
 * el engrosamiento neto de +18%/+86% a entre -3%/+8% (prácticamente
 * neutro), y el error total (grosor+faltante combinados) de 20-94% a
 * 13-57% — mejora grande y consistente. Quedó documentado un caso límite
 * sin resolver del todo (tipografía de guión MUY fina en el tamaño mínimo,
 * 16px): ahí este umbral cambia el problema de "engrosado" a "con huecos",
 * pero el error total medido sigue siendo MENOR que con el umbral anterior
 * (94% vs 208%) — ver el informe de la Etapa 12C.
 */
export const TEXT_INK_COLOR_DISTANCE_THRESHOLD = colorDistanceForCoverage(0.5);

/** Distancia de color (blanco → `DESIGN_INK_COLOR`) que corresponde a una fracción de cobertura de tinta dada (0=blanco puro, 1=tinta pura) — asume una mezcla lineal tinta/fondo, la misma aproximación que ya usa `binarizeRasterPixels` para clasificar píxeles por distancia de color. */
function colorDistanceForCoverage(coverageFraction: number): number {
  const hex = DESIGN_INK_COLOR.replace('#', '');
  const n = parseInt(hex, 16);
  const ink = { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  const white = { r: 255, g: 255, b: 255 };
  const inkWhiteDistance = Math.hypot(white.r - ink.r, white.g - ink.g, white.b - ink.b);
  return inkWhiteDistance * coverageFraction;
}

export interface TextOutlineShape {
  d: string;
  fillRule: 'nonzero';
}

/**
 * Margen (px) que hay que sumar alrededor de `textObj.getBoundingRect()` en
 * cada dirección antes de renderizar un texto para vectorizarlo — ver el
 * comentario grande en `extractTextOutlineShapes` (bug del "corte
 * horizontal", Etapa 11). Exportada como función pura aparte (en vez de
 * quedar inline) para poder testear su invariante SIN necesitar un
 * `document` real: tiene que ser siempre mayor que `fontSize *
 * GLYPH_HEIGHT_RATIO`, el alcance máximo teórico del cuerpo de una letra
 * más allá del trazo del arco (mismo criterio que ya usa
 * `getTextRadialRange` en `curvedText.ts`) — si en el futuro este margen se
 * reduce sin querer por debajo de ese límite, vuelve el corte.
 */
export function computeTextRenderPadding(fontSize: number): number {
  return fontSize * GLYPH_HEIGHT_RATIO * 1.3;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Igual que la función homónima (privada) de `rasterIconExtractor.ts` — se reimplementa acá en vez de exportarla desde ahí, mismo criterio ya documentado en ese archivo para no acoplar dos módulos por una utilidad chica de ~10 líneas. */
function transformAbsCommands(matrix: Matrix, commands: AbsCommand[]): AbsCommand[] {
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
      case 'A': {
        const p = applyToPoint(matrix, cmd.x, cmd.y);
        return { ...cmd, x: p.x, y: p.y };
      }
      case 'Z':
        return cmd;
    }
  });
}

function serializeAbsCommands(commands: AbsCommand[]): string {
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

/**
 * Parsea el SVG de `vectortracer` y lo convierte a shapes ya en el espacio
 * de coordenadas que indique `backToCanvasMatrix` (a diferencia de
 * `vectortracerSvgToIconGeometry` en `rasterIconExtractor.ts`, ESTE parser
 * nunca normaliza a un viewBox 0-100 — un texto exportado debe conservar
 * su tamaño/posición reales). Combina todos los `<path>` (regiones de
 * tinta desconectadas, ej. la "i"/"j" con su punto separado, o varias
 * letras que no se tocan) en un único `d`, igual que ya se decidió para
 * íconos (Etapa 9E.1): no hay riesgo de que se cancelen entre sí bajo
 * `nonzero`, nunca se mezclan roles distintos acá (todo es la MISMA tinta).
 */
export function parseVectortracerSvgToAbsoluteShapes(svgText: string, backToCanvasMatrix: Matrix): TextOutlineShape[] {
  const groupTransformAttr = /<g\b[^>]*\btransform="([^"]*)"/.exec(svgText)?.[1] ?? null;
  const groupMatrix = groupTransformAttr ? parseTransformAttribute(groupTransformAttr) : IDENTITY_MATRIX;

  const pathTagPattern = /<path\b[^>]*\/>/g;
  const allCommands: AbsCommand[] = [];
  let match: RegExpExecArray | null;
  let pathCount = 0;

  while ((match = pathTagPattern.exec(svgText)) !== null) {
    const tag = match[0];
    const dMatch = /\bd="([^"]*)"/.exec(tag);
    if (!dMatch || dMatch[1].trim() === '') continue;
    const transformAttr = /\btransform="([^"]*)"/.exec(tag)?.[1] ?? null;
    const ownMatrix = transformAttr ? parseTransformAttribute(transformAttr) : IDENTITY_MATRIX;
    const rasterSpaceMatrix = compose(ownMatrix, groupMatrix);
    const finalMatrix = compose(rasterSpaceMatrix, backToCanvasMatrix);
    const localCommands = parsePathCommands(dMatch[1]);
    allCommands.push(...transformAbsCommands(finalMatrix, localCommands));
    pathCount++;
  }

  if (pathCount === 0) return [];
  return [{ d: serializeAbsCommands(allCommands), fillRule: 'nonzero' }];
}

/**
 * Punto de entrada. `null` si no se pudo generar el outline (texto vacío,
 * bounding box degenerado, o el motor de vectorización falló) — el caller
 * (`designExporter.ts`) decide el fallback en ese caso, nunca este módulo.
 */
export async function extractTextOutlineShapes(textObj: IText): Promise<TextOutlineShape[] | null> {
  // Sin `document` (ej. corriendo en Node/tsx, como los tests de este
  // proyecto) directamente no hay forma de renderizar/medir texto — se
  // cae al fallback como cualquier otro caso en el que no se puede generar
  // el outline, en vez de tirar. En un navegador real esto nunca ocurre.
  if (typeof document === 'undefined') return null;

  const bbox = textObj.getBoundingRect();
  if (!bbox || bbox.width <= 0 || bbox.height <= 0) return null;

  // Margen de seguridad alrededor de `getBoundingRect()` — necesario porque,
  // para un texto SOBRE UN PATH (curvo), `getBoundingRect()` NO representa
  // el contorno real de la tinta: en cuanto un `IText` tiene `path` asignado,
  // Fabric.js deja `width`/`height` iguales a los del PATH completo (la
  // geometría del arco, ver el comentario "no usar textObj.width acá" en
  // `curvedText.ts`), nunca al tamaño real del texto dibujado. Con
  // `pathAlign: 'center'`, el cuerpo de cada letra queda centrado sobre el
  // trazo del arco (mitad hacia afuera, mitad hacia adentro, hasta
  // `fontSize * GLYPH_HEIGHT_RATIO` px hacia cada lado — mismo criterio que
  // `getTextRadialRange`) — y cuando el texto cae sobre uno de los 4 puntos
  // cardinales del círculo (ej. el offset por defecto, arriba de todo), ese
  // punto coincide EXACTO con el borde del bounding box del arco: sin este
  // margen, la mitad del cuerpo de la letra que crece hacia afuera del arco
  // queda fuera del canvas de render y se recorta (el "corte horizontal"
  // detectado en la inspección visual de la Etapa 11 — consistente en
  // cualquier tipografía porque es un problema de geometría/encuadre, no de
  // fuente). Para texto SIN path (recto), este margen no hace ninguna falta
  // (`getBoundingRect()` ya es ajustado) pero tampoco molesta: solo agrega
  // canvas en blanco alrededor, sin afectar el resultado.
  const boundingBoxPadding = computeTextRenderPadding(textObj.fontSize);
  const paddedBbox = {
    left: bbox.left - boundingBoxPadding,
    top: bbox.top - boundingBoxPadding,
    width: bbox.width + boundingBoxPadding * 2,
    height: bbox.height + boundingBoxPadding * 2,
  };

  let supersample = TEXT_RENDER_SUPERSAMPLE;
  const largestDimensionAtFullSupersample = Math.max(paddedBbox.width, paddedBbox.height) * supersample;
  if (largestDimensionAtFullSupersample > MAX_TEXT_RENDER_DIMENSION_PX) {
    supersample = Math.max(1, Math.floor(MAX_TEXT_RENDER_DIMENSION_PX / Math.max(paddedBbox.width, paddedBbox.height)));
  }

  const renderWidth = Math.ceil(paddedBbox.width * supersample);
  const renderHeight = Math.ceil(paddedBbox.height * supersample);
  if (renderWidth <= 0 || renderHeight <= 0) return null;

  // `document.createElement('canvas')` a propósito (no `OffscreenCanvas`):
  // Fabric.js está pensado/probado contra un `<canvas>` real del DOM — usar
  // `OffscreenCanvas` acá introduciría una variable más sin poder
  // verificarla yo mismo en este entorno (ver el informe de esta etapa).
  // El canvas nunca se agrega al DOM visible — vive solo en memoria.
  const canvasEl = document.createElement('canvas');
  canvasEl.width = renderWidth;
  canvasEl.height = renderHeight;
  const ctx = canvasEl.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, renderWidth, renderHeight);
  ctx.scale(supersample, supersample);
  ctx.translate(-paddedBbox.left, -paddedBbox.top);
  // Renderiza el objeto CON su transform/curva reales — el mismo método
  // que usa Fabric.js internamente para dibujarlo en el canvas principal
  // (no una segunda implementación del texto-sobre-arco).
  textObj.render(ctx);

  const imageData = ctx.getImageData(0, 0, renderWidth, renderHeight);
  const raw: RasterPixelData = { data: imageData.data, width: renderWidth, height: renderHeight };
  const binary = binarizeRasterPixels(raw, { backgroundColorDistanceThreshold: TEXT_INK_COLOR_DISTANCE_THRESHOLD });

  let svgText: string;
  try {
    svgText = await vectorizeBinaryPixels(binary);
  } catch {
    return null;
  }

  // De vuelta del espacio "píxeles del render sobre-muestreado" al espacio
  // absoluto del canvas real: dividir por `supersample` y sumar el origen
  // del bounding box (el inverso exacto de `scale(supersample)` +
  // `translate(-bbox.left,-bbox.top)` de arriba).
  const backToCanvasMatrix: Matrix = [1 / supersample, 0, 0, 1 / supersample, paddedBbox.left, paddedBbox.top];

  const shapes = parseVectortracerSvgToAbsoluteShapes(svgText, backToCanvasMatrix);
  return shapes.length > 0 ? shapes : null;
}
