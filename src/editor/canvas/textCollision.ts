import type { Canvas, IText } from 'fabric';
import type { VirolaConfig } from '../../config/virola.config';
import { angleToPoint } from './ringAngle';
import { GLYPH_HEIGHT_RATIO, getCurveRadius, getCurveState, isTextObject } from './curvedText';

/**
 * Separación mínima entre DOS textos curvos distintos — para que, al
 * permitir varios textos en el mismo diseño, nunca puedan superponerse,
 * tocarse, ni quedar tan juntos que se lean como un solo bloque.
 *
 * Geometría: NO se mide distancia entre centros (eso permitiría que dos
 * textos grandes se superpongan si sus centros están lo bastante lejos mutuo
 * pero sus letras no) — se reutiliza el MISMO concepto de "círculo
 * envolvente" que ya usa `circularLines.ts` (`getTextExclusionZone`, no
 * importada acá a propósito — ver el comentario grande de
 * `getTextOccupiedZone`) para que una línea circular no atraviese un texto:
 * un círculo centrado en el punto real del texto sobre el anillo, de radio
 * igual a la hipotenusa entre su medio-ancho REAL (medido con
 * `calcTextWidth()`, nunca una heurística por cantidad de caracteres) y su
 * medio-alto real de glifo (`fontSize * GLYPH_HEIGHT_RATIO`). Dos textos NO
 * colisionan mientras la distancia entre sus dos centros sea mayor a la
 * SUMA de sus dos radios envolventes más este margen — el mismo criterio
 * geométrico (círculo-círculo) que ya usa `containment.ts`/`circularLines.ts`
 * en otros contextos, aplicado acá a texto-contra-texto.
 */
const TEXT_SEPARATION_MARGIN_PX = 12;

/** Círculo envolvente de un texto: centro (relativo al centro de la virola) + radio del alcance real. */
interface OccupiedZone {
  dx: number;
  dy: number;
  radius: number;
}

function computeOccupiedZone(textObj: IText, angleDeg: number, radius: number, config: VirolaConfig): OccupiedZone {
  const centerX = config.width / 2;
  const centerY = config.height / 2;
  const point = angleToPoint(angleDeg, radius, centerX, centerY);
  const halfTextWidth = (textObj.calcTextWidth() || 0) / 2;
  const halfGlyphReach = textObj.fontSize * GLYPH_HEIGHT_RATIO;
  return {
    dx: point.x - centerX,
    dy: point.y - centerY,
    radius: Math.hypot(halfTextWidth, halfGlyphReach),
  };
}

/**
 * Zona real que ocupa un texto AHORA (a su `curveOffset`/`curveRadius`
 * actuales) — misma fórmula que `computeOccupiedZone`, leyendo el estado ya
 * guardado en el objeto en vez de uno hipotético. Se usa para medir a los
 * demás textos (los que NO se están moviendo en este momento).
 */
function getTextOccupiedZone(textObj: IText, config: VirolaConfig): OccupiedZone {
  return computeOccupiedZone(textObj, getCurveState(textObj).offset, getCurveRadius(textObj, config), config);
}

/** true si dos zonas ocupadas se tocan o invaden el margen mínimo entre sí. */
function zonesCollide(a: OccupiedZone, b: OccupiedZone): boolean {
  const distance = Math.hypot(a.dx - b.dx, a.dy - b.dy);
  return distance < a.radius + b.radius + TEXT_SEPARATION_MARGIN_PX;
}

/** Zonas ocupadas de todos los textos del canvas, EXCEPTO el indicado (el que se está moviendo/creando). */
function getOtherTextZones(canvas: Canvas, config: VirolaConfig, excluding: IText | null): OccupiedZone[] {
  return canvas
    .getObjects()
    .filter(isTextObject)
    .filter((text) => text !== excluding)
    .map((text) => getTextOccupiedZone(text, config));
}

/** true si el texto indicado, en su posición ACTUAL, invade el espacio de algún otro texto del canvas. */
export function wouldTextCollide(canvas: Canvas, movingText: IText, config: VirolaConfig): boolean {
  const zone = getTextOccupiedZone(movingText, config);
  return getOtherTextZones(canvas, config, movingText).some((other) => zonesCollide(zone, other));
}

/**
 * Ángulos candidatos para el próximo texto que se crea, en orden de
 * preferencia: arriba (0°, el mismo valor por defecto de siempre —
 * `DEFAULT_CURVE_STATE` en curvedText.ts —, así que con un solo texto en el
 * diseño el comportamiento queda idéntico al de antes de esta función
 * existir), abajo (180°, la máxima separación posible del primero), y
 * después izquierda/derecha (90°/270°) para el tercero y cuarto — misma
 * idea que `INITIAL_ICON_ANGLES_DEG` (iconElement.ts) de repartir posiciones
 * fijas antes de recurrir a una búsqueda, pero con 4 candidatos en vez de 3
 * porque acá `MAX_TEXT_ELEMENTS` es 4.
 */
const CANDIDATE_TEXT_ANGLES_DEG = [0, 180, 90, 270] as const;

/**
 * Ángulo inicial para un texto nuevo, sin invadir el espacio real de
 * ningún texto ya existente. A diferencia de `getDefaultIconAngle`
 * (iconElement.ts), que solo mira si un ángulo fijo ya está "tomado" (los
 * íconos son todos del mismo tamaño aproximado), acá hace falta colisión
 * geométrica de verdad: el ancho real de un texto varía muchísimo según su
 * contenido y tamaño de fuente, así que dos textos en ángulos "distintos"
 * igual pueden invadirse si son largos.
 *
 * Primero prueba los 4 candidatos fijos de `CANDIDATE_TEXT_ANGLES_DEG`. Si
 * los cuatro colisionan (posible solo con textos ya muy largos ocupando
 * gran parte del anillo), recorre el círculo completo cada 10° como
 * respaldo. Si ni así encuentra un lugar libre (el anillo ya está
 * geométricamente lleno de texto), devuelve 0 como último recurso — igual
 * que `getDefaultIconAngle`, nunca impide crear el elemento en sí, que ya
 * está gobernado aparte por `MAX_TEXT_ELEMENTS` (designLimits.ts).
 */
export function getDefaultTextAngle(canvas: Canvas, textObj: IText, config: VirolaConfig): number {
  const others = getOtherTextZones(canvas, config, textObj);
  if (others.length === 0) {
    return 0;
  }

  const radius = getCurveRadius(textObj, config);
  function isFreeAt(angleDeg: number): boolean {
    const zone = computeOccupiedZone(textObj, angleDeg, radius, config);
    return !others.some((other) => zonesCollide(zone, other));
  }

  for (const candidate of CANDIDATE_TEXT_ANGLES_DEG) {
    if (isFreeAt(candidate)) {
      return candidate;
    }
  }
  for (let angleDeg = 0; angleDeg < 360; angleDeg += 10) {
    if (isFreeAt(angleDeg)) {
      return angleDeg;
    }
  }
  return 0;
}

/**
 * Corrige (si hace falta) un ángulo/radio propuestos para un texto en
 * movimiento, de forma que su zona ocupada nunca invada la de otro texto —
 * nunca bloquea el gesto en seco: si el estado propuesto (tras el delta de
 * este frame) colisiona, retrocede por el mismo camino que el usuario ya
 * estaba recorriendo (interpolando entre el último estado VÁLIDO y el
 * propuesto) hasta encontrar, por bisección, el punto más cercano al
 * propuesto que sigue siendo válido — misma filosofía y misma técnica de
 * bisección que ya usa `containment.ts` (`findValidDistanceRange`,
 * `findMaxValidScale`) para los íconos, aplicada acá sobre la interpolación
 * ángulo/radio en vez de sobre una distancia o una escala.
 *
 * El ángulo se interpola siempre por el camino más CORTO (nunca "dando la
 * vuelta larga" del círculo) — misma convención que `shortestAngleDeltaDeg`
 * en ContextualToolbar.tsx.
 *
 * Si no hay otros textos en el canvas, es un no-op inmediato (sin costo) —
 * el comportamiento de un único texto queda exactamente como estaba antes
 * de esta función existir.
 */
export function clampTextAgainstOtherTexts(
  canvas: Canvas,
  movingText: IText,
  currentAngleDeg: number,
  currentRadius: number,
  proposedAngleDeg: number,
  proposedRadius: number,
  config: VirolaConfig,
): { angleDeg: number; radius: number } {
  const others = getOtherTextZones(canvas, config, movingText);
  if (others.length === 0) {
    return { angleDeg: proposedAngleDeg, radius: proposedRadius };
  }

  function isValidAt(angleDeg: number, radius: number): boolean {
    const zone = computeOccupiedZone(movingText, angleDeg, radius, config);
    return !others.some((other) => zonesCollide(zone, other));
  }

  if (isValidAt(proposedAngleDeg, proposedRadius)) {
    return { angleDeg: proposedAngleDeg, radius: proposedRadius };
  }

  const angleDelta = ((((proposedAngleDeg - currentAngleDeg) % 360) + 540) % 360) - 180;
  const radiusDelta = proposedRadius - currentRadius;

  // El estado ANTERIOR (t=0) ya era válido (invariante que se mantiene
  // frame a frame); el propuesto (t=1) ya sabemos que no lo es (chequeado
  // arriba) — 30 iteraciones alcanzan de sobra la precisión de punto
  // flotante, mismo número que usa containment.ts (`BISECT_ITERATIONS`).
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const midAngle = currentAngleDeg + angleDelta * mid;
    const midRadius = currentRadius + radiusDelta * mid;
    if (isValidAt(midAngle, midRadius)) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return { angleDeg: currentAngleDeg + angleDelta * lo, radius: currentRadius + radiusDelta * lo };
}
