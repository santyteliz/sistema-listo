/**
 * Extractor de geometría a partir de una imagen raster (PNG/WebP) subida
 * por el usuario — Etapa 9E (cargador público de íconos). Módulo separado
 * de `svgIconExtractor.ts` a propósito (ver el pedido de esta etapa): no
 * comparte ni un solo caso de uso con el extractor de SVG — acá no hay
 * markup que parsear, solo píxeles — así que mezclarlos en un mismo
 * archivo no ahorraría nada y complicaría los dos.
 *
 * FLUJO:
 *
 *   File (png/webp)
 *     → decodeRasterImage      (createImageBitmap + OffscreenCanvas, browser)
 *     → detectRasterBackground (color de fondo por perímetro, PURO — Etapa 9E.1)
 *     → binarizeRasterPixels   (alpha + distancia de color → blanco/negro puro, PURO)
 *     → vectorizeBinaryPixels  (motor WASM ya validado, `vectortracer`, browser)
 *     → vectortracerSvgToIconGeometry (parsear el SVG resultante, PURO)
 *     → SvgIconGeometry
 *
 * Reutiliza la infraestructura YA EXISTENTE en vez de inventar una segunda:
 * `parsePathCommands`/`normalizeIconPath` (`normalizeIconPath.ts`) y
 * `parseTransformAttribute`/`compose`/`applyToPoint` (`svgTransform.ts`) son
 * las MISMAS funciones que ya usa `svgIconExtractor.ts` — acá no hay un
 * segundo parser de `d` ni una segunda fórmula de normalización/bbox/
 * escala/centrado. El resultado (`SvgIconGeometry`) es exactamente el
 * mismo tipo que ya consume `buildUploadedIconAsset` (`uploadIconFlow.ts`)
 * y, de ahí, `createIconObject` (`iconElement.ts`) — sin tocar ninguno de
 * los dos.
 *
 * POR QUÉ NO HACEN FALTA `layers` (a diferencia de un SVG subido con varios
 * colores, Etapa 8E): el binarizador de esta etapa solo conoce dos cosas,
 * tinta y fondo (nunca un tercer tono) — no hay ningún concepto de "papel"
 * de un color propio que revelar. `vectortracer` (motor ya validado en la
 * Etapa 9D/9D.1) representa un agujero como un SEGUNDO subpath dentro del
 * MISMO `<path>`, con bobinado opuesto al del contorno exterior (verificado
 * matemáticamente — shoelace — contra la salida real del motor: exterior
 * CCW, agujero CW) — bajo `fill-rule: nonzero` (el default de SVG, que
 * `vectortracer` nunca declara explícito) eso ya renderiza el agujero
 * correctamente sin necesitar una capa aparte. Y varias regiones de tinta
 * DESCONECTADAS (que `vectortracer` sí devuelve como `<path>` separados)
 * pueden concatenarse tranquilamente en un solo `svgPath`: al no solaparse
 * entre sí, cualquier bobinado que traigan sigue sumando un winding number
 * no nulo en su propio interior bajo `nonzero` — a diferencia del problema
 * real de Boca01/Boca02 (que era mezclar tinta CON papel, dos ROLES
 * distintos, no dos regiones de tinta entre sí).
 */
import {
  normalizeIconPath,
  parsePathCommands,
  type AbsCommand,
} from './normalizeIconPath.ts';
import {
  compose,
  applyToPoint,
  parseTransformAttribute,
  IDENTITY_MATRIX,
  type Matrix,
} from './svgTransform.ts';
import type { SvgIconGeometry } from './svgIconExtractor.ts';
// Import de SOLO TIPO (se borra por completo al compilar) — nunca pasa por
// el pipeline de bundling de Vite en runtime, así que no le aplica el
// problema documentado en `loadVectortracer` (ese es sobre el import()
// dinámico real del código, no sobre tipos).
import type { BinaryImageConverterParams } from 'vectortracer';

// =====================================================================
// Límites de entrada (Paso 6/23 del pedido) — únicos, centralizados acá;
// la validación de EXTENSIÓN/MIME/tamaño de archivo (previa a decodificar)
// vive en `uploadRasterValidation.ts`, que reutiliza el mismo criterio de
// "una sola fuente de verdad" ya establecido por `uploadIconValidation.ts`
// para el flujo de SVG. Estos de acá son límites sobre la imagen YA
// DECODIFICADA (ancho/alto/píxeles), que solo se conocen después de
// `createImageBitmap` — por eso viven en el extractor, no en la validación
// de archivo.
// =====================================================================

/** Ancho/alto máximo (px) de la imagen decodificada — punto de partida deliberadamente conservador (ver el pedido de esta etapa), no una limitación técnica del motor (el PoC de la Etapa 9D.1 vectorizó 2000×2000 en ~227ms sin problemas). */
export const MAX_RASTER_DIMENSION_PX = 2000;
/** Techo de píxeles totales — cubre el caso de una imagen muy angosta pero larguísima (ej. 4000×1100), que ninguno de los dos límites de ancho/alto por separado detectaría. */
export const MAX_RASTER_PIXELS = 4_000_000;

// =====================================================================
// Detección de fondo + binarización (Etapa 9E.1) — PURAS y testeables con
// píxeles sintéticos (sin `createImageBitmap` ni ningún API de navegador).
//
// Etapa 9E usaba un umbral fijo de LUMINANCIA (< 128 → tinta) — funcionaba
// para fondo blanco/diseño negro, pero interpretaba mal un fondo de color
// oscuro con diseño claro (ej. fondo rojo + diseño blanco: el rojo, aunque
// sea claramente "el fondo", tiene luminancia baja, así que terminaba
// clasificado como tinta — resultado invertido). La luminancia por sí sola
// nunca alcanza para esto: hace falta saber CUÁL es el color de fondo real
// antes de poder decidir qué es tinta.
//
// La solución: detectar el fondo mirando el PERÍMETRO de la imagen (un
// diseño/logo centrado casi siempre deja margen alrededor, y ese margen es
// el fondo) y clasificar cada píxel por DISTANCIA DE COLOR a ese fondo
// detectado — nunca por luminancia. Dos funciones con responsabilidad
// separada:
//
//   detectRasterBackground(raw)  → color de fondo (o "es transparente")
//   binarizeRasterPixels(raw)    → usa ese fondo para decidir tinta/fondo
//
// (No hace falta una tercera función de "polaridad" aparte: con
// clasificación por distancia continua no hay una decisión discreta
// "blanco es tinta sí/no" que separar — la distancia YA decide eso píxel a
// píxel, con cualquier color de fondo.)
// =====================================================================

/** Forma mínima de datos de píxel que necesita esta función — deliberadamente NO es el tipo `ImageData` real del DOM (que no existe en Node): mismo criterio de "duck typing" que ya acepta `vectortracer` en runtime (confirmado en la Etapa 9D.1), así que esta función es testeable con un objeto plano en `node --test`. */
export interface RasterPixelData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Umbral de alfa (0–255): un píxel con alfa POR DEBAJO de este valor se
 * considera transparente → fondo, nunca tinta, sin importar su color RGB.
 * `vectortracer` no interpreta el canal alfa en absoluto (confirmado
 * experimentalmente en la Etapa 9D.1: un fondo transparente con RGB negro
 * se funde con una figura negra opaca) — por eso esta decisión es
 * responsabilidad de este módulo, nunca del motor de vectorización.
 */
export const RASTER_ALPHA_THRESHOLD = 16;

/** Ancho (px) de la franja del perímetro que se muestrea para detectar el color de fondo — deliberadamente chica: barata de recorrer (proporcional a ancho+alto, nunca al total de píxeles) y suficiente para un diseño/logo centrado con margen, que es el caso que cubre esta etapa (ver "No sobreingeniería" del pedido). */
export const RASTER_BORDER_SAMPLE_MARGIN_PX = 2;

/** Distancia euclídea en RGB (0–255 por canal) por encima de la cual un píxel se considera "claramente distinto del fondo detectado" → tinta. 60 es un valor inicial conservador y documentado (mismo criterio que `COLOR_GROUP_DISTANCE_THRESHOLD` de `svgColorGrouping.ts`, aunque con un valor bien mayor a propósito: acá el contraste esperado entre diseño y fondo es siempre alto — logos/íconos, no ruido de exportación de un mismo tono) — deja margen para antialiasing en el borde del diseño sin fundir dos colores genuinamente distintos (fondo rojo vs. diseño blanco están a 360 de distancia; negro vs. blanco a 441). Ajustable tras pruebas visuales, ver el pedido de esta etapa. */
export const RASTER_BACKGROUND_COLOR_DISTANCE_THRESHOLD = 60;

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

function colorDistance(a: RgbColor, b: RgbColor): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

/** Visita cada píxel de la franja del perímetro (ancho `marginPx`) de una imagen de `width`×`height`, sin recorrer el resto — costo proporcional a `marginPx × (width + height)`, nunca al total de píxeles (importante para el límite de 4.000.000px, ver el pedido). */
function forEachBorderPixel(width: number, height: number, marginPx: number, visit: (x: number, y: number) => void): void {
  const top = Math.min(marginPx, height);
  const bottom = Math.min(marginPx, height);
  for (let y = 0; y < top; y++) {
    for (let x = 0; x < width; x++) visit(x, y);
  }
  for (let y = Math.max(top, height - bottom); y < height; y++) {
    for (let x = 0; x < width; x++) visit(x, y);
  }
  const left = Math.min(marginPx, width);
  const right = Math.min(marginPx, width);
  for (let y = top; y < height - bottom; y++) {
    for (let x = 0; x < left; x++) visit(x, y);
    for (let x = Math.max(left, width - right); x < width; x++) visit(x, y);
  }
}

/** Resultado de `detectRasterBackground`: o bien un color de fondo detectado (promedio de los píxeles opacos del perímetro), o bien "el perímetro no tenía ningún píxel opaco" — caso de una imagen con margen transparente, donde la transparencia YA identifica el fondo sin necesitar ningún color de referencia. */
export type RasterBackgroundInfo =
  | { isTransparent: true; color: null }
  | { isTransparent: false; color: RgbColor };

/**
 * Detecta el color de fondo de una imagen muestreando el perímetro
 * (`RASTER_BORDER_SAMPLE_MARGIN_PX` de ancho), ignorando píxeles
 * transparentes (`alpha < alphaThreshold`) — el mismo criterio de alfa que
 * ya usaba la binarización de la Etapa 9E, sin cambios. Determinístico y
 * barato: nunca recorre más que la franja del borde.
 */
export function detectRasterBackground(
  raw: RasterPixelData,
  options?: { marginPx?: number; alphaThreshold?: number },
): RasterBackgroundInfo {
  const marginPx = options?.marginPx ?? RASTER_BORDER_SAMPLE_MARGIN_PX;
  const alphaThreshold = options?.alphaThreshold ?? RASTER_ALPHA_THRESHOLD;
  const source = raw.data;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;
  forEachBorderPixel(raw.width, raw.height, marginPx, (x, y) => {
    const i = (y * raw.width + x) * 4;
    if (source[i + 3] < alphaThreshold) return;
    sumR += source[i];
    sumG += source[i + 1];
    sumB += source[i + 2];
    count++;
  });
  if (count === 0) {
    return { isTransparent: true, color: null };
  }
  return { isTransparent: false, color: { r: sumR / count, g: sumG / count, b: sumB / count } };
}

/**
 * Convierte cualquier imagen (con transparencia, en color, en escala de
 * grises) a una imagen estrictamente blanco/negro: cada píxel se decide
 * como tinta (negro opaco) o fondo (blanco opaco), nunca un tono
 * intermedio. Detecta el fondo automáticamente (`detectRasterBackground`,
 * salvo que se le pase uno ya calculado vía `options.background`) y
 * clasifica cada píxel por distancia de color a ese fondo — nunca por
 * luminancia (ver el comentario grande de esta sección: por qué la
 * luminancia sola no alcanza). Determinística — la misma entrada produce
 * siempre la misma salida — y no toca ningún API de navegador, así que es
 * testeable con `node --test` pasando un `RasterPixelData` construido a
 * mano.
 */
export function binarizeRasterPixels(
  raw: RasterPixelData,
  options?: {
    alphaThreshold?: number;
    backgroundColorDistanceThreshold?: number;
    marginPx?: number;
    /** Fondo ya detectado — evita recalcularlo si el caller ya lo tiene (ej. para inspeccionarlo antes de binarizar). Si no se pasa, se detecta acá mismo. */
    background?: RasterBackgroundInfo;
  },
): RasterPixelData {
  const alphaThreshold = options?.alphaThreshold ?? RASTER_ALPHA_THRESHOLD;
  const colorDistanceThreshold = options?.backgroundColorDistanceThreshold ?? RASTER_BACKGROUND_COLOR_DISTANCE_THRESHOLD;
  const background = options?.background
    ?? detectRasterBackground(raw, { marginPx: options?.marginPx, alphaThreshold });

  const source = raw.data;
  const data = new Uint8ClampedArray(source.length);
  for (let i = 0; i < source.length; i += 4) {
    const alpha = source[i + 3];
    let isInk: boolean;
    if (alpha < alphaThreshold) {
      isInk = false;
    } else if (background.isTransparent) {
      // El perímetro no tenía ningún píxel opaco de referencia — el único
      // criterio disponible es la transparencia misma: cualquier píxel
      // opaco es, por eliminación, diseño (mismo comportamiento que ya
      // tenía la Etapa 9E para este caso — "transparente + negro" sigue
      // funcionando exactamente igual).
      isInk = true;
    } else {
      const distance = colorDistance({ r: source[i], g: source[i + 1], b: source[i + 2] }, background.color);
      isInk = distance > colorDistanceThreshold;
    }
    const value = isInk ? 0 : 255;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }
  return { data, width: raw.width, height: raw.height };
}

// =====================================================================
// Decodificación (Paso 5) — único tramo que necesita APIs de navegador
// reales (`createImageBitmap`/`OffscreenCanvas`); no es testeable con
// `node --test` (ver `docs`/informe de esta etapa) — se verifica a mano en
// Chrome, mismo criterio ya documentado en `svgIconExtractor.ts` para la
// parte que usa `DOMParser`.
// =====================================================================

/** Valida el ancho/alto YA DECODIFICADO contra los límites de esta etapa — separado de `decodeRasterImage` para poder testearlo con números sueltos, sin decodificar nada de verdad. */
export function checkRasterDimensionLimits(width: number, height: number): { ok: true } | { ok: false; message: string } {
  if (width > MAX_RASTER_DIMENSION_PX || height > MAX_RASTER_DIMENSION_PX) {
    return { ok: false, message: `La imagen es demasiado grande (máximo ${MAX_RASTER_DIMENSION_PX}×${MAX_RASTER_DIMENSION_PX} píxeles).` };
  }
  if (width * height > MAX_RASTER_PIXELS) {
    return { ok: false, message: 'La imagen tiene demasiados píxeles.' };
  }
  return { ok: true };
}

/**
 * `File` → `ImageBitmap` → `OffscreenCanvas` → `ImageData`. `imageOrientation:
 * 'from-image'` respeta la orientación EXIF declarada por el propio archivo
 * (en vez de ignorarla, el otro comportamiento posible de
 * `createImageBitmap`) — importante para fotos reales que puedan traer esa
 * metadata. Rechaza ANTES de tocar `vectortracer` si la imagen decodificada
 * supera los límites de esta etapa (`checkRasterDimensionLimits`) — nunca
 * reescala en silencio (pedido explícito: "no asumir, observar el
 * comportamiento real primero").
 */
export async function decodeRasterImage(file: File): Promise<RasterPixelData> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('No pudimos leer esta imagen.');
  }
  try {
    const dimensionCheck = checkRasterDimensionLimits(bitmap.width, bitmap.height);
    if (!dimensionCheck.ok) {
      throw new Error(dimensionCheck.message);
    }
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('No pudimos procesar esta imagen.');
    }
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return { data: imageData.data, width: imageData.width, height: imageData.height };
  } finally {
    bitmap.close();
  }
}

// =====================================================================
// Vectorización (Paso 10) — usa `vectortracer@0.1.2`, ya instalado y
// validado (Etapa 9D/9D.1). NINGUNA dependencia nueva.
// =====================================================================

/**
 * Import RELATIVO al archivo real del paquete (no el specifier "pelado"
 * `'vectortracer'`) — a propósito, ver la investigación completa de la
 * Etapa 9D.1: importar el specifier pelado hace que Vite lo pase por su
 * pipeline de pre-bundling de dependencias en modo dev (esbuild), que
 * INLINEA una copia del glue code del paquete (`vectortracer_bg.js`) separada
 * de la que el helper de Vite para el `.wasm` usa como import object real de
 * `WebAssembly.instantiate` — esa segunda copia nunca recibe la
 * inicialización (`__wbg_set_wasm`), así que cualquier callback que
 * necesite memoria WASM revienta con "Cannot read properties of undefined
 * (reading 'memory')". Importar el archivo real por ruta relativa evita ese
 * pipeline (Vite lo sirve tal cual) y las dos partes terminan resolviendo a
 * la MISMA instancia de módulo — confirmado funcionando en Chrome real (ver
 * `scratchpad/vectortracer-poc/smoke.ts`). No es un hack ni un workaround
 * fuera de este archivo: no toca `vite.config.ts`, no toca `node_modules`,
 * no agrega dependencias — es, literal y únicamente, una forma distinta de
 * escribir el mismo import.
 *
 * IMPORTANTE — el path va como STRING LITERAL directo dentro de `import()`,
 * nunca a través de una constante con nombre: Rollup (`vite build`) solo
 * puede detectar y empaquetar un `import()` dinámico como punto de
 * code-splitting real (generando el chunk del `.wasm` como asset aparte)
 * cuando el argumento es un literal analizable estáticamente en el lugar
 * de la llamada — con una constante intermedia, Rollup lo deja pasar tal
 * cual (sin generar ningún asset ni reescribir la ruta), y en el build de
 * producción real terminaría siendo una ruta relativa a `node_modules`
 * rota en el navegador. Confirmado con un build real: con la constante
 * intermedia, `dist/` no contenía ningún `.wasm`; con el literal inline,
 * sí (ver el informe de esta etapa).
 */
type VectortracerModule = typeof import('vectortracer');

let vectortracerModulePromise: Promise<VectortracerModule> | null = null;

/** Memoiza el import dinámico — varias subidas en la misma sesión no vuelven a disparar la carga/instanciación del WASM. */
function loadVectortracer(): Promise<VectortracerModule> {
  if (!vectortracerModulePromise) {
    vectortracerModulePromise = import('../../../node_modules/vectortracer/pkg/vectortracer.js');
  }
  return vectortracerModulePromise;
}

/**
 * `mode: 'spline'` (curvas, no poligonal) para un resultado visualmente más
 * suave — el resto de los campos quedan en su valor por defecto del motor;
 * `debug`/`invert`/`pathFill`/`backgroundColor`/`attributes` están
 * presentes-pero-`undefined` porque el `.d.ts` del paquete los tipa como
 * `T | undefined` SIN `?` (particularidad del codegen de wasm-bindgen para
 * `Option<T>` de Rust, ver la Etapa 9D.1) — TypeScript exige la clave
 * igual, aunque en runtime tolera que falte.
 */
const VECTORTRACER_PARAMS: BinaryImageConverterParams = { debug: undefined, mode: 'spline' as const };
const VECTORTRACER_OPTIONS = { invert: undefined, pathFill: undefined, backgroundColor: undefined, attributes: undefined };

/**
 * Corre la conversión completa (`init()` → loop de `tick()`/`progress()` →
 * `getResult()` → `free()`) — mismo patrón documentado en el README real del
 * paquete y ya verificado funcionando en Chrome (Etapa 9D/9D.1,
 * `scratchpad/vectortracer-poc/convert.mjs`). `setTimeout(fn, 0)` en vez de
 * `setImmediate` (que no existe en navegadores) para no bloquear el hilo
 * principal en cada paso del loop.
 *
 * Exportada desde la Etapa 11 para que `textOutlineExport.ts`
 * (`src/editor/export/`) pueda reusar el MISMO motor/instancia memoizada
 * de `vectortracer` para vectorizar texto renderizado a raster — nunca una
 * segunda carga/instanciación del WASM (ver `loadVectortracer`, memoizada
 * a nivel de módulo acá arriba) ni una copia de esta función.
 *
 * `paramsOverride` (Etapa 12C) — aditivo, opcional: sin él, el comportamiento
 * es EXACTAMENTE el de siempre (`VECTORTRACER_PARAMS`, lo que sigue usando
 * cada ícono). Se agrega para poder investigar/comparar distintos parámetros
 * de VTracer específicamente para el pipeline de texto
 * (`textOutlineExport.ts`) sin duplicar la carga/instanciación del WASM ni
 * cambiar el comportamiento de los íconos.
 */
export async function vectorizeBinaryPixels(raw: RasterPixelData, paramsOverride?: Partial<BinaryImageConverterParams>): Promise<string> {
  const mod = await loadVectortracer();
  const params = paramsOverride ? { ...VECTORTRACER_PARAMS, ...paramsOverride } : VECTORTRACER_PARAMS;
  // El constructor está tipado para pedir un `ImageData` real del DOM, pero
  // en runtime solo lee `.data`/`.width`/`.height` (duck typing, confirmado
  // en la Etapa 9D.1) — `raw` ya tiene exactamente esa forma.
  const converter = new mod.BinaryImageConverter(
    raw as unknown as ImageData,
    params,
    VECTORTRACER_OPTIONS,
  );
  return new Promise<string>((resolve, reject) => {
    const tick = () => {
      let done: boolean;
      try {
        done = converter.tick();
      } catch (err) {
        reject(err);
        return;
      }
      if (!done) {
        setTimeout(tick, 0);
        return;
      }
      const result = converter.getResult();
      converter.free();
      resolve(result);
    };
    converter.init();
    setTimeout(tick, 0);
  });
}

// =====================================================================
// SVG resultante → SvgIconGeometry (Paso 11/12/13/14/15) — PURO y
// testeable con un string de SVG (real o fabricado a mano), sin
// `DOMParser` ni ningún API de navegador: `vectortracer` genera siempre la
// MISMA estructura fija y simple (`<svg><g transform><path d
// transform?/></g></svg>`), muy distinta de un SVG arbitrario subido por
// un usuario (el caso que sí justifica el parser completo de
// `svgIconExtractor.ts`, con sus chequeos de seguridad/herencia/`<use>`) —
// por eso acá alcanza con una extracción liviana por expresiones
// regulares, en vez de reusar ese parser completo (que además no aplica:
// esto nunca es contenido subido directamente por un usuario, es la salida
// de NUESTRO propio motor de vectorización).
// =====================================================================

/** Aplica una matriz afín a una lista de comandos absolutos — igual que la función homónima (no exportada) de `svgIconExtractor.ts`; se reimplementa acá en vez de tocar ese archivo (protegido en esta etapa). `vectortracer` (`mode: 'spline'`/`'polygon'`) solo emite M/L/C/Z — un `A` inesperado se deja pasar sin escalar sus radios (nunca debería ocurrir en la práctica; ver `vectortracerSvgToIconGeometry`, que de todos modos nunca los usa). */
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

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Re-serializa a un `d` de SVG — mismo formato que ya usa el resto del proyecto (`normalizeIconPath.ts`/`svgIconExtractor.ts`). */
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
 * Parsea el SVG que devuelve `vectortracer` y produce una `SvgIconGeometry`
 * lista para `buildUploadedIconAsset`. Combina TODOS los `<path>` del
 * resultado (uno solo si la tinta es una única región; varios si hay
 * regiones desconectadas, ver el comentario grande del archivo) en un único
 * `svgPath`, y delega el centrado/escalado/bbox 100% a `normalizeIconPath`
 * (existente, sin cambios) — nunca inventa una segunda normalización.
 *
 * Nunca usa `DOMParser`/`innerHTML`: el string de entrada se trata siempre
 * como datos (expresiones regulares contra un formato fijo conocido +
 * `parsePathCommands`, que tokeniza comandos de path, nunca markup) — mismo
 * principio de seguridad que el resto del proyecto (ver la nota grande en
 * `normalizeIconPath.ts`), aunque acá el "riesgo" ni siquiera aplica (el
 * SVG de entrada lo generamos nosotros mismos, vectorizando la imagen del
 * usuario — nunca es markup que el usuario haya escrito a mano).
 */
export function vectortracerSvgToIconGeometry(svgText: string): SvgIconGeometry {
  const groupTransformAttr = /<g\b[^>]*\btransform="([^"]*)"/.exec(svgText)?.[1] ?? null;
  const groupMatrix = groupTransformAttr ? parseTransformAttribute(groupTransformAttr) : IDENTITY_MATRIX;

  const pathTagPattern = /<path\b[^>]*\/>/g;
  const allCommands: AbsCommand[] = [];
  let match: RegExpExecArray | null;
  let pathCount = 0;

  while ((match = pathTagPattern.exec(svgText)) !== null) {
    const tag = match[0];
    const dMatch = /\bd="([^"]*)"/.exec(tag);
    if (!dMatch || dMatch[1].trim() === '') {
      continue;
    }
    const transformAttr = /\btransform="([^"]*)"/.exec(tag)?.[1] ?? null;
    const ownMatrix = transformAttr ? parseTransformAttribute(transformAttr) : IDENTITY_MATRIX;
    const worldMatrix = compose(ownMatrix, groupMatrix);
    const localCommands = parsePathCommands(dMatch[1]);
    allCommands.push(...transformAbsCommands(worldMatrix, localCommands));
    pathCount++;
  }

  if (pathCount === 0) {
    throw new Error('No pudimos generar un ícono a partir de esta imagen.');
  }

  const normalized = normalizeIconPath(serializeAbsCommands(allCommands));

  return {
    svgPath: normalized.d,
    paintMode: 'fill',
    fillRule: 'nonzero',
  };
}

// =====================================================================
// Punto de entrada (Paso 4) — orquesta las cuatro etapas de arriba.
// =====================================================================

export type RasterExtractionResult =
  | { ok: true; geometry: SvgIconGeometry }
  | { ok: false; message: string };

/**
 * `File` (PNG/WebP) → `SvgIconGeometry`. Único punto de entrada real de
 * este módulo — nunca lanza (siempre devuelve un resultado con `ok`), mismo
 * contrato que `extractIconFromSvg` (`svgIconExtractor.ts`), para que
 * `IconLibraryDrawer.tsx` pueda tratar los dos extractores de forma
 * intercambiable (`ok`/`message` ya amigable para el usuario final, nunca
 * un error técnico).
 */
export async function extractRasterIcon(file: File): Promise<RasterExtractionResult> {
  let raw: RasterPixelData;
  try {
    raw = await decodeRasterImage(file);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'No pudimos leer esta imagen.' };
  }

  const binary = binarizeRasterPixels(raw);

  let svgText: string;
  try {
    svgText = await vectorizeBinaryPixels(binary);
  } catch {
    return { ok: false, message: 'No pudimos procesar esta imagen.' };
  }

  try {
    const geometry = vectortracerSvgToIconGeometry(svgText);
    return { ok: true, geometry };
  } catch {
    return { ok: false, message: 'No pudimos generar un ícono a partir de esta imagen.' };
  }
}
