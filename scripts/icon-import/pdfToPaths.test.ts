/**
 * Pruebas de las funciones de clasificación de paint type de `pdfToPaths.ts`
 * — Etapa 4 (corrección de relleno/trazo real). No prueban la extracción
 * completa de un PDF real (eso ya se validó a mano contra archivos reales
 * en la prueba mínima de la etapa anterior, y se vuelve a validar con la
 * muestra chica de esta etapa) — acá se prueba la lógica pura de traducir
 * un paint type de pdf.js a nuestro modelo, sin abrir ningún PDF.
 *
 * Correr: `node --test scripts/icon-import/pdfToPaths.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isFillPaintType, isStrokePaintType, fillRuleOfPaintType, type PdfPaintType } from './pdfToPaths.ts';

const ALL_TYPES: PdfPaintType[] = [
  'fill', 'eoFill', 'stroke', 'closeStroke', 'fillStroke', 'eoFillStroke',
  'closeFillStroke', 'closeEOFillStroke', 'endPath', 'other',
];

test('fill / eoFill — son tipo relleno, nunca tipo trazo', () => {
  assert.equal(isFillPaintType('fill'), true);
  assert.equal(isFillPaintType('eoFill'), true);
  assert.equal(isStrokePaintType('fill'), false);
  assert.equal(isStrokePaintType('eoFill'), false);
});

test('fillRuleOfPaintType — fill -> nonzero, eoFill -> evenodd', () => {
  assert.equal(fillRuleOfPaintType('fill'), 'nonzero');
  assert.equal(fillRuleOfPaintType('eoFill'), 'evenodd');
});

test('stroke / closeStroke — son tipo trazo puro, nunca tipo relleno (no tienen fillRule)', () => {
  assert.equal(isStrokePaintType('stroke'), true);
  assert.equal(isStrokePaintType('closeStroke'), true);
  assert.equal(isFillPaintType('stroke'), false);
  assert.equal(isFillPaintType('closeStroke'), false);
  assert.equal(fillRuleOfPaintType('stroke'), null);
  assert.equal(fillRuleOfPaintType('closeStroke'), null);
});

test('fillStroke / eoFillStroke — son AMBOS (relleno y trazo a la vez) — Caso B del diseño técnico', () => {
  assert.equal(isFillPaintType('fillStroke'), true);
  assert.equal(isStrokePaintType('fillStroke'), true);
  assert.equal(fillRuleOfPaintType('fillStroke'), 'nonzero');

  assert.equal(isFillPaintType('eoFillStroke'), true);
  assert.equal(isStrokePaintType('eoFillStroke'), true);
  assert.equal(fillRuleOfPaintType('eoFillStroke'), 'evenodd');
});

test('closeFillStroke / closeEOFillStroke — mismo comportamiento que fillStroke/eoFillStroke, con cierre implícito', () => {
  assert.equal(isFillPaintType('closeFillStroke'), true);
  assert.equal(isStrokePaintType('closeFillStroke'), true);
  assert.equal(fillRuleOfPaintType('closeFillStroke'), 'nonzero');

  assert.equal(isFillPaintType('closeEOFillStroke'), true);
  assert.equal(isStrokePaintType('closeEOFillStroke'), true);
  assert.equal(fillRuleOfPaintType('closeEOFillStroke'), 'evenodd');
});

test('endPath — no es ni relleno ni trazo (se descarta en la extracción, nunca llega a composeIconGeometry)', () => {
  assert.equal(isFillPaintType('endPath'), false);
  assert.equal(isStrokePaintType('endPath'), false);
  assert.equal(fillRuleOfPaintType('endPath'), null);
});

test('other (paint type numérico desconocido) — se ignora, nunca se asume relleno "por las dudas"', () => {
  assert.equal(isFillPaintType('other'), false);
  assert.equal(isStrokePaintType('other'), false);
  assert.equal(fillRuleOfPaintType('other'), null);
});

test('cobertura — todos los PdfPaintType declarados están clasificados como fill, stroke, ambos, o ninguno (nunca "undefined")', () => {
  for (const type of ALL_TYPES) {
    const fill = isFillPaintType(type);
    const stroke = isStrokePaintType(type);
    assert.equal(typeof fill, 'boolean');
    assert.equal(typeof stroke, 'boolean');
  }
});
