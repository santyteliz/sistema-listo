import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Canvas, FabricObject } from 'fabric';
import { useEditor } from '../state/EditorContext';
import { VIROLA_CONFIG } from '../../config/virola.config';
import { angleToPoint } from '../canvas/ringAngle';
import { MIN_FONT_SIZE, getEffectiveMaxFontSize, isTextObject } from '../canvas/curvedText';
import { MIN_ICON_SCALE, getMaxValidIconScale } from '../canvas/containment';
import { isIconObject } from '../canvas/iconElement';
import { TOUCH_GESTURE_EVENT_NAME, type TouchGestureEventDetail } from '../canvas/touchGestures';
import type { EditorSelection } from '../state/selection';
import { vectorToPlacement, resolveMenuPlacement, type Placement, type ScreenPoint, type Rect } from './contextualMenuPlacement';
import './ContextualToolbar.css';

/** Cuánto más allá del borde visible del elemento se separa el menú, para no taparlo. */
const ANCHOR_MARGIN_PX = 26;
/** Tamaño aproximado del menú antes de poder medirlo de verdad (ver `menuSizeCacheRef`). */
const FALLBACK_MENU_SIZE = { width: 220, height: 48 };

/**
 * Etapa 14C, sección 7-8 — DETECCIÓN DE DISPOSITIVO, no de gesto puntual: a
 * diferencia del "gate" de selección por doble toque (`useTouchGestures.ts`,
 * que se activa solo con eventos `TouchEvent` reales y por eso nunca
 * necesita preguntar nada), acá hace falta decidir qué BOTONES mostrar antes
 * de que el usuario haga ningún gesto — no hay un evento touch del que
 * partir. `(pointer: coarse)` es la media query estándar para esto: refleja
 * el puntero PRIMARIO del sistema operativo (true en un celular/tablet sin
 * mouse; false en una notebook/PC de escritorio, incluso con pantalla
 * táctil, si el mouse sigue siendo el puntero principal) — más preciso que
 * `'ontouchstart' in window` (que da `true` en cualquier laptop con pantalla
 * táctil aunque el usuario esté usando el mouse). Es SOLO para decidir qué
 * mostrar en la toolbar de íconos (sección 7); no cambia ningún otro
 * comportamiento — el resto de la interacción de escritorio no consulta esto
 * para nada.
 */
function usePointerIsCoarse(): boolean {
  const [isCoarse, setIsCoarse] = useState(() => (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false
  ));

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return;
    }
    const query = window.matchMedia('(pointer: coarse)');
    const handleChange = (): void => setIsCoarse(query.matches);
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  return isCoarse;
}

/**
 * Cuántas veces más lejos (o más cerca) del elemento tiene que quedar el
 * puntero, respecto de la distancia que había al EMPEZAR el gesto, para
 * recorrer el 100% del rango disponible — de forma EXPONENCIAL, no lineal
 * (ver `sizeFromDistanceRatio`). Es una RAZÓN (adimensional), no una
 * cantidad de píxeles: con `SIZE_GESTURE_RATIO_RANGE = 3`, alejar el
 * puntero hasta 3 veces la distancia inicial llega al máximo, y acercarlo
 * hasta un tercio de esa distancia llega al mínimo — sea cual sea esa
 * distancia inicial en píxeles (que depende de dónde cayó el botón
 * "Tamaño" respecto del elemento, distinto para cada tipo/tamaño/rotación
 * de ícono, o para el texto en cada posición del anillo). Usar una RAZÓN en
 * vez de una cantidad fija de píxeles es lo que hace que el mismo gesto
 * "se sienta igual" sin importar cuán lejos o cerca del elemento haya caído
 * el botón — ver el comentario grande de `sizeFromDistanceRatio`.
 */
const SIZE_GESTURE_RATIO_RANGE = 3;

type GestureKind = 'text-size' | 'icon-size' | 'icon-rotate';

/**
 * Estado de un gesto de press-and-drag en curso (tamaño o rotación). Vive en
 * un ref (no en useState) porque se actualiza en cada `pointermove` — meterlo
 * en estado de React forzaría un render por cada píxel de movimiento del
 * mouse, además de que la lectura tendría que esperar al próximo render para
 * reflejar el valor recién escrito (acá hace falta leer y escribir en el
 * mismo evento). Mismo patrón que `lastTextDragPointer` en
 * `useFabricCanvas.ts` para el arrastre de texto.
 *
 * El gesto de TAMAÑO (texto e ícono) es DIRECTO, no incremental: en cada
 * `pointermove` el tamaño se recalcula entero a partir de `baseline`, `min`,
 * `max`, `referencePoint` e `initialDistance` (todos leídos UNA sola vez, al
 * presionar — nunca reutilizados de un gesto anterior) y la posición ACTUAL
 * del puntero — nunca sumando/restando el delta de este frame al resultado
 * del frame anterior. Así el gesto no puede acumular error de redondeo
 * cuadro a cuadro (por más frames que dure) ni desincronizarse si algún
 * frame se pierde.
 *
 * `baseline` es el tamaño real del elemento en el instante del `pointerdown`
 * (no un valor recordado de antes) — por eso cada gesto nuevo, sin importar
 * cuántas veces se haya agrandado/achicado antes, arranca siempre desde el
 * tamaño actual de verdad.
 *
 * HISTORIAL — dos intentos previos, ambos descartados:
 *
 * 1) La versión con el bug original medía una distancia SIN signo
 * (`Math.hypot`, siempre ≥ 0) desde el punto EXACTO del `pointerdown`. Como
 * esa distancia vale 0 exactamente al empezar y no puede bajar de ahí, la
 * fórmula solo podía representar "achicar desde acá en adelante" — un gesto
 * que arrancaba con `baseline` ya chico no tenía forma de pedir algo más
 * grande.
 *
 * 2) La corrección de la iteración anterior fijaba una DIRECCIÓN (una recta
 * radial, hacia afuera de la virola) y proyectaba el arrastre sobre ella —
 * matemáticamente correcta (sí podía crecer y achicar indefinidamente), pero
 * en la práctica el gesto terminaba sintiéndose "en un riel": solo el
 * componente del arrastre a lo largo de esa recta importaba, así que mover
 * el mouse en cualquier otra dirección (o la privilegiada, según dónde
 * estuviera el elemento) no hacía nada. No es el comportamiento pedido.
 *
 * SOLUCIÓN ACTUAL: en vez de una recta, la referencia es un PUNTO — el
 * propio elemento (`referencePoint`, ver `handleSizePointerDown`) — y lo que
 * importa es la DISTANCIA (real, en cualquier dirección) del puntero a ese
 * punto, no una proyección. La clave que resuelve el problema de signo sin
 * necesitar una dirección: el punto de referencia NUNCA es el `pointerdown`
 * mismo (el botón "Tamaño" siempre está separado del elemento — por el
 * ícono/texto en sí y por `ANCHOR_MARGIN_PX`), así que la distancia inicial
 * `initialDistance` (`D0`) es un número mayor a cero, no cero. Eso permite
 * comparar la distancia ACTUAL contra `D0` (no contra 0): más cerca que al
 * empezar → achica; más lejos → agranda — en cualquier dirección, arriba,
 * abajo, diagonal, lo que sea, porque la distancia euclídea no privilegia
 * ninguna (ver `sizeFromDistanceRatio`).
 *
 * El gesto de ROTACIÓN sigue siendo incremental por-frame (`last` guarda el
 * último ángulo medido) porque ahí sí hace falta: la rotación no tiene un
 * "punto de referencia absoluto" como el tamaño, es un giro relativo al
 * ángulo anterior.
 */
interface DragGesture {
  kind: GestureKind;
  pointerId: number;
  /**
   * Punto de pantalla fijo contra el que se mide la distancia/ángulo,
   * durante todo el gesto (aunque el toolbar se reposicione mientras
   * tanto). Para tamaño: el propio elemento (centro del ícono, o punto del
   * texto sobre el anillo) — NUNCA el `pointerdown`, ver el comentario
   * grande de arriba. Para rotación: el pivote angular (también el centro
   * del ícono).
   */
  anchor: ScreenPoint;
  /** Último ángulo medido, en grados — solo lo usa la rotación (delta por frame). */
  last: number;
  /** Tamaño (fontSize deseado, o escala de ícono) real al EMPEZAR este gesto — solo lo usan los gestos de tamaño. */
  baseline: number;
  /** Tamaño mínimo alcanzable en este gesto — solo lo usan los gestos de tamaño. */
  min: number;
  /**
   * Tamaño máximo alcanzable en este gesto, calculado UNA vez al presionar
   * (para texto: el techo geométrico real, ver `getEffectiveMaxFontSize`;
   * para ícono: el máximo válido permitiendo reacomodar el centro, ver
   * `getMaxValidIconScale` — que igual se vuelve a aplicar en cada frame por
   * `applyIconScale`/`clampIconPosition`/`clampIconScale`, esto solo moldea
   * la curva del gesto, no reemplaza esa contención real). Solo lo usan los
   * gestos de tamaño.
   */
  max: number;
  /**
   * Distancia (px de pantalla) entre el `pointerdown` y `anchor` — el "D0"
   * contra el que se compara la distancia de cada frame para saber si el
   * puntero quedó más cerca o más lejos del elemento que al empezar (ver
   * `sizeFromDistanceRatio`). Solo lo usan los gestos de tamaño.
   */
  initialDistance: number;
}

/**
 * Convierte un punto en coordenadas internas del canvas (el mismo sistema
 * que usa Fabric.js — `VIROLA_CONFIG.width/height`, siempre 640×640 sin
 * importar el tamaño real en pantalla) a coordenadas de pantalla (para
 * posicionar un elemento de React con `position: fixed` encima del canvas).
 *
 * Etapa 14C — CORRECCIÓN de un bug preexistente (desde la Etapa 4, nunca
 * detectado hasta ahora porque todas las pruebas anteriores del toolbar se
 * hicieron con el canvas a escala 1:1, ventanas ≥640px de ancho — ver el
 * informe de la Etapa 14C): esta función necesita el factor de zoom
 * responsive (`canvas.setZoom`, Etapa 4) para escalar un punto de 640×640 a
 * píxeles de pantalla reales — antes usaba `rect.width / canvas.getWidth()`
 * como ese factor, pero `canvas.getWidth()` YA devuelve el tamaño en
 * PANTALLA post-zoom (`canvas.setDimensions` lo fija así), es decir, es
 * prácticamente IGUAL a `rect.width` — el "factor de escala" resultante era
 * ~1 sin importar cuánto hubiera hecho zoom `applyResponsiveScale`
 * (`useFabricCanvas.ts`), y un punto de 640×640 se posicionaba como si la
 * pantalla también midiera 640px. En una ventana ancha (zoom=1, el único
 * caso probado hasta la Etapa 14B) esto por casualidad no se notaba, porque
 * ahí SÍ vale ~1. En un celular real (zoom≈0.56 en un iPhone de 390px de
 * ancho, medido) el toolbar terminaba desplazado por un factor de ~1.8x
 * respecto de dónde debía estar — confirmado comparando la posición
 * renderizada real del menú contra la posición esperada del ícono
 * seleccionado. La corrección: escalar por `canvas.getZoom()` (el mismo
 * factor que Fabric.js ya usa internamente para dibujar y para el
 * hit-testing de clicks/touches — `viewportTransform`), no por una relación
 * de anchos que en la práctica siempre da ~1.
 */
function canvasPointToScreen(
  canvasEl: HTMLCanvasElement,
  zoom: number,
  point: { x: number; y: number },
): ScreenPoint {
  const rect = canvasEl.getBoundingClientRect();
  return {
    left: rect.left + point.x * zoom,
    top: rect.top + point.y * zoom,
  };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Rectángulo de PANTALLA (no de canvas) que ocupa un objeto de Fabric.js
 * ahora mismo — usado para que el `ContextualToolbar` evite superponerse
 * con el elemento seleccionado y con los demás elementos del diseño
 * (Etapa 14C, sección 6). `getBoundingRect()` ya devuelve el rectángulo
 * REAL (ya rotado/escalado) en el mismo sistema de coordenadas que
 * `canvas.getWidth()/getHeight()` — la misma conversión de escala que ya usa
 * `canvasPointToScreen` para el punto de anclaje se aplica acá.
 */
function objectScreenRect(object: FabricObject, canvasEl: HTMLCanvasElement, zoom: number): Rect {
  const bounding = object.getBoundingRect();
  const topLeft = canvasPointToScreen(canvasEl, zoom, { x: bounding.left, y: bounding.top });
  const bottomRight = canvasPointToScreen(canvasEl, zoom, {
    x: bounding.left + bounding.width,
    y: bounding.top + bounding.height,
  });
  return { left: topLeft.left, top: topLeft.top, right: bottomRight.left, bottom: bottomRight.top };
}

/**
 * Tamaño objetivo para el gesto de Tamaño, a partir de la RAZÓN entre la
 * distancia ACTUAL del puntero al elemento y la distancia que había al
 * EMPEZAR el gesto (`distanceRatio = distanciaAhora / D0`):
 *
 * - `distanceRatio = 1` (el puntero está a la misma distancia que al
 *   empezar, sin importar en qué dirección se haya movido mientras tanto)
 *   da siempre `baseline`.
 * - `distanceRatio > 1` (más LEJOS del elemento que al empezar) crece
 *   EXPONENCIALMENTE hacia `max`.
 * - `distanceRatio < 1` (más CERCA del elemento que al empezar) decae
 *   EXPONENCIALMENTE hacia `min`.
 *
 * Es una RAZÓN, no una resta de píxeles — por eso funciona sin importar
 * cuán lejos del elemento haya caído el botón "Tamaño" (`D0`): alejarse al
 * TRIPLE de esa distancia (`distanceRatio = SIZE_GESTURE_RATIO_RANGE = 3`)
 * siempre llega al máximo, sea `D0` grande o chico. Con una resta de
 * píxeles fija, un `D0` chico (botón cerca del elemento) haría que
 * acercarse lo suficiente para achicar del todo fuera físicamente imposible
 * (el puntero no puede alejarse del elemento en sentido NEGATIVO más allá
 * de superponerse con él) — con la razón, "acercarse a un tercio de la
 * distancia inicial" es alcanzable siempre, sea cual sea `D0`.
 *
 * No usa una dirección fija ni una proyección: `distanceRatio` sale de una
 * distancia euclídea real (`Math.hypot`, ver `handleGesturePointerMove`),
 * así que crece o decae exactamente igual sin importar en qué dirección de
 * pantalla se mueva el puntero — arriba, abajo, diagonal, lo que sea.
 *
 * Reversible: dado un `target` conocido, `distanceRatio` se puede despejar
 * invirtiendo el exponente con logaritmo — no hay pérdida de información en
 * ninguna dirección.
 */
function sizeFromDistanceRatio(baseline: number, min: number, max: number, distanceRatio: number): number {
  if (distanceRatio <= 0 || !Number.isFinite(distanceRatio)) {
    return min;
  }
  if (distanceRatio === 1) {
    return baseline;
  }
  if (distanceRatio > 1) {
    if (baseline >= max) {
      return max;
    }
    const t = Math.min(1, Math.log(distanceRatio) / Math.log(SIZE_GESTURE_RATIO_RANGE));
    const ratio = max / baseline;
    return baseline * Math.pow(ratio, t);
  }
  if (baseline <= min) {
    return min;
  }
  const t = Math.min(1, Math.log(1 / distanceRatio) / Math.log(SIZE_GESTURE_RATIO_RANGE));
  const ratio = min / baseline;
  return baseline * Math.pow(ratio, t);
}

/**
 * Semi-ancho/alto del rectángulo alineado a los ejes que encierra al ícono
 * ya rotado, a una escala dada. Misma fórmula que `getRotatedHalfExtents` en
 * `containment.ts` (deliberadamente duplicada acá, no importada: ese archivo
 * no la exporta y no se toca en esta tarea) — se apoya únicamente en
 * propiedades públicas de Fabric.js (`width`, `height`, `strokeWidth`), las
 * mismas que ya usa `containment.ts` para mantener al ícono dentro de la
 * banda.
 */
function getIconHalfExtents(icon: FabricObject, scale: number, angleDeg: number): { halfWidth: number; halfHeight: number } {
  const strokeWidth = icon.strokeWidth ?? 0;
  const localHalfWidth = ((icon.width ?? 0) + strokeWidth) / 2;
  const localHalfHeight = ((icon.height ?? 0) + strokeWidth) / 2;
  const angleRad = (angleDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(angleRad));
  const sin = Math.abs(Math.sin(angleRad));
  return {
    halfWidth: scale * (localHalfWidth * cos + localHalfHeight * sin),
    halfHeight: scale * (localHalfWidth * sin + localHalfHeight * cos),
  };
}

/**
 * Punto de anclaje (en coordenadas internas del canvas) y dirección de
 * salida (vector unitario desde el centro de la virola) para el elemento
 * seleccionado.
 *
 * Para texto: el bounding box de Fabric.js NO sirve de referencia — una vez
 * que el `IText` tiene un `path` de arco asignado, `.width`/`.height` pasan a
 * describir la geometría del ARCO casi completo (ver el comentario grande de
 * `measureRealTextWidth` en curvedText.ts), no las letras visibles; usarlo
 * ubicaría el menú prácticamente en el centro de la virola. En cambio, el
 * texto se curva siempre cerca de `outerRadius + ANCHOR_MARGIN_PX` — incluso
 * con la libertad radial de esta etapa (ver `TEXT_RADIAL_MARGIN_PX` en
 * curvedText.ts, bastante menor que `ANCHOR_MARGIN_PX`), el glyph nunca pasa
 * de ahí — así que anclar sobre `outerRadius + ANCHOR_MARGIN_PX` sigue
 * siendo geométricamente seguro sin necesitar el bounding box.
 *
 * Para ícono: sí es válido usar su geometría real (posición, escala y
 * rotación actuales) porque `containment.ts` ya demuestra que
 * `width/height/scaleX/angle` la representan fielmente.
 */
function computeAnchor(selection: EditorSelection, canvas: Canvas): { point: { x: number; y: number }; ux: number; uy: number } | null {
  const centerX = VIROLA_CONFIG.width / 2;
  const centerY = VIROLA_CONFIG.height / 2;

  if (selection.type === 'text') {
    const angleRad = (selection.curveOffset * Math.PI) / 180;
    const ux = Math.sin(angleRad);
    const uy = -Math.cos(angleRad);
    const point = angleToPoint(selection.curveOffset, VIROLA_CONFIG.outerRadius + ANCHOR_MARGIN_PX, centerX, centerY);
    return { point, ux, uy };
  }

  if (selection.type === 'icon') {
    const dx = selection.left - centerX;
    const dy = selection.top - centerY;
    const distance = Math.hypot(dx, dy) || 1;
    const ux = dx / distance;
    const uy = dy / distance;

    let reach = 0;
    const active = canvas.getActiveObject();
    if (active) {
      const { halfWidth, halfHeight } = getIconHalfExtents(active, selection.scaleX, selection.rotation);
      reach = halfWidth * Math.abs(ux) + halfHeight * Math.abs(uy);
    }

    const radius = distance + reach + ANCHOR_MARGIN_PX;
    return { point: { x: centerX + ux * radius, y: centerY + uy * radius }, ux, uy };
  }

  return null;
}

function angleFromPivotDeg(pivot: ScreenPoint, clientX: number, clientY: number): number {
  return (Math.atan2(clientY - pivot.top, clientX - pivot.left) * 180) / Math.PI;
}

/** Diferencia angular más corta de `from` a `to`, en el rango (-180, 180]. */
function shortestAngleDeltaDeg(from: number, to: number): number {
  const raw = to - from;
  return ((raw + 180) % 360 + 360) % 360 - 180;
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function ResizeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function RotateIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <polyline points="21 3 21 9 15 9" />
    </svg>
  );
}

function InvertIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="7" y1="20" x2="7" y2="4" />
      <polyline points="4 7 7 4 10 7" />
      <line x1="17" y1="4" x2="17" y2="20" />
      <polyline points="14 17 17 20 20 17" />
    </svg>
  );
}

function FlipHorizontalIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="3" x2="12" y2="21" strokeDasharray="2 3" />
      <polyline points="8 8 4 12 8 16" />
      <polyline points="16 8 20 12 16 16" />
    </svg>
  );
}

function FlipVerticalIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="3" y1="12" x2="21" y2="12" strokeDasharray="2 3" />
      <polyline points="8 8 12 4 16 8" />
      <polyline points="8 16 12 20 16 16" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

/**
 * Menú flotante de controles rápidos: aparece apenas Fabric.js selecciona un
 * texto o un ícono (`selection:created`/`selection:updated`/`mouse:down`
 * sobre el mismo objeto ya activo — ver `useFabricCanvas.ts`,
 * `isContextMenuOpen`) y desaparece al deseleccionar (`selection:cleared`) o
 * al hacer click afuera del menú y del canvas. Es una capa de interacción
 * sobre las acciones que ya existen — no duplica ninguna regla de negocio:
 * tamaño e invertir/espejar/rotar/eliminar llaman siempre a las mismas
 * funciones de `actions.ts` que ya validan y contienen el resultado.
 */
export function ContextualToolbar() {
  const { actions, selection, canvasElRef, isContextMenuOpen, closeContextMenu, openTextEditor } = useEditor();
  const pointerIsCoarse = usePointerIsCoarse();
  const [screenPoint, setScreenPoint] = useState<ScreenPoint | null>(null);
  const [placement, setPlacement] = useState<Placement>('top');
  const menuRef = useRef<HTMLDivElement>(null);
  const menuSizeCacheRef = useRef<Partial<Record<'text' | 'icon', { width: number; height: number }>>>({});
  const gestureRef = useRef<DragGesture | null>(null);
  const scrollDismissTimeoutRef = useRef<number | null>(null);
  const [isScrollDismissing, setIsScrollDismissing] = useState(false);
  /**
   * Espejo en estado de React de "qué gesto está en curso" (o `null`), solo
   * para poder aplicar una clase CSS que apague hover/click de los botones
   * hermanos mientras dura — `gestureRef` (arriba) sigue siendo la única
   * fuente de verdad del gesto en sí (se lee/escribe en cada pointermove sin
   * pasar por React). `setPointerCapture` ya redirige los EVENTOS al botón
   * que inició el gesto, pero no afecta el `:hover` de CSS, que se calcula
   * por posición del cursor sin importar la captura — de ahí que, sin esto,
   * el cursor pasando por encima de Rotar/Invertir/Eliminar los mostraba
   * "iluminados" aunque nunca fueran a recibir el click.
   */
  const [activeGestureKind, setActiveGestureKind] = useState<GestureKind | null>(null);

  /**
   * Etapa 14D, sección 5: mientras dura un gesto táctil de dos dedos
   * (pellizco/rotación de ícono, `useTouchGestures.ts`), la toolbar NO debe
   * reposicionarse — solo al terminar el gesto. `useTouchGestures.ts` avisa
   * este inicio/fin con un `CustomEvent` en `window` (no hay otro canal: ese
   * hook vive fuera de React, a nivel de eventos DOM crudos sobre el
   * canvas). Se escucha siempre (no solo cuando la toolbar está visible) por
   * simplicidad — es un solo booleano, sin costo real de mantenerlo aunque
   * la toolbar esté oculta.
   */
  const [isTouchGestureActive, setIsTouchGestureActive] = useState(false);
  useEffect(() => {
    function handleGestureChange(event: Event): void {
      const detail = (event as CustomEvent<TouchGestureEventDetail>).detail;
      setIsTouchGestureActive(detail.active);
    }
    window.addEventListener(TOUCH_GESTURE_EVENT_NAME, handleGestureChange);
    return () => window.removeEventListener(TOUCH_GESTURE_EVENT_NAME, handleGestureChange);
  }, []);

  const isVisible = isContextMenuOpen && selection.type !== 'none' && !!actions;

  // En mobile el scroll ocurre dentro del cuerpo del editor, mientras que el
  // menú está anclado al viewport. Al desplazar el panel se cierra solamente
  // el menú contextual, conservando la selección y todas sus acciones: un
  // nuevo toque sobre el elemento seleccionado lo abre otra vez en su lugar.
  useEffect(() => {
    const isCompactViewport = pointerIsCoarse || window.innerWidth <= 900;
    if (!isVisible || !isCompactViewport) {
      return;
    }
    const scrollContainer = document.querySelector<HTMLElement>('.editor-page__body');
    if (!scrollContainer) {
      return;
    }
    function dismissForScroll(): void {
      if (scrollDismissTimeoutRef.current !== null) {
        return;
      }
      setIsScrollDismissing(true);
      scrollDismissTimeoutRef.current = window.setTimeout(() => {
        scrollDismissTimeoutRef.current = null;
        closeContextMenu();
        setIsScrollDismissing(false);
      }, 140);
    }
    scrollContainer.addEventListener('scroll', dismissForScroll, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', dismissForScroll);
  }, [isVisible, pointerIsCoarse, closeContextMenu]);

  useEffect(() => () => {
    if (scrollDismissTimeoutRef.current !== null) {
      window.clearTimeout(scrollDismissTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (!isVisible || !actions) {
      setScreenPoint(null);
      return;
    }
    if (isTouchGestureActive) {
      // No recalcular mientras el gesto de dos dedos está en curso — cuando
      // termine, `isTouchGestureActive` vuelve a `false` y este efecto se
      // vuelve a correr solo (está en las dependencias, más abajo),
      // recalculando la posición final una única vez.
      return;
    }
    const canvasEl = canvasElRef.current;
    if (!canvasEl) {
      return;
    }
    const canvas = actions.getCanvas();

    function computePosition(): void {
      if (!canvasEl) {
        return;
      }
      const anchor = computeAnchor(selection, canvas);
      if (!anchor) {
        return;
      }
      const zoom = canvas.getZoom();
      const rawPoint = canvasPointToScreen(canvasEl, zoom, anchor.point);
      const preferred = vectorToPlacement(anchor.ux, anchor.uy);
      const size = menuSizeCacheRef.current[selection.type as 'text' | 'icon'] ?? FALLBACK_MENU_SIZE;
      const viewport = { width: window.innerWidth, height: window.innerHeight };

      // Obstáculos a evitar (Etapa 14C, sección 6): el rectángulo de pantalla
      // del elemento seleccionado (prioridad 1) y el de cada OTRO texto/ícono
      // del diseño (prioridad 2) — nunca las guías/líneas circulares, que no
      // son elementos que el usuario pueda tapar en el sentido de esta regla.
      const activeObject = canvas.getActiveObject();
      const selectedElementRect = activeObject ? objectScreenRect(activeObject, canvasEl, zoom) : undefined;
      const otherElementRects: Rect[] = canvas.getObjects()
        .filter((object) => object !== activeObject && (isTextObject(object) || isIconObject(object)))
        .map((object) => objectScreenRect(object, canvasEl, zoom));

      const { placement: resolvedPlacement, screenPoint: resolvedPoint } = resolveMenuPlacement(rawPoint, preferred, size, viewport, {
        selectedElement: selectedElementRect,
        otherElements: otherElementRects,
      });

      setPlacement(resolvedPlacement);
      setScreenPoint(resolvedPoint);
    }

    computePosition();
    window.addEventListener('resize', computePosition);
    return () => window.removeEventListener('resize', computePosition);
    // selection cambia de referencia en cada render de Fabric, pero acá solo
    // nos importan los campos que realmente afectan la posición (posición,
    // escala y rotación del ícono; posición angular del texto).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isVisible,
    isTouchGestureActive,
    selection.type,
    selection.type === 'text' ? selection.curveOffset : null,
    selection.type === 'icon' ? selection.left : null,
    selection.type === 'icon' ? selection.top : null,
    selection.type === 'icon' ? selection.scaleX : null,
    selection.type === 'icon' ? selection.rotation : null,
  ]);

  // Mide el tamaño real ya renderizado del menú para las próximas veces que
  // haya que decidir si una posición entra en la pantalla — mientras tanto
  // (primera aparición de cada tipo en la sesión) se usa FALLBACK_MENU_SIZE.
  useEffect(() => {
    if (!isVisible || !menuRef.current) {
      return;
    }
    const rect = menuRef.current.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      menuSizeCacheRef.current[selection.type as 'text' | 'icon'] = { width: rect.width, height: rect.height };
    }
  });

  // Cierra el menú si se hace click en cualquier lugar que no sea el propio
  // menú, el canvas, o el contenedor de edición de texto (clicks dentro del
  // canvas ya los maneja Fabric.js — ver `syncSelectionFromCanvas`/
  // `selection:cleared` en useFabricCanvas). Deliberadamente NO deselecciona
  // el objeto de Fabric: si lo hiciera, un click en un campo del panel
  // lateral (para escribir el contenido del texto, por ejemplo) haría
  // desaparecer también ese panel a mitad de uso.
  //
  // El contenedor de edición (`.text-editor-panel`, ver TextEditorPanel) se
  // excluye igual que el menú y el canvas: es la superficie donde ahora vive
  // la edición de contenido (botón "Editar"), y el requisito explícito de
  // esa función es que cerrarla (o interactuar con cualquiera de sus campos)
  // NO oculte el toolbar — el usuario sigue pudiendo usar Tamaño/Invertir/
  // Eliminar inmediatamente después, sin tener que reclickear el texto.
  useEffect(() => {
    if (!isVisible) {
      return;
    }
    function handlePointerDown(event: PointerEvent): void {
      const target = event.target as Node;
      const menuEl = document.getElementById('contextual-toolbar');
      const canvasEl = canvasElRef.current;
      const textEditorEl = document.querySelector('.text-editor-panel');
      if (menuEl?.contains(target)) {
        return;
      }
      if (canvasEl?.contains(target)) {
        return;
      }
      if (textEditorEl?.contains(target)) {
        return;
      }
      closeContextMenu();
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isVisible, canvasElRef, closeContextMenu]);

  function endGesture(event: ReactPointerEvent<HTMLButtonElement>): void {
    if (gestureRef.current?.pointerId === event.pointerId) {
      gestureRef.current = null;
    }
    // Sin condicionar al pointerId: da igual si ya estaba en null (React no
    // vuelve a renderizar por asignar el mismo valor) — importa más que
    // CUALQUIER camino de salida del gesto (up, cancel, o pérdida de
    // captura) apague la clase CSS, así los botones hermanos nunca quedan
    // inertes "colgados" por un caso raro que no coincida el pointerId.
    setActiveGestureKind(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  /**
   * Arranca un gesto de tamaño (texto o ícono): el punto de referencia
   * (`anchor`, ver `DragGesture`) es el elemento mismo, en pantalla — el
   * centro real del ícono, o el punto del texto sobre el anillo a su
   * `curveOffset` actual — NUNCA el `pointerdown`. Como el botón "Tamaño"
   * siempre está separado del elemento (por su propio tamaño y por
   * `ANCHOR_MARGIN_PX`), la distancia del `pointerdown` a ese punto
   * (`initialDistance`, "D0") es mayor a cero — eso es lo que permite que
   * "más cerca"/"más lejos" tengan sentido desde el primer píxel de
   * movimiento, en cualquier dirección (ver el comentario grande de
   * `DragGesture` y de `sizeFromDistanceRatio`).
   *
   * `baseline`/`min`/`max` se leen UNA sola vez acá, del estado REAL del
   * elemento en este instante — nunca de un gesto anterior (ver el
   * comentario grande de `DragGesture`). Para texto, `max` es el techo
   * geométrico real (puede ser mayor a lo que el elemento mide ahora mismo);
   * para ícono, es el máximo válido permitiendo reacomodar el centro (ver
   * `getMaxValidIconScale`, containment.ts).
   */
  function handleSizePointerDown(event: ReactPointerEvent<HTMLButtonElement>): void {
    if (!actions || selection.type === 'none') {
      return;
    }
    const canvasEl = canvasElRef.current;
    if (!canvasEl) {
      return;
    }
    const canvas = actions.getCanvas();
    let kind: GestureKind;
    let baseline: number;
    let min: number;
    let max: number;
    let anchor: ScreenPoint;

    if (selection.type === 'text') {
      kind = 'text-size';
      baseline = selection.desiredFontSize;
      min = MIN_FONT_SIZE;
      max = getEffectiveMaxFontSize(VIROLA_CONFIG);
      const centerX = VIROLA_CONFIG.width / 2;
      const centerY = VIROLA_CONFIG.height / 2;
      const point = angleToPoint(selection.curveOffset, VIROLA_CONFIG.textCurveRadius, centerX, centerY);
      anchor = canvasPointToScreen(canvasEl, canvas.getZoom(), point);
    } else if (selection.type === 'icon') {
      const activeIcon = actions.getCanvas().getActiveObject();
      if (!activeIcon) {
        return;
      }
      kind = 'icon-size';
      baseline = selection.scaleX;
      min = MIN_ICON_SCALE;
      max = getMaxValidIconScale(activeIcon, VIROLA_CONFIG);
      anchor = canvasPointToScreen(canvasEl, canvas.getZoom(), { x: selection.left, y: selection.top });
    } else {
      return;
    }

    // D0: distancia real del pointerdown al elemento — nunca 0 (ver el
    // comentario grande de arriba). El respaldo (1px) es solo defensivo
    // para el caso extremo/imposible de un click exactamente sobre el
    // punto de referencia (evita dividir por cero en el próximo frame).
    const initialDistance = Math.hypot(event.clientX - anchor.left, event.clientY - anchor.top) || 1;

    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = { kind, pointerId: event.pointerId, anchor, last: 0, baseline, min, max, initialDistance };
    setActiveGestureKind(kind);
    event.preventDefault();
  }

  function handleRotatePointerDown(event: ReactPointerEvent<HTMLButtonElement>): void {
    if (!actions || selection.type !== 'icon') {
      return;
    }
    const canvasEl = canvasElRef.current;
    if (!canvasEl) {
      return;
    }
    const canvas = actions.getCanvas();
    const pivot = canvasPointToScreen(canvasEl, canvas.getZoom(), { x: selection.left, y: selection.top });
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = {
      kind: 'icon-rotate',
      pointerId: event.pointerId,
      anchor: pivot,
      last: angleFromPivotDeg(pivot, event.clientX, event.clientY),
      // baseline/min/max/initialDistance no los usa la rotación (ver el
      // comentario grande de DragGesture) — valores dummy solo para
      // satisfacer el tipo.
      baseline: 0,
      min: 0,
      max: 0,
      initialDistance: 1,
    };
    setActiveGestureKind('icon-rotate');
    event.preventDefault();
  }

  function handleGesturePointerMove(event: ReactPointerEvent<HTMLButtonElement>): void {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || !actions) {
      return;
    }

    if (gesture.kind === 'icon-rotate') {
      const currentAngle = angleFromPivotDeg(gesture.anchor, event.clientX, event.clientY);
      const deltaDeg = shortestAngleDeltaDeg(gesture.last, currentAngle);
      gesture.last = currentAngle;
      actions.rotateSelectedIcon(deltaDeg);
      return;
    }

    // Distancia REAL (euclídea, en cualquier dirección) del puntero al
    // elemento (`gesture.anchor`) en este frame, comparada como RAZÓN contra
    // la distancia que había al empezar el gesto (`gesture.initialDistance`,
    // "D0"). Nunca un delta respecto del frame anterior — se recalcula
    // entera cada vez, a partir de `baseline`/`min`/`max`/`initialDistance`
    // (fijados al empezar el gesto) y la posición ACTUAL del puntero, así
    // que da igual cuántos frames pasaron o si alguno se saltó, y no
    // importa en qué dirección de pantalla se mueva: solo importa qué tan
    // lejos o cerca del elemento queda.
    const currentDistance = Math.hypot(event.clientX - gesture.anchor.left, event.clientY - gesture.anchor.top);
    const distanceRatio = currentDistance / gesture.initialDistance;
    const target = clampNumber(
      sizeFromDistanceRatio(gesture.baseline, gesture.min, gesture.max, distanceRatio),
      gesture.min,
      gesture.max,
    );

    if (gesture.kind === 'text-size') {
      actions.setSelectedTextFontSize(target);
    } else if (gesture.kind === 'icon-size') {
      actions.setSelectedIconScale(target);
    }
  }

  if (!isVisible || !screenPoint || !actions) {
    return null;
  }

  const style = { left: screenPoint.left, top: screenPoint.top };
  const gestureProps = {
    onPointerMove: handleGesturePointerMove,
    onPointerUp: endGesture,
    onPointerCancel: endGesture,
    onLostPointerCapture: endGesture,
  };
  // Mientras hay un gesto en curso, el contenedor gana esta clase (ver
  // ContextualToolbar.css: apaga pointer-events — y con eso, hover y click —
  // de todos los botones EXCEPTO el que efectivamente inició el gesto,
  // marcado con `--gesture-active` más abajo. Sin esto, mover el cursor
  // sobre Rotar/Invertir/Espejar mientras se arrastra Tamaño los ilumina
  // (el `:hover` de CSS depende de la posición del cursor, no de quién
  // capturó el pointer) y, en teoría, podría llegar a disparar su click.
  const gestureActiveClass = activeGestureKind ? ' contextual-toolbar--gesture-active' : '';
  const scrollDismissingClass = isScrollDismissing ? ' contextual-toolbar--leaving' : '';
  const isSizeGestureActive = activeGestureKind === 'text-size' || activeGestureKind === 'icon-size';
  const isRotateGestureActive = activeGestureKind === 'icon-rotate';

  if (selection.type === 'text') {
    return (
      <div id="contextual-toolbar" ref={menuRef} className={`contextual-toolbar contextual-toolbar--${placement}${gestureActiveClass}${scrollDismissingClass}`} style={style}>
        <button
          type="button"
          className="contextual-toolbar__btn"
          aria-label="Editar el contenido del texto"
          title="Editar"
          onClick={openTextEditor}
        >
          <EditIcon />
        </button>
        {/*
          Etapa 17, sección B: en un dispositivo de puntero "coarse" (touch
          primario — ver `usePointerIsCoarse`, mismo criterio ya usado para
          ocultar Tamaño/Rotar de íconos en la Etapa 14C), el tamaño del
          texto pasa a hacerse exclusivamente con el gesto de dos dedos
          sobre el propio texto (`useTouchGestures.ts`) — este botón (que
          arrastra con UN dedo) quedaría redundante y, peor, en conflicto
          con ese gesto. En desktop/mouse (`pointerIsCoarse === false`) sigue
          exactamente igual que siempre: mismo comportamiento aprobado, sin
          cambios — no hay pellizco posible con un mouse.
        */}
        {!pointerIsCoarse && (
          <button
            type="button"
            className={`contextual-toolbar__btn contextual-toolbar__btn--gesture${isSizeGestureActive ? ' contextual-toolbar__btn--gesture-active' : ''}`}
            aria-label="Tamaño del texto: mantené presionado y arrastrá para agrandar o achicar"
            title="Tamaño (arrastrar)"
            onPointerDown={handleSizePointerDown}
            {...gestureProps}
          >
            <ResizeIcon />
          </button>
        )}
        <button
          type="button"
          className={`contextual-toolbar__btn${selection.inverted ? ' contextual-toolbar__btn--active' : ''}`}
          aria-label="Invertir dirección del texto"
          title="Invertir"
          onClick={() => actions.setSelectedTextInverted(!selection.inverted)}
        >
          <InvertIcon />
        </button>
        <button
          type="button"
          className="contextual-toolbar__btn contextual-toolbar__btn--danger"
          aria-label="Eliminar texto"
          title="Eliminar"
          onClick={() => {
            actions.removeSelectedObject();
            closeContextMenu();
          }}
        >
          <TrashIcon />
        </button>
      </div>
    );
  }

  return (
    <div id="contextual-toolbar" ref={menuRef} className={`contextual-toolbar contextual-toolbar--${placement}${gestureActiveClass}${scrollDismissingClass}`} style={style}>
      {/*
        Etapa 14C, sección 7: en un dispositivo de puntero "coarse" (touch
        primario — ver `usePointerIsCoarse`), el tamaño y la rotación del
        ícono pasan a hacerse exclusivamente con el gesto de dos dedos sobre
        el propio ícono (`useTouchGestures.ts`) — estos dos botones (que
        arrastran con UN dedo) quedarían redundantes y, peor, en conflicto
        con ese gesto. En desktop/mouse (`pointerIsCoarse === false`) siguen
        exactamente igual que siempre: mismo comportamiento aprobado, sin
        cambios.
      */}
      {!pointerIsCoarse && (
        <>
          <button
            type="button"
            className={`contextual-toolbar__btn contextual-toolbar__btn--gesture${isSizeGestureActive ? ' contextual-toolbar__btn--gesture-active' : ''}`}
            aria-label="Tamaño del ícono: mantené presionado y arrastrá para agrandar o achicar"
            title="Tamaño (arrastrar)"
            onPointerDown={handleSizePointerDown}
            {...gestureProps}
          >
            <ResizeIcon />
          </button>
          <button
            type="button"
            className={`contextual-toolbar__btn contextual-toolbar__btn--gesture${isRotateGestureActive ? ' contextual-toolbar__btn--gesture-active' : ''}`}
            aria-label="Rotación del ícono: mantené presionado y arrastrá alrededor para girarlo"
            title="Rotar (arrastrar)"
            onPointerDown={handleRotatePointerDown}
            {...gestureProps}
          >
            <RotateIcon />
          </button>
        </>
      )}
      <button
        type="button"
        className={`contextual-toolbar__btn${selection.flipX ? ' contextual-toolbar__btn--active' : ''}`}
        aria-label="Espejar horizontalmente"
        title="Espejar horizontal"
        onClick={() => actions.setSelectedIconFlipX(!selection.flipX)}
      >
        <FlipHorizontalIcon />
      </button>
      <button
        type="button"
        className={`contextual-toolbar__btn${selection.flipY ? ' contextual-toolbar__btn--active' : ''}`}
        aria-label="Invertir verticalmente"
        title="Espejar vertical"
        onClick={() => actions.setSelectedIconFlipY(!selection.flipY)}
      >
        <FlipVerticalIcon />
      </button>
      <button
        type="button"
        className="contextual-toolbar__btn contextual-toolbar__btn--danger"
        aria-label="Eliminar ícono"
        title="Eliminar"
        onClick={() => {
          actions.removeSelectedObject();
          closeContextMenu();
        }}
      >
        <TrashIcon />
      </button>
    </div>
  );
}
