/**
 * Tests de `contextualMenuPlacement.ts` — Etapa 14B (mobile): corrige el bug
 * de la Etapa 14B en el que el `ContextualToolbar` podía renderizarse
 * PARCIAL o TOTALMENTE fuera de la pantalla en viewports angostos (~390px,
 * confirmado con touch real emulado en Chrome — ver el informe de la Etapa
 * 14B), porque el código anterior solo acotaba el punto de anclaje al
 * viewport, nunca el rectángulo real del menú (que se dibuja desplazado de
 * ese punto según `placement`).
 *
 * Correr: `npx tsx --test src/editor/panels/contextualMenuPlacement.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveMenuPlacement, menuRectFor, vectorToPlacement, type Rect } from './contextualMenuPlacement.ts';

const SIZE = { width: 220, height: 48 };
const DESKTOP_VIEWPORT = { width: 1400, height: 1000 };
const NARROW_VIEWPORT = { width: 390, height: 844 };

test('resolveMenuPlacement: si la posición preferida ya entra en pantalla, no cambia nada (caso normal de desktop)', () => {
  // Anclaje bien adentro de una pantalla grande: "top" (el menú se dibuja
  // arriba y centrado del punto) entra sin problema.
  const rawPoint = { left: 700, top: 500 };
  const result = resolveMenuPlacement(rawPoint, 'top', SIZE, DESKTOP_VIEWPORT);
  assert.equal(result.placement, 'top');
  assert.deepEqual(result.screenPoint, rawPoint);
});

test('resolveMenuPlacement: reproduce el bug — un ancla cerca del borde derecho en un viewport angosto no debe dejar el menú fuera de pantalla', () => {
  // Mismo escenario medido en Chrome real (Etapa 14B): el texto quedó cerca
  // del borde derecho de un canvas casi tan ancho como la pantalla, y la
  // dirección de salida (ux, uy) apuntaba hacia la derecha — "right" es la
  // posición preferida, que necesita 220px libres a la derecha del ancla.
  const rawPoint = { left: 374, top: 173 }; // cerca del borde derecho de 390px
  const preferred = vectorToPlacement(1, 0); // apunta a la derecha -> "right"
  const result = resolveMenuPlacement(rawPoint, preferred, SIZE, NARROW_VIEWPORT);

  const finalRect = menuRectFor(result.screenPoint, result.placement, SIZE);
  assert.ok(finalRect.left >= 0, `el menú no debe empezar antes del borde izquierdo (left=${finalRect.left})`);
  assert.ok(finalRect.right <= NARROW_VIEWPORT.width, `el menú no debe salir por la derecha (right=${finalRect.right}, viewport=${NARROW_VIEWPORT.width})`);
  assert.ok(finalRect.top >= 0, `el menú no debe empezar antes del borde superior (top=${finalRect.top})`);
  assert.ok(finalRect.bottom <= NARROW_VIEWPORT.height, `el menú no debe salir por abajo (bottom=${finalRect.bottom})`);
});

test('resolveMenuPlacement: con el ancla en una esquina extrema, elige la posición de menor desborde y corrige el punto para que el menú quede íntegro en pantalla', () => {
  // Esquina superior izquierda de un viewport chico: ninguna de las 8
  // posiciones candidatas entra "perfecta" sin corrección si el elemento
  // está pegado al borde — el resultado tiene que seguir siendo válido.
  const rawPoint = { left: 5, top: 5 };
  const result = resolveMenuPlacement(rawPoint, 'top-left', SIZE, NARROW_VIEWPORT);
  const finalRect = menuRectFor(result.screenPoint, result.placement, SIZE);
  assert.ok(finalRect.left >= 0 && finalRect.right <= NARROW_VIEWPORT.width, 'el menú debe quedar dentro del ancho del viewport');
  assert.ok(finalRect.top >= 0 && finalRect.bottom <= NARROW_VIEWPORT.height, 'el menú debe quedar dentro del alto del viewport');
});

test('resolveMenuPlacement: el menú nunca queda más grande que el viewport en sí (el tamaño del menú no se toca, solo su posición)', () => {
  const rawPoint = { left: 0, top: 0 };
  const result = resolveMenuPlacement(rawPoint, 'bottom-right', SIZE, NARROW_VIEWPORT);
  const finalRect = menuRectFor(result.screenPoint, result.placement, SIZE);
  assert.equal(finalRect.right - finalRect.left, SIZE.width);
  assert.equal(finalRect.bottom - finalRect.top, SIZE.height);
});

// --- Etapa 14C, sección 6: evitar el elemento seleccionado y otros elementos ---

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

test('resolveMenuPlacement: sin obstáculos, el comportamiento es idéntico al de la Etapa 14B (no cambia nada)', () => {
  const rawPoint = { left: 700, top: 500 };
  const withoutObstacles = resolveMenuPlacement(rawPoint, 'top', SIZE, DESKTOP_VIEWPORT);
  const withEmptyObstacles = resolveMenuPlacement(rawPoint, 'top', SIZE, DESKTOP_VIEWPORT, {});
  assert.deepEqual(withEmptyObstacles, withoutObstacles);
});

test('resolveMenuPlacement: si la posición preferida se superpone con el elemento seleccionado, elige otra que no se superponga (habiendo alternativa)', () => {
  const rawPoint = { left: 700, top: 500 };
  // Ancho a propósito para tapar SOLO las posiciones "de arriba" (top,
  // top-right, top-left) y "de al lado" (right, left) del punto de anclaje
  // — nunca las "de abajo" (bottom, bottom-right, bottom-left), que
  // arrancan justo en top=500 (el borde inferior del obstáculo).
  const selectedElement: Rect = { left: 400, top: 440, right: 1000, bottom: 500 };
  const result = resolveMenuPlacement(rawPoint, 'top', SIZE, DESKTOP_VIEWPORT, { selectedElement });
  const finalRect = menuRectFor(result.screenPoint, result.placement, SIZE);
  assert.equal(overlaps(finalRect, selectedElement), false, `la posición elegida (${result.placement}) no debería superponerse con el elemento seleccionado`);
});

test('resolveMenuPlacement: si TODAS las posiciones se superponen con algo, prioriza no tapar el elemento seleccionado antes que no tapar otro elemento', () => {
  const rawPoint = { left: 700, top: 500 };
  // El elemento seleccionado tapa la mitad "de arriba" del círculo de
  // posiciones; otro elemento del diseño tapa la mitad "de abajo" — ninguna
  // posición queda completamente libre, así que hay que elegir con qué
  // obstáculo quedarse.
  const selectedElement: Rect = { left: 400, top: 440, right: 1000, bottom: 500 };
  const otherElement: Rect = { left: 400, top: 500, right: 1000, bottom: 560 };
  const result = resolveMenuPlacement(rawPoint, 'top', SIZE, DESKTOP_VIEWPORT, { selectedElement, otherElements: [otherElement] });
  const finalRect = menuRectFor(result.screenPoint, result.placement, SIZE);
  assert.equal(overlaps(finalRect, selectedElement), false, 'no debe superponerse con el elemento seleccionado (prioridad 1), aunque eso implique superponerse con otro elemento (prioridad 2)');
});

test('resolveMenuPlacement: evita otros elementos del diseño cuando existe una posición alternativa libre', () => {
  const rawPoint = { left: 700, top: 500 };
  const otherElement: Rect = { left: 400, top: 440, right: 1000, bottom: 500 };
  const result = resolveMenuPlacement(rawPoint, 'top', SIZE, DESKTOP_VIEWPORT, { otherElements: [otherElement] });
  const finalRect = menuRectFor(result.screenPoint, result.placement, SIZE);
  assert.equal(overlaps(finalRect, otherElement), false);
});
