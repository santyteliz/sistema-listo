/**
 * Tests de `touchGestures.ts` — Etapa 14D (selección por un toque) + Etapa
 * 14C (pinch/rotación de dos dedos para íconos, sin cambios) + Etapa 17
 * (pinch de dos dedos para texto: solo `clampPinchValue` es código nuevo acá
 * — el resto de la generalización vive en `useTouchGestures.ts`, DOM-
 * dependiente y por eso verificada en navegador real, no acá), exclusivo de
 * touch.
 *
 * Correr: `npx tsx --test src/editor/canvas/touchGestures.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveTouchSelectionAction, shortestAngleDeltaDeg, angleBetweenPointsDeg,
  distanceBetweenPoints, pinchScale, clampPinchValue,
} from './touchGestures.ts';

// --- resolveTouchSelectionAction: selección por un toque (Etapa 14D, sección 2) ---

test('resolveTouchSelectionAction: tocar un elemento con nada seleccionado -> selecciona', () => {
  assert.equal(resolveTouchSelectionAction('icon-a', undefined), 'select');
});

test('resolveTouchSelectionAction: tocar OTRO elemento con uno ya seleccionado -> cambia la selección directo (sin paso intermedio)', () => {
  assert.equal(resolveTouchSelectionAction('icon-b', 'icon-a'), 'select');
});

test('resolveTouchSelectionAction: tocar una zona vacía con algo seleccionado -> deselecciona', () => {
  assert.equal(resolveTouchSelectionAction(undefined, 'icon-a'), 'deselect');
});

test('resolveTouchSelectionAction: tocar una zona vacía sin nada seleccionado -> no hace nada (no hay de qué deseleccionar)', () => {
  assert.equal(resolveTouchSelectionAction(undefined, undefined), 'none');
});

test('resolveTouchSelectionAction: tocar el elemento YA seleccionado -> "none" (se deja pasar para que Fabric.js arranque el arrastre normal)', () => {
  assert.equal(resolveTouchSelectionAction('icon-a', 'icon-a'), 'none');
});

// --- Rotación de dos dedos (Etapa 14C, sin cambios en la Etapa 14D) ---

test('shortestAngleDeltaDeg: un giro horario da un delta positivo', () => {
  assert.equal(shortestAngleDeltaDeg(0, 10), 10);
});

test('shortestAngleDeltaDeg: un giro antihorario da un delta negativo', () => {
  assert.equal(shortestAngleDeltaDeg(10, 0), -10);
});

test('shortestAngleDeltaDeg: cruzar el límite ±180° toma el camino corto', () => {
  assert.equal(shortestAngleDeltaDeg(179, -179), 2);
});

test('angleBetweenPointsDeg + distanceBetweenPoints: giro horario de la barra entre dos dedos da ángulo creciente', () => {
  // Dos dedos horizontales (barra apuntando a la derecha, 0°)...
  const angleBefore = angleBetweenPointsDeg(0, 0, 100, 0);
  // ...girando en sentido horario (el segundo dedo baja) -> ángulo aumenta.
  const angleAfter = angleBetweenPointsDeg(0, 0, 90, 40);
  const delta = shortestAngleDeltaDeg(angleBefore, angleAfter);
  assert.ok(delta > 0, `se esperaba un delta positivo (horario), dio ${delta}`);
});

test('angleBetweenPointsDeg + distanceBetweenPoints: giro antihorario da ángulo decreciente', () => {
  const angleBefore = angleBetweenPointsDeg(0, 0, 100, 0);
  const angleAfter = angleBetweenPointsDeg(0, 0, 90, -40);
  const delta = shortestAngleDeltaDeg(angleBefore, angleAfter);
  assert.ok(delta < 0, `se esperaba un delta negativo (antihorario), dio ${delta}`);
});

test('distanceBetweenPoints: mide la apertura real entre los dos dedos', () => {
  assert.equal(distanceBetweenPoints(0, 0, 3, 4), 5);
});

// --- Pellizco / escala (Etapa 14C, sin cambios en la Etapa 14D) ---

test('pinchScale: dedos alejándose (currentDistance > startDistance) aumenta la escala', () => {
  const result = pinchScale(0.5, 100, 200);
  assert.ok(result > 0.5, `se esperaba escala mayor a 0.5, dio ${result}`);
  assert.equal(result, 1); // el doble de distancia -> el doble de escala, razón directa
});

test('pinchScale: dedos acercándose (currentDistance < startDistance) reduce la escala', () => {
  const result = pinchScale(1, 100, 50);
  assert.equal(result, 0.5);
});

test('pinchScale: sin cambio de distancia, la escala no cambia', () => {
  assert.equal(pinchScale(0.7, 150, 150), 0.7);
});

test('pinchScale: no produce saltos — la salida es proporcional y continua respecto de la distancia actual', () => {
  const baseline = 0.6;
  const start = 120;
  const samples = [110, 115, 120, 125, 130, 140].map((d) => pinchScale(baseline, start, d));
  for (let i = 1; i < samples.length; i++) {
    assert.ok(samples[i] >= samples[i - 1], 'la escala debe crecer monótonamente con la distancia, sin saltos hacia atrás');
  }
});

test('pinchScale: distancia inicial degenerada (0) no produce NaN/Infinity — devuelve el baseline sin cambios', () => {
  const result = pinchScale(0.5, 0, 100);
  assert.equal(result, 0.5);
  assert.ok(Number.isFinite(result));
});

// --- clampPinchValue: piso/techo del pellizco (Etapa 17, sección B3 — reutilizado tal cual por texto e íconos) ---

test('clampPinchValue: un valor dentro del rango no se toca', () => {
  assert.equal(clampPinchValue(25, 16, 80), 25);
});

test('clampPinchValue: un valor que supera el máximo se recorta AL máximo, no más allá', () => {
  assert.equal(clampPinchValue(500, 16, 80), 80);
});

test('clampPinchValue: un valor por debajo del mínimo se recorta AL mínimo, no menos', () => {
  assert.equal(clampPinchValue(-5, 16, 80), 16);
  assert.equal(clampPinchValue(0.001, 0.2, 3), 0.2);
});

test('clampPinchValue: exactamente en el mínimo o el máximo se deja tal cual (bordes inclusive)', () => {
  assert.equal(clampPinchValue(16, 16, 80), 16);
  assert.equal(clampPinchValue(80, 16, 80), 80);
});

test('clampPinchValue: funciona igual para unidades de escala de ícono (factores chicos, ej. 0.2-3) que para tamaño de texto en px (ej. 16-96) — es agnóstica a la unidad', () => {
  // Escala de ícono: rango típico chico.
  assert.equal(clampPinchValue(10, 0.2, 3), 3);
  // Tamaño de texto: rango típico en píxeles, ordenes de magnitud distintos.
  assert.equal(clampPinchValue(10, 16, 96), 16);
});
