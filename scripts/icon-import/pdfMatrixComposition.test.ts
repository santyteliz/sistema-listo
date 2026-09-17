/**
 * Tests de regresión — Etapa 7C (corrección del bug de composición de
 * matrices en `pdfToPaths.ts`, diagnosticado en las Etapas 7A/7B sobre
 * `FUTBOL_56.pdf`).
 *
 * Estos tests demuestran que el USO REAL de `multiply()` en
 * `pdfToPaths.ts` (los dos call sites: acumulación de `cm` y combinación
 * CTM+viewport) produce el resultado matemáticamente correcto — no que
 * `multiply()` "por sí sola" haga o deje de hacer algo. La función interna
 * NO se modificó (ver la Etapa 7C, Parte 1: se eligió la opción de menor
 * superficie de cambio, corrigiendo el orden de argumentos en el único
 * call site que estaba mal, sin tocar la fórmula de `multiply()`) — lo que
 * cambió fue el orden en que `pdfToPaths.ts` la llama para combinar CTM
 * con viewport.
 *
 * REFERENCIA MATEMÁTICA INDEPENDIENTE (derivada desde cero, no copiada del
 * código bajo test): un punto (x,y) en convención PDF/SVG se representa
 * como vector fila [x y 1] y una matriz afín (a,b,c,d,e,f) como la 3x3:
 *
 *   | a b 0 |
 *   | c d 0 |
 *   | e f 1 |
 *
 * Si M1 se aplica PRIMERO y M2 DESPUÉS, la matriz combinada que aplicada
 * UNA sola vez da el mismo resultado que aplicar M1 y luego M2 es el
 * producto matricial M1×M2 (M1 como factor IZQUIERDO) — así compone su
 * propia CTM el operador `cm` de PDF (pre-concatenación: "aplicar la
 * transformación nueva antes que la CTM que ya había"). Multiplicando
 * M1×M2 término a término:
 *
 *   A = a0*a1 + b0*c1
 *   B = a0*b1 + b0*d1
 *   C = c0*a1 + d0*c1
 *   D = c0*b1 + d0*d1
 *   E = e0*a1 + f0*c1 + e1
 *   F = e0*b1 + f0*d1 + f1
 *
 * `correctCompose(base, m)` implementa ESTA fórmula (aplica `base`
 * primero, `m` después) — es la referencia independiente contra la que se
 * compara en cada test, nunca la propia `multiply()` llamada dos veces.
 *
 * Se probó (ver más abajo, sección "propiedad general de multiply()") que
 * la función real `multiply(base, m)` de `pdfToPaths.ts` calcula en
 * realidad `correctCompose(m, base)` — es decir, compone con los
 * argumentos invertidos respecto a como los recibe. Este comportamiento
 * NO se modificó en la Etapa 7C (ver el comentario grande sobre
 * `multiply()` en `pdfToPaths.ts`); lo que se corrigió fue el orden de los
 * argumentos en el call site que combina CTM con viewport, para que, dado
 * ESE comportamiento real de `multiply()`, el resultado final sea el
 * matemáticamente correcto.
 *
 * Correr: `node --test scripts/icon-import/pdfMatrixComposition.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { multiply, applyMatrix, type Matrix } from './pdfToPaths.ts';

/** Referencia matemática independiente — "aplica `base` primero, `m` después". Ver el comentario grande de arriba para la derivación completa. */
function correctCompose(base: Matrix, m: Matrix): Matrix {
  const [a0, b0, c0, d0, e0, f0] = base;
  const [a1, b1, c1, d1, e1, f1] = m;
  return [
    a0 * a1 + b0 * c1,
    a0 * b1 + b0 * d1,
    c0 * a1 + d0 * c1,
    c0 * b1 + d0 * d1,
    e0 * a1 + f0 * c1 + e1,
    e0 * b1 + f0 * d1 + f1,
  ];
}

function assertMatrixClose(actual: Matrix, expected: Matrix, tolerance = 1e-9): void {
  for (let i = 0; i < 6; i++) {
    assert.ok(
      Math.abs(actual[i] - expected[i]) <= tolerance,
      `componente ${i}: actual=${actual[i]}, esperado=${expected[i]}`,
    );
  }
}

// ---------------------------------------------------------------------
// Propiedad general de multiply(): para cualquier par de matrices A, B,
// `multiply(B, A)` equivale a `correctCompose(A, B)` (A aplicada primero,
// B después). Esta es la propiedad de la que dependen, cada uno con su
// propio significado geométrico, los casos 1-4 pedidos (traslación,
// escala, rotación, composición general) — cada uno prueba esa misma
// propiedad con un tipo de transformación distinto, porque el orden de
// composición afecta de forma distinta a cada tipo (las traslaciones
// conmutan entre sí; escala+traslación, rotación+traslación y el caso
// general NO conmutan).
// ---------------------------------------------------------------------

// --- 1. Traslación ---
test('1. traslación + traslación — multiply() (en el orden real que usa pdfToPaths.ts para acumular cm) coincide con la composición correcta', () => {
  const oldCtm: Matrix = [1, 0, 0, 1, 10, 20];
  const newCm: Matrix = [1, 0, 0, 1, 5, 7];
  // Call site real (acumulación de cm, sin cambios en la Etapa 7C): multiply(oldCtm, newCm).
  const actual = multiply(oldCtm, newCm);
  // Semántica de PDF: newCm se aplica PRIMERO, oldCtm DESPUÉS.
  const expected = correctCompose(newCm, oldCtm);
  assertMatrixClose(actual, expected);
  const p = applyMatrix(actual, 0, 0);
  assert.equal(p.x, 15);
  assert.equal(p.y, 27);
});

// --- 2. Escala ---
test('2. escala + traslación — el orden importa, y multiply() en el call site correcto da el resultado matemáticamente correcto', () => {
  const base: Matrix = [2, 0, 0, 2, 3, 4]; // escala x2 + traslada (3,4)
  const m: Matrix = [1, 0, 0, 1, 1, 1]; // traslada (1,1)
  // Queremos: base aplicada primero, m después → (0,0) -> base -> (3,4) -> m -> (4,5).
  const expected = correctCompose(base, m);
  const pExpected = applyMatrix(expected, 0, 0);
  assert.equal(pExpected.x, 4);
  assert.equal(pExpected.y, 5);
  // multiply(m, base) da, por la propiedad real de multiply(), exactamente correctCompose(base, m).
  const actual = multiply(m, base);
  assertMatrixClose(actual, expected);
  const pActual = applyMatrix(actual, 0, 0);
  assert.equal(pActual.x, 4);
  assert.equal(pActual.y, 5);
});

// --- 3. Rotación ---
test('3. rotación 90° + traslación — el orden importa, y multiply() en el call site correcto da el resultado matemáticamente correcto', () => {
  const rotate90: Matrix = [0, 1, -1, 0, 0, 0]; // rotación 90° (a=cos90=0,b=sin90=1,c=-sin90=-1,d=cos90=0)
  const translate: Matrix = [1, 0, 0, 1, 1, 0];
  // Queremos: rotar primero, trasladar después → (1,0) -> rotar -> (0,1) -> trasladar(+1,0) -> (1,1).
  const expected = correctCompose(rotate90, translate);
  const pExpected = applyMatrix(expected, 1, 0);
  assert.equal(Math.round(pExpected.x), 1);
  assert.equal(Math.round(pExpected.y), 1);
  const actual = multiply(translate, rotate90);
  assertMatrixClose(actual, expected);
  const pActual = applyMatrix(actual, 1, 0);
  assert.equal(Math.round(pActual.x), 1);
  assert.equal(Math.round(pActual.y), 1);
});

// --- 4. Composición general (matrices arbitrarias, sin ceros que oculten nada) ---
test('4. composición general (dos matrices arbitrarias) — multiply() en el call site correcto coincide con la referencia matemática', () => {
  const base: Matrix = [2, 0.5, -0.3, 1.5, 10, -5];
  const m: Matrix = [0.8, -0.2, 0.4, 1.1, 3, 6];
  const expected = correctCompose(base, m);
  const actual = multiply(m, base);
  assertMatrixClose(actual, expected);
});

// --- 5. El patrón real corregido: CTM (traslación local) + viewportMatrix (flip Y) ---
// Este es el call site que estaba MAL antes de la Etapa 7C
// (`multiply(CTM, viewportMatrix)`) y que ahora es
// `multiply(viewportMatrix, CTM)` en `pdfToPaths.ts`.
test('5. CTM (traslación local) + viewportMatrix (flip Y) — el call site corregido da el resultado correcto (CTM primero, viewport después)', () => {
  const localCtm: Matrix = [1, 0, 0, 1, 269.667, 274.731]; // valores reales de una estrella de FUTBOL_56.pdf
  const viewportMatrix: Matrix = [1, 0, 0, -1, 0, 536]; // viewport real de FUTBOL_56.pdf (página 536x536)

  // Referencia independiente: CTM primero, viewport después.
  const expected = correctCompose(localCtm, viewportMatrix);
  assert.ok(Math.abs(expected.at(-1)! - (536 - 274.731)) < 1e-6);

  // Call site real y corregido de pdfToPaths.ts: multiply(viewportMatrix, localCtm).
  const actualFixed = multiply(viewportMatrix, localCtm);
  assertMatrixClose(actualFixed, expected);
  const pFixed = applyMatrix(actualFixed, 0, 0);
  assert.ok(Math.abs(pFixed.y - (536 - 274.731)) < 1e-6, `Y correcto esperado ${536 - 274.731}, dio ${pFixed.y}`);

  // El call site VIEJO (pre-Etapa 7C) hubiera dado el resultado corrupto —
  // se deja este chequeo para dejar registrada la regresión que se corrigió.
  const actualOldBuggyCallSite = multiply(localCtm, viewportMatrix);
  const pOldBuggy = applyMatrix(actualOldBuggyCallSite, 0, 0);
  assert.ok(Math.abs(pOldBuggy.y - (536 + 274.731)) < 1e-6, 'el call site viejo (pre-Etapa 7C) debía dar el resultado corrupto documentado en la Etapa 7A/7B');
  assert.notDeepEqual(actualFixed, actualOldBuggyCallSite);
});

// --- 6. Reproducción exacta de FUTBOL_56.pdf, con el call site corregido ---
test('6. FUTBOL_56.pdf — con el call site corregido, el punto real del contorno del escudo cae dentro de la región donde pdf.js realmente lo dibuja', () => {
  const localCtm: Matrix = [1, 0, 0, 1, 269.667, 274.731]; // CTM real del constructPath #72 (el escudo) — ver el informe de la Etapa 7A/7B
  const viewportMatrix: Matrix = [1, 0, 0, -1, 0, 536];
  const PAGE_HEIGHT = 536;

  // Referencia matemática independiente.
  const expected = correctCompose(localCtm, viewportMatrix);
  const pExpected = applyMatrix(expected, 0, 0);

  // Call site corregido de pdfToPaths.ts.
  const fixed = applyMatrix(multiply(viewportMatrix, localCtm), 0, 0);
  assert.equal(fixed.x, pExpected.x);
  assert.equal(fixed.y, pExpected.y);

  assert.ok(fixed.y >= 0 && fixed.y <= PAGE_HEIGHT, `el punto (Y=${fixed.y}) debería caer dentro de la página (0-${PAGE_HEIGHT})`);
  // Región real donde pdf.js dibuja el escudo, auto-detectada renderizando
  // la página real con `page.render()` y buscando el bounding box no
  // blanco (ver el informe de la Etapa 7A): Y≈244-292 de página.
  assert.ok(fixed.y >= 244 && fixed.y <= 292, `el punto (Y=${fixed.y}) debería caer en la región real donde aparece el escudo (244-292)`);
});

// --- 7. Composición de `cm` según la semántica de PDF (call site sin cambios) ---
test('7. acumulación de cm (call site sin cambios en la Etapa 7C) sigue coincidiendo con la semántica de PDF', () => {
  const oldCtm: Matrix = [1, 0, 0, 1, 50, 60];
  const newCm: Matrix = [2, 0, 0, 2, 5, 5];
  // Semántica de PDF: aplicar newCm PRIMERO, oldCtm DESPUÉS.
  const semanticaCorrectaDeCm = correctCompose(newCm, oldCtm);
  const resultadoReal = multiply(oldCtm, newCm);
  assertMatrixClose(resultadoReal, semanticaCorrectaDeCm);
});
