import type { FabricObject } from 'fabric';
import type { VirolaConfig } from '../../config/virola.config';

/**
 * Contención geométrica de íconos dentro de la banda real de la virola
 * (entre `innerRadius` y `outerRadius`, ver `virola.config.ts`).
 *
 * El texto curvo NO necesita este módulo: por diseño, su pivote (`left`/
 * `top`) sigue siempre siendo el centro exacto de la virola (ver
 * `curvedText.ts` / `createCurvedText`) — moverse alrededor del anillo se
 * hace rotando ese pivote fijo (`.angle`, vía `curveOffset`), y una rotación
 * alrededor del centro de la virola no cambia la distancia de ningún punto
 * de la curva a ese centro. Como el auto-fit de Etapa 3 ya garantiza que,
 * sin rotar, el texto entra en la banda (ancho real vía `calcTextWidth()`,
 * altura vía `maxTextGlyphHeight`), sigue entrando sin importar a qué
 * ángulo se lo rote — no hace falta bounding-box para el texto.
 *
 * Los íconos sí son objetos Fabric de posición, escala Y rotación libres
 * (arrastre, escalado por las esquinas, rotación por la manija nativa), así
 * que acá se calcula, en cada evento de arrastre/escalado/rotación, el
 * rango válido de distancia al centro / escala / ángulo que mantiene el
 * ícono COMPLETO (su bounding box real, ya rotado, no solo su centro)
 * dentro de la banda — nunca alcanza con comprobar el punto central.
 *
 * Método: como los íconos SÍ pueden rotar, su bounding box en pantalla no
 * está alineado a los ejes en general — `getRotatedHalfExtents` calcula el
 * semi-ancho/alto del rectángulo alineado a los ejes que efectivamente
 * encierra al ícono ya rotado (fórmula estándar de bounding box de un
 * rectángulo rotado: `W|cosθ| + H|sinθ|`, `W|sinθ| + H|cosθ|`). A partir de
 * ahí, para que las 4 esquinas de ese rectángulo queden a una distancia del
 * centro de la virola entre `innerRadius` y `outerRadius`, se busca por
 * bisección (no por fórmula cerrada: la corrección "a qué distancia/escala/
 * ángulo se cumple la condición" no tiene un despeje simple y robusto para
 * cualquier dirección) el mayor valor válido de distancia (al mover) o de
 * escala (al escalar o rotar). Ambas magnitudes son monótonas respecto de
 * las distancias de las esquinas, así que el rango válido siempre es un
 * único intervalo — la bisección converge de forma exacta hasta el
 * redondeo de punto flotante.
 */

/**
 * Piso real de escala de un ícono — no solo un límite "visual", es el valor
 * que `clampIconScale`/`clampIconRotation` fuerzan como mínimo absoluto, así
 * que tiene que ser geométricamente alcanzable en cualquier posición de la
 * banda (ver `clampIconScale`: nunca se permite bajar de acá, así que si
 * este número fuera más grande que el máximo real disponible en algún punto,
 * se rompería la contención en vez de respetarla).
 *
 * Antes era 0.05. Con los íconos reales de `iconLibrary.ts` (viewBox de
 * referencia 100×100, `strokeWidth` propio de 8px) eso significaba, para el
 * ícono más "chato" de la biblioteca (el infinito, ~60×22.5 unidades sin
 * trazo), un trazo final de apenas 8×0.05 = 0.4px — sub-píxel, literalmente
 * invisible en pantalla. Eso es lo que hacía creer que el ícono había
 * desaparecido (y fue lo que en la práctica confundió al contador de
 * elementos: el objeto seguía ahí, solo que no se veía).
 *
 * 0.2 se eligió mirando ese mismo caso límite: a esa escala, el trazo del
 * infinito queda en 8×0.2 = 1.6px — comparable al grosor de línea que ya
 * tiene el TEXTO en su propio tamaño mínimo (`MIN_FONT_SIZE = 16`px en
 * curvedText.ts, con un grosor de trazo típico de fuente de ese orden), así
 * que no es un número arbitrario: iguala el piso de legibilidad que el
 * editor ya acepta en otro elemento. A esa escala, incluso el ícono más
 * chato de la librería sigue teniendo una silueta cerrada reconocible
 * (~13.6×6.1px de cuerpo, sin contar el trazo) — no un punto ni una línea
 * perdida. El límite sigue siendo muy inferior al tamaño "de fábrica" de
 * cualquier ícono en su posición por defecto (~0.4, ver `createIconObject`
 * en iconElement.ts), así que el rango de achicado sigue siendo amplio.
 *
 * Por qué es geométricamente seguro en cualquier posición: a 0.2, el ícono
 * más grande de la librería (el corazón, ~90×86 + trazo) mide como mucho
 * ~19.6×18.8px de semi-extensión — una fracción chica del ancho de banda
 * completo (55px, ver `bandWidth` en virola.config.ts) — así que
 * `findValidDistanceRange`/`findMaxValidScale` siempre encuentran lugar para
 * esa escala en cualquier ángulo, para cualquier ícono de la biblioteca.
 */
export const MIN_ICON_SCALE = 0.2;
const BISECT_ITERATIONS = 40;

/**
 * Margen adicional de manipulación, exclusivo de los íconos — este archivo
 * es enteramente para íconos (el texto ni lo importa, ver el comentario
 * grande al principio del archivo), así que ensanchar acá la banda efectiva
 * no puede afectar al texto de ninguna manera.
 *
 * Las formas reales de `iconLibrary.ts` difieren mucho de su bounding box
 * rectangular (un ícono angosto como el infinito deja mucho aire en las
 * esquinas de su propio rectángulo; uno más macizo como el corazón, casi
 * nada) — este margen le da a CUALQUIER forma un poco más de lugar real
 * para manipular sin que la contención la frene antes de tiempo por culpa
 * del rectángulo, no de la forma visible.
 *
 * Es chico a propósito (10px ≈ 2mm, frente a un ancho de banda real de
 * ~55px/11mm): ningún ícono real de la biblioteca, ni siquiera al mínimo
 * (`MIN_ICON_SCALE`), tiene un bounding box tan chico como para que sus dos
 * esquinas (la más cercana y la más lejana del centro) quepan juntas dentro
 * de una franja de solo 10px — por eso el margen nunca alcanza para que el
 * ícono quede ENTERO más allá del borde físico real (`config.outerRadius`),
 * solo para que una porción chica lo cruce.
 */
const ICON_MARGIN_PX = 10;

/** Banda efectiva (con el margen de manipulación) contra la que se valida un ícono. */
function getIconBandRadii(config: VirolaConfig): { innerRadius: number; outerRadius: number } {
  return {
    innerRadius: Math.max(0, config.innerRadius - ICON_MARGIN_PX),
    outerRadius: config.outerRadius + ICON_MARGIN_PX,
  };
}

function getStrokeWidth(object: FabricObject): number {
  return object.strokeWidth ?? 0;
}

/**
 * Semi-ancho/alto del rectángulo alineado a los ejes que encierra
 * exactamente al objeto, dado un ángulo de rotación (grados) y una escala,
 * a partir de sus dimensiones propias (sin rotar, sin escalar). Fórmula
 * estándar de bounding box de un rectángulo rotado.
 */
/**
 * Exportada (además de usarse acá adentro) porque `circularLines.ts` también
 * la necesita para calcular la zona de exclusión de un ícono frente a las
 * líneas circulares decorativas — misma fórmula, no una copia nueva.
 */
export function getRotatedHalfExtents(
  object: FabricObject,
  scale: number,
  angleDeg: number,
): { halfWidth: number; halfHeight: number } {
  const strokeWidth = getStrokeWidth(object);
  const localHalfWidth = (object.width + strokeWidth) / 2;
  const localHalfHeight = (object.height + strokeWidth) / 2;
  const angleRad = (angleDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(angleRad));
  const sin = Math.abs(Math.sin(angleRad));
  return {
    halfWidth: scale * (localHalfWidth * cos + localHalfHeight * sin),
    halfHeight: scale * (localHalfWidth * sin + localHalfHeight * cos),
  };
}

/**
 * Distancia mínima y máxima al origen de las 4 esquinas de un rectángulo
 * alineado a los ejes, centrado en (offsetX, offsetY) respecto de ese
 * origen, con los semi-anchos/altos dados. La mínima es la distancia del
 * punto del rectángulo más cercano al origen (que puede ser una esquina o
 * un punto sobre un lado, según el caso) — fórmula estándar de distancia
 * punto-a-rectángulo-alineado-a-ejes.
 */
function cornerDistanceRange(
  offsetX: number,
  offsetY: number,
  halfWidth: number,
  halfHeight: number,
): { minCorner: number; maxCorner: number } {
  const px = Math.abs(offsetX);
  const py = Math.abs(offsetY);
  const maxCorner = Math.hypot(px + halfWidth, py + halfHeight);
  const minCorner = Math.hypot(Math.max(0, px - halfWidth), Math.max(0, py - halfHeight));
  return { minCorner, maxCorner };
}

function isWithinBand(
  offsetX: number,
  offsetY: number,
  halfWidth: number,
  halfHeight: number,
  innerRadius: number,
  outerRadius: number,
): boolean {
  const { minCorner, maxCorner } = cornerDistanceRange(offsetX, offsetY, halfWidth, halfHeight);
  return minCorner >= innerRadius && maxCorner <= outerRadius;
}

/**
 * Rango válido de distancia `t` al centro de la virola, a lo largo de una
 * dirección fija (ux, uy), tal que un rectángulo con los semi-anchos/altos
 * dados queda completo dentro de la banda. Se buscan por separado el techo
 * (lo impone el borde exterior) y el piso (lo impone el borde interior) —
 * ambos son monótonos en `t`, así que el resultado es un único intervalo.
 */
function findValidDistanceRange(
  ux: number,
  uy: number,
  halfWidth: number,
  halfHeight: number,
  innerRadius: number,
  outerRadius: number,
): { min: number; max: number } {
  const searchUpperBound = outerRadius + halfWidth + halfHeight;

  let lo = 0;
  let hi = searchUpperBound;
  for (let i = 0; i < BISECT_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const { maxCorner } = cornerDistanceRange(mid * ux, mid * uy, halfWidth, halfHeight);
    if (maxCorner <= outerRadius) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const maxT = lo;

  lo = 0;
  hi = searchUpperBound;
  for (let i = 0; i < BISECT_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const { minCorner } = cornerDistanceRange(mid * ux, mid * uy, halfWidth, halfHeight);
    if (minCorner < innerRadius) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const minT = hi;

  return { min: minT, max: maxT };
}

/**
 * Mayor escala uniforme válida para un ícono centrado a una distancia fija
 * (offsetX, offsetY) del centro de la virola, con semi-anchos/altos "por
 * unidad de escala" dados (ya calculados para el ángulo de rotación
 * correspondiente — ver `getRotatedHalfExtents`), tal que su bounding box
 * completo entra en la banda. Misma bisección que `findValidDistanceRange`,
 * pero la variable libre es la escala en vez de la distancia — también
 * monótona (a mayor escala, las esquinas siempre se alejan del centro del
 * ícono, nunca se acercan), así que el resultado es, de nuevo, un único
 * intervalo `[0, maxScale]`.
 */
function findMaxValidScale(
  offsetX: number,
  offsetY: number,
  baseHalfWidth: number,
  baseHalfHeight: number,
  innerRadius: number,
  outerRadius: number,
): number {
  // Cota superior de búsqueda generosa: suficiente para cualquier escala
  // razonable que un usuario pueda alcanzar arrastrando una esquina, muy
  // por encima de lo que la banda física podría llegar a permitir.
  const searchUpperBound = 20;

  let lo = 0;
  let hi = searchUpperBound;
  for (let i = 0; i < BISECT_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const valid = isWithinBand(offsetX, offsetY, mid * baseHalfWidth, mid * baseHalfHeight, innerRadius, outerRadius);
    if (valid) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/**
 * Corrige en el momento la posición de un ícono para que su bounding box
 * completo (a su ángulo de rotación ACTUAL) quede dentro de la banda válida
 * de la virola, conservando la dirección hacia la que se lo movió y su
 * escala/rotación actuales. Si la posición ya es válida, no cambia nada. Se
 * usa tanto desde `object:moving` (arrastre en vivo) como al fijar la
 * posición angular por defecto de un ícono nuevo (`applyIconAngle`, en
 * `iconElement.ts`) — un solo lugar que garantiza que ningún ícono, se cree
 * o se mueva como se mueva, puede terminar fuera de la banda.
 */
export function clampIconPosition(icon: FabricObject, config: VirolaConfig): void {
  const centerX = config.width / 2;
  const centerY = config.height / 2;
  const left = icon.left ?? centerX;
  const top = icon.top ?? centerY;
  const { innerRadius, outerRadius } = getIconBandRadii(config);

  const { halfWidth, halfHeight } = getRotatedHalfExtents(icon, icon.scaleX ?? 1, icon.angle ?? 0);

  const dx = left - centerX;
  const dy = top - centerY;
  const distance = Math.hypot(dx, dy);

  if (isWithinBand(dx, dy, halfWidth, halfHeight, innerRadius, outerRadius)) {
    return;
  }

  // Si el ícono cae exactamente sobre el centro (dirección indefinida), se
  // manda a mitad de banda hacia arriba en vez de quedar en un estado sin
  // dirección — caso degenerado, no debería ocurrir en uso normal.
  const ux = distance > 0 ? dx / distance : 0;
  const uy = distance > 0 ? dy / distance : -1;

  const { min, max } = findValidDistanceRange(ux, uy, halfWidth, halfHeight, innerRadius, outerRadius);
  const clampedDistance = Math.min(Math.max(distance, min), max);

  icon.set({
    left: centerX + ux * clampedDistance,
    top: centerY + uy * clampedDistance,
  });
  icon.setCoords();
}

/**
 * Corrige en el momento la escala de un ícono para que su bounding box
 * completo (a su posición y ángulo de rotación ACTUALES) quede dentro de la
 * banda, conservando su centro (los íconos se crean con
 * `centeredScaling: true`, ver `iconElement.ts`, así que escalar nunca
 * mueve el centro) y forzando una única escala para X e Y — así el ícono
 * nunca se deforma, sin importar con qué manija ni con qué tecla
 * modificadora se lo haya escalado.
 */
export function clampIconScale(icon: FabricObject, config: VirolaConfig): void {
  const centerX = config.width / 2;
  const centerY = config.height / 2;
  const dx = (icon.left ?? centerX) - centerX;
  const dy = (icon.top ?? centerY) - centerY;
  const angle = icon.angle ?? 0;
  const { innerRadius, outerRadius } = getIconBandRadii(config);

  const attemptedScale = Math.max(MIN_ICON_SCALE, Math.abs(icon.scaleX ?? 1));
  // Semi-anchos/altos "por unidad de escala" al ángulo actual — al ser la
  // escala un factor multiplicativo puro, alcanza con pedirlos a escala 1 y
  // dejar que la bisección de `findMaxValidScale` los multiplique.
  const { halfWidth: unitHalfWidth, halfHeight: unitHalfHeight } = getRotatedHalfExtents(icon, 1, angle);

  const maxValidScale = findMaxValidScale(dx, dy, unitHalfWidth, unitHalfHeight, innerRadius, outerRadius);
  const finalScale = Math.max(MIN_ICON_SCALE, Math.min(attemptedScale, maxValidScale));

  icon.set({ scaleX: finalScale, scaleY: finalScale });
  icon.setCoords();
}

/**
 * Mayor escala válida para un ícono, permitiendo que su CENTRO se reacomode
 * (a lo largo de la misma dirección angular en la que ya está, nunca
 * cambiando de ángulo — igual que `clampIconPosition`) hasta encontrar una
 * posición donde esa escala entre. No muta el ícono — solo CONSULTA cuál
 * sería el techo real.
 *
 * Es distinto de preguntar "¿cuánto puede crecer SIN moverse del centro
 * actual?" (eso es lo que haría reusar `findMaxValidScale` directo con el
 * `dx`/`dy` de HOY, sin más) — esa pregunta da un techo mucho más bajo que
 * el real cuando el ícono ya está cerca de un borde, porque no contempla que
 * el propio `clampIconPosition` (containment.ts) SÍ va a reacomodarlo al
 * crecer. Por eso, para CADA escala candidata `S` de la búsqueda, se
 * pregunta "¿existe ALGUNA distancia al centro donde un ícono de escala `S`
 * entre completo en la banda?" (`findValidDistanceRange` no vacío) en vez de
 * "¿entra a la distancia de hoy?" — la respuesta a esa pregunta es lo que
 * `applyIconScale` (actions.ts) puede realmente lograr reposicionando, así
 * que este es el techo verdadero para el gesto de tamaño del
 * `ContextualToolbar`, no una aproximación.
 *
 * Es monótona en `S` (a mayor escala, el rango de distancias válido nunca se
 * agranda, solo se angosta o desaparece), así que "existe una distancia
 * válida" pasa de verdadero a falso una sola vez — el resultado es, de
 * nuevo, un único intervalo `[0, maxScale]`, y la búsqueda por bisección es
 * válida.
 */
export function getMaxValidIconScale(icon: FabricObject, config: VirolaConfig): number {
  const centerX = config.width / 2;
  const centerY = config.height / 2;
  const dx = (icon.left ?? centerX) - centerX;
  const dy = (icon.top ?? centerY) - centerY;
  const distance = Math.hypot(dx, dy);
  // Misma convención de respaldo que clampIconPosition para el caso
  // degenerado (ícono exactamente sobre el centro de la virola).
  const ux = distance > 0 ? dx / distance : 0;
  const uy = distance > 0 ? dy / distance : -1;
  const angle = icon.angle ?? 0;
  const { innerRadius, outerRadius } = getIconBandRadii(config);

  // Misma cota de búsqueda generosa que findMaxValidScale.
  const searchUpperBound = 20;
  let lo = 0;
  let hi = searchUpperBound;
  for (let i = 0; i < BISECT_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const { halfWidth, halfHeight } = getRotatedHalfExtents(icon, mid, angle);
    const { min, max } = findValidDistanceRange(ux, uy, halfWidth, halfHeight, innerRadius, outerRadius);
    const feasibleSomewhere = min <= max;
    if (feasibleSomewhere) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/**
 * Corrige en el momento la rotación de un ícono: a diferencia de mover/
 * escalar, rotar nunca se bloquea ni se redirige (sería una interacción muy
 * rara — "esta rotación no se puede completar"), en cambio, si el nuevo
 * ángulo hace que el bounding box ya no entre en la banda a la escala
 * actual, se achica la escala lo mínimo necesario para que vuelva a entrar
 * (nunca por debajo de `MIN_ICON_SCALE`). Reutiliza la misma búsqueda de
 * escala máxima que `clampIconScale`, evaluada al ángulo nuevo en vez del
 * actual.
 */
export function clampIconRotation(icon: FabricObject, config: VirolaConfig): void {
  const centerX = config.width / 2;
  const centerY = config.height / 2;
  const dx = (icon.left ?? centerX) - centerX;
  const dy = (icon.top ?? centerY) - centerY;
  const angle = icon.angle ?? 0;
  const { innerRadius, outerRadius } = getIconBandRadii(config);

  const currentScale = Math.max(MIN_ICON_SCALE, Math.abs(icon.scaleX ?? 1));
  const { halfWidth: unitHalfWidth, halfHeight: unitHalfHeight } = getRotatedHalfExtents(icon, 1, angle);

  const maxValidScale = findMaxValidScale(dx, dy, unitHalfWidth, unitHalfHeight, innerRadius, outerRadius);
  if (currentScale <= maxValidScale) {
    return;
  }

  const finalScale = Math.max(MIN_ICON_SCALE, maxValidScale);
  icon.set({ scaleX: finalScale, scaleY: finalScale });
  icon.setCoords();
}
