import { pointToAngleDeg } from '../canvas/ringAngle';

/**
 * Geometría de posicionamiento del `ContextualToolbar` — separada del
 * componente React (`ContextualToolbar.tsx`) porque es lógica pura (sin
 * `window`/DOM salvo el `viewport` que recibe como parámetro explícito),
 * así se puede testear directamente en Node (ver `contextualMenuPlacement.test.ts`)
 * sin tener que montar el componente ni stubear CSS.
 */

/** Aire mínimo respecto del borde de la ventana, para que el menú nunca quede cortado. */
export const VIEWPORT_PADDING_PX = 8;

export interface ScreenPoint {
  left: number;
  top: number;
}

/**
 * Las 8 posiciones posibles del menú alrededor de su punto de anclaje —
 * siempre nombradas por dónde queda el CUERPO del menú respecto de ese
 * punto (p. ej. "top" = el menú se dibuja arriba del punto).
 */
export type Placement = 'top' | 'top-right' | 'right' | 'bottom-right' | 'bottom' | 'bottom-left' | 'left' | 'top-left';

const PLACEMENT_ORDER: Placement[] = ['top', 'top-right', 'right', 'bottom-right', 'bottom', 'bottom-left', 'left', 'top-left'];

/**
 * Fracción del ancho/alto del menú que hay que correrlo desde el punto de
 * anclaje para que ese punto quede en el borde correspondiente del menú
 * (p. ej. "top": el punto queda en el borde INFERIOR del menú, por eso
 * `y: -1` — el menú entero se corre hacia arriba de su propia altura).
 */
const PLACEMENT_FACTOR: Record<Placement, { x: number; y: number }> = {
  top: { x: -0.5, y: -1 },
  'top-right': { x: 0, y: -1 },
  right: { x: 0, y: -0.5 },
  'bottom-right': { x: 0, y: 0 },
  bottom: { x: -0.5, y: 0 },
  'bottom-left': { x: -1, y: 0 },
  left: { x: -1, y: -0.5 },
  'top-left': { x: -1, y: -1 },
};

/** Ángulo del vector (ux, uy) bucketizado a una de las 8 posiciones, misma convención que ringAngle.ts (0°=arriba, sentido horario). */
export function vectorToPlacement(ux: number, uy: number): Placement {
  const deg = pointToAngleDeg(ux, uy);
  const index = Math.round(deg / 45) % 8;
  return PLACEMENT_ORDER[index];
}

/**
 * Orden de posiciones candidatas a probar, empezando por la preferida y
 * alternando hacia los lados más cercanos primero (y la opuesta al final) —
 * así, si la preferida no entra en la pantalla, se prueba la más parecida
 * antes de saltar directo al lado contrario.
 */
export function candidatePlacements(preferred: Placement): Placement[] {
  const startIndex = PLACEMENT_ORDER.indexOf(preferred);
  const order: Placement[] = [preferred];
  for (let step = 1; step <= 4; step++) {
    const plus = PLACEMENT_ORDER[(startIndex + step) % 8];
    const minus = PLACEMENT_ORDER[(startIndex - step + 8) % 8];
    if (!order.includes(plus)) {
      order.push(plus);
    }
    if (!order.includes(minus)) {
      order.push(minus);
    }
  }
  return order;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function menuRectFor(anchor: ScreenPoint, placement: Placement, size: { width: number; height: number }): Rect {
  const factor = PLACEMENT_FACTOR[placement];
  const left = anchor.left + factor.x * size.width;
  const top = anchor.top + factor.y * size.height;
  return { left, top, right: left + size.width, bottom: top + size.height };
}

/** Área (px²) de la intersección de dos rectángulos de pantalla — 0 si no se superponen. */
function overlapArea(a: Rect, b: Rect): number {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
}

/**
 * Obstáculos a evitar al elegir la posición del menú (Etapa 14C, sección 6):
 * el rectángulo de pantalla del elemento SELECCIONADO (prioridad 1 — nunca
 * taparlo si existe una alternativa) y los de los DEMÁS elementos del diseño
 * (prioridad 2). Ambos son opcionales — sin ellos, `resolveMenuPlacement` se
 * comporta exactamente igual que en la Etapa 14B (solo evita el viewport).
 */
export interface MenuObstacles {
  selectedElement?: Rect;
  otherElements?: readonly Rect[];
}

/**
 * Cuánto más importa NO tapar el elemento seleccionado que no tapar
 * cualquier otro elemento — un múltiplo arbitrario pero documentado, no una
 * medida física: solo importa que sea mayor a 1 para que, en un empate de
 * superposición, se prefiera sacrificar un poco de superposición con OTRO
 * elemento antes que tapar el que se está editando ahora mismo (sección 6,
 * prioridad 1 antes que prioridad 2).
 */
const SELECTED_ELEMENT_OVERLAP_WEIGHT = 4;

/** Puntaje de superposición total del rectángulo del menú contra los obstáculos — 0 si no se superpone con nada. */
function overlapScore(rect: Rect, obstacles: MenuObstacles): number {
  let score = 0;
  if (obstacles.selectedElement) {
    score += overlapArea(rect, obstacles.selectedElement) * SELECTED_ELEMENT_OVERLAP_WEIGHT;
  }
  for (const other of obstacles.otherElements ?? []) {
    score += overlapArea(rect, other);
  }
  return score;
}

/**
 * Cuánto (dx, dy) hay que correr un rectángulo ya calculado para que quede
 * completo dentro del viewport (0 en cada eje si ya entra en ese eje).
 *
 * Etapa 14B (mobile): antes de esto, el componente solo acotaba el PUNTO de
 * anclaje (`clampToViewport`, ya eliminada) — nunca el rectángulo real del
 * menú, que se dibuja desplazado de ese punto según `placement` (ver
 * `menuRectFor`). En una pantalla angosta (~390px), con el elemento cerca
 * del borde derecho, NINGUNA de las 8 `candidatePlacements` entraba entera
 * (la vieja función `fitsViewport` siempre daba `false`) y el código caía al
 * `preferred` sin ninguna corrección — el menú (~220px de ancho) terminaba
 * con gran parte, a veces el botón "Editar" entero, literalmente fuera de la
 * pantalla (posición X real observada: 454px en una pantalla de 390px de
 * ancho — confirmado con touch real emulado en Chrome, ver el informe de la
 * Etapa 14B). Reproducible también en desktop con una ventana angosta — no
 * es un problema exclusivo de touch, solo mucho más común ahí porque el
 * canvas ocupa casi todo el ancho.
 */
export function rectOverflow(
  rect: { left: number; top: number; right: number; bottom: number },
  viewport: { width: number; height: number },
): { dx: number; dy: number } {
  let dx = 0;
  if (rect.left < VIEWPORT_PADDING_PX) {
    dx = VIEWPORT_PADDING_PX - rect.left;
  } else if (rect.right > viewport.width - VIEWPORT_PADDING_PX) {
    dx = viewport.width - VIEWPORT_PADDING_PX - rect.right;
  }
  let dy = 0;
  if (rect.top < VIEWPORT_PADDING_PX) {
    dy = VIEWPORT_PADDING_PX - rect.top;
  } else if (rect.bottom > viewport.height - VIEWPORT_PADDING_PX) {
    dy = viewport.height - VIEWPORT_PADDING_PX - rect.bottom;
  }
  return { dx, dy };
}

/**
 * Elige, entre las 8 posiciones candidatas (`candidatePlacements`, en orden
 * de preferencia), la posición del menú — con dos criterios en cascada:
 *
 * 1) (obligatorio, igual que en la Etapa 14B) el rectángulo REAL del menú en
 *    esa posición debe quedar dentro del viewport — si ninguna candidata
 *    entra perfecta, se corrige el punto de anclaje lo mínimo necesario (ver
 *    `rectOverflow`) y se usa la que necesite la corrección más chica.
 * 2) (Etapa 14C, sección 6 — desempate, no reemplaza al anterior) entre las
 *    candidatas empatadas en el criterio 1 (normalmente varias, cuando el
 *    elemento no está pegado a un borde de la pantalla), se prefiere la que
 *    menos se superponga con el elemento seleccionado y con los demás
 *    elementos del diseño (`obstacles`, opcional — sin él, el resultado es
 *    idéntico al de la Etapa 14B).
 */
export function resolveMenuPlacement(
  rawPoint: ScreenPoint,
  preferred: Placement,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  obstacles: MenuObstacles = {},
): { placement: Placement; screenPoint: ScreenPoint } {
  let bestPlacement = preferred;
  let bestShift = { dx: 0, dy: 0 };
  let bestViewportScore = Infinity;
  let bestOverlapScore = Infinity;

  for (const candidate of candidatePlacements(preferred)) {
    const rect = menuRectFor(rawPoint, candidate, size);
    const shift = rectOverflow(rect, viewport);
    const viewportScore = Math.abs(shift.dx) + Math.abs(shift.dy);
    const shiftedRect: Rect = {
      left: rect.left + shift.dx,
      top: rect.top + shift.dy,
      right: rect.right + shift.dx,
      bottom: rect.bottom + shift.dy,
    };
    const overlap = overlapScore(shiftedRect, obstacles);

    const isBetter = viewportScore < bestViewportScore
      || (viewportScore === bestViewportScore && overlap < bestOverlapScore);
    if (isBetter) {
      bestPlacement = candidate;
      bestShift = shift;
      bestViewportScore = viewportScore;
      bestOverlapScore = overlap;
    }
  }
  return {
    placement: bestPlacement,
    screenPoint: { left: rawPoint.left + bestShift.dx, top: rawPoint.top + bestShift.dy },
  };
}
