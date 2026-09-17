/**
 * Lógica pura para touch/mobile: selección por un solo toque (Etapa 14D) y
 * pinch de dos dedos, para íconos (escala + rotación, Etapa 14C) y para
 * texto (Etapa 17: solo escala — el texto nunca rota libremente, ver
 * `useTouchGestures.ts`). Separada de `useTouchGestures.ts` (que conecta
 * esto a eventos DOM reales sobre el canvas) para poder testearla en Node
 * sin simular touch events de verdad — ver `touchGestures.test.ts`.
 *
 * Etapa 14D: se retiró el sistema de doble toque de la Etapa 14C
 * (`isValidTap`/`isDoubleTap`/`TapRecord`/las constantes `TAP_*`/`DOUBLE_TAP_*`)
 * — probado físicamente en iPhone, resultó incómodo en uso real. Lo
 * reemplaza `resolveTouchSelectionAction`, más abajo: la misma protección
 * contra selección accidental durante un pellizco de dos dedos se logra
 * ahora de otra forma (ver el informe de la Etapa 14D) — nunca comparando
 * dos toques separados en el tiempo.
 */

/**
 * A qué tipo de elemento aplica un gesto de pellizco de dos dedos —
 * `'icon'` (escala + rotación, sin cambios desde la Etapa 14C) o `'text'`
 * (Etapa 17: solo escala, nunca rotación — ver el comentario grande de
 * `useTouchGestures.ts` sobre por qué el texto no rota con este gesto).
 */
export type PinchTargetKind = 'icon' | 'text';

/**
 * Qué hacer con la selección de Fabric.js ante un toque de UN dedo, dado el
 * objeto que hay debajo del dedo (`target`, `undefined` si es zona vacía) y
 * cuál es el objeto activo ANTES de este toque (`activeObject`, `undefined`
 * si no había ninguno). Pura — no consulta `canvas`/DOM, así que sabe
 * "seleccionar a quién" sin necesitar los tipos de Fabric.
 *
 * - `target === activeObject` (incluido el caso "los dos son `undefined`",
 *   es decir, tocar una zona vacía sin nada seleccionado): 'none' — no hay
 *   nada que cambiar. Cuando SÍ había un objeto activo y se tocó ESE MISMO
 *   objeto, 'none' es intencional: significa "dejalo pasar tal cual", para
 *   que Fabric.js arranque su arrastre normal sobre el objeto ya
 *   seleccionado (mover texto/ícono) — ver `useTouchGestures.ts`.
 * - `target` es una zona vacía (`undefined`) y SÍ había algo seleccionado:
 *   'deselect'.
 * - `target` es un objeto distinto al activo: 'select' (sin importar si
 *   había algo seleccionado antes — cambia directo, sin paso intermedio).
 */
export type TouchSelectionAction = 'none' | 'deselect' | 'select';

export function resolveTouchSelectionAction(target: unknown, activeObject: unknown): TouchSelectionAction {
  if (target === activeObject) {
    return 'none';
  }
  if (!target) {
    return 'deselect';
  }
  return 'select';
}

/** Diferencia angular más corta de `from` a `to`, en el rango (-180, 180]. Compartida con el gesto de rotación de un dedo (ver ContextualToolbar.tsx) — misma fórmula, no una copia nueva. */
export function shortestAngleDeltaDeg(from: number, to: number): number {
  const raw = to - from;
  return ((raw + 180) % 360 + 360) % 360 - 180;
}

/** Ángulo (grados) de la línea que conecta dos puntos de pantalla — "la barra" entre los dos dedos de un gesto de pellizco/rotación. */
export function angleBetweenPointsDeg(ax: number, ay: number, bx: number, by: number): number {
  return (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
}

/** Distancia euclídea entre dos puntos de pantalla — la "apertura" del pellizco. */
export function distanceBetweenPoints(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

/**
 * Escala objetivo para un gesto de pellizco (pinch), a partir de la RAZÓN
 * entre la distancia ACTUAL entre los dos dedos y la distancia que había al
 * EMPEZAR el gesto — el mismo principio que el zoom de foto nativo de
 * cualquier celular: separar los dedos al doble de la distancia inicial
 * duplica el tamaño; juntarlos a la mitad lo reduce a la mitad.
 *
 * A propósito NO reutiliza `sizeFromDistanceRatio` (la curva exponencial del
 * gesto de un solo dedo en `ContextualToolbar.tsx`): esa fórmula existe para
 * resolver un problema que el pellizco no tiene — ahí la distancia se mide
 * desde un ÚNICO punto de referencia fijo (el botón "Tamaño", separado del
 * elemento) y el `t` logarítmico sirve para que "alejarse/acercarse una
 * fracción fija de esa distancia inicial" alcance el mínimo/máximo aunque esa
 * distancia sea chica o grande. El pellizco, en cambio, ya tiene DOS puntos
 * de referencia (los dos dedos) y una convención universal ya aprendida por
 * cualquier usuario de celular — una razón MULTIPLICATIVA directa (sin curva
 * exponencial) es lo que se espera y lo que se siente "1:1" con el gesto.
 *
 * Lo que SÍ se reutiliza sin cambios es el límite/containment real: el
 * resultado de esta función se pasa tal cual a `actions.setSelectedIconScale`
 * (la misma función que ya usaba el botón de arrastre), que internamente
 * sigue llamando a `clampIconPosition`/`clampIconScale` — el pellizco nunca
 * puede sacar al ícono de la banda ni superar `getMaxValidIconScale`, exactamente
 * igual que antes.
 */
export function pinchScale(baselineScale: number, startDistance: number, currentDistance: number): number {
  if (startDistance <= 0 || !Number.isFinite(currentDistance) || currentDistance < 0) {
    return baselineScale;
  }
  return baselineScale * (currentDistance / startDistance);
}

/**
 * Etapa 17 — extraída del cálculo que ya hacía el pellizco de íconos
 * (`Math.min(gesture.maxScale, Math.max(MIN_ICON_SCALE, rawTargetScale))`,
 * antes escrito una sola vez a mano en `useTouchGestures.ts`) para
 * reutilizarla tal cual con el pellizco de texto: "si el pellizco pide más
 * que el máximo, quedarse en el máximo; si pide menos que el mínimo,
 * quedarse en el mínimo" es EXACTAMENTE la misma regla para escala de ícono
 * (unidad: factor de escala) que para tamaño de texto (unidad: px de
 * `desiredFontSize`) — el pinch nunca sabe ni le importa en qué unidad está
 * trabajando, solo que hay un piso y un techo que nunca debe cruzar.
 */
export function clampPinchValue(rawValue: number, minValue: number, maxValue: number): number {
  return Math.min(maxValue, Math.max(minValue, rawValue));
}

/**
 * Nombre del evento custom que `useTouchGestures.ts` dispara en `window`
 * mientras dura un gesto de dos dedos (pellizco/rotación) — Etapa 14D,
 * sección 5: el `ContextualToolbar` lo escucha para NO reposicionarse
 * mientras el gesto está en curso (solo al terminar). Es un `CustomEvent`
 * nativo del navegador, no una librería — un solo nombre compartido para no
 * repetir el string literal en los dos archivos.
 */
export const TOUCH_GESTURE_EVENT_NAME = 'mateshop:touch-gesture-change';

export interface TouchGestureEventDetail {
  active: boolean;
}
