/**
 * Tests de `curvedText.ts` — Etapa 14A (bug de restauración después de
 * Undo/Redo: un texto restaurado recuperaba comportamiento de interacción
 * nativa de Fabric.js que no debería tener).
 *
 * Sobre cómo se construye un `IText` curvo en Node sin `document`: igual
 * que en `designExporter.test.ts` — pasar `path` ya en el constructor evita
 * que Fabric dispare una medición de contenido real (que necesita un
 * contexto 2D real). No se usa `createCurvedText`/`applyTextCurve` acá
 * (esas SÍ necesitan medir texto de verdad — ver `curvedText.ts` — y por
 * eso siguen siendo browser-only); lo que se testea es específicamente
 * `applyTextInteractionLocks`, que no mide nada, solo fija propiedades.
 *
 * `util.enlivenObjects()` es el MISMO mecanismo interno que usa
 * `canvas.loadFromJSON()` para reconstruir objetos desde un JSON
 * serializado (confirmado leyendo el código fuente de Fabric 6.0.2, ver
 * también la nota grande de `iconElement.test.ts`) — se usa acá para
 * reproducir la regresión real sin necesitar un `Canvas`/contexto 2D.
 *
 * Correr: `npx tsx --test src/editor/canvas/curvedText.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Path, IText, util } from 'fabric';
import { applyTextInteractionLocks, TEXT_CUSTOM_PROPERTIES } from './curvedText.ts';

function buildNodeSafeCurvedText(): IText {
  const arcPath = new Path('M 0 -50 A 50 50 0 1 1 0 50', { visible: false });
  const text = new IText('MATESHOP', {
    left: 320, top: 320, originX: 'center', originY: 'center',
    fontFamily: 'Poppins', fill: '#1a1a1a', fontSize: 24,
    path: arcPath, pathAlign: 'center', pathSide: 'left', pathStartOffset: 0,
  });
  applyTextInteractionLocks(text);
  return text;
}

const INTERACTION_PROPS = [
  'hasControls', 'hasBorders', 'editable', 'perPixelTargetFind',
  'lockScalingX', 'lockScalingY', 'lockRotation', 'lockMovementX', 'lockMovementY',
] as const;

test('applyTextInteractionLocks: aplica exactamente el bloqueo de interacción esperado (mismo criterio que createCurvedText)', () => {
  const text = buildNodeSafeCurvedText();
  assert.equal(text.hasControls, false);
  assert.equal(text.hasBorders, false);
  assert.equal(text.editable, false);
  assert.equal(text.perPixelTargetFind, true);
  assert.equal(text.lockScalingX, true);
  assert.equal(text.lockScalingY, true);
  assert.equal(text.lockRotation, true);
  assert.equal(text.lockMovementX, false);
  assert.equal(text.lockMovementY, false);
});

test('Etapa 14A — regresión: un texto reconstruido vía enlivenObjects (mecanismo real de loadFromJSON) PIERDE la configuración de interacción', async () => {
  const original = buildNodeSafeCurvedText();
  const json = original.toObject([...TEXT_CUSTOM_PROPERTIES]);
  const [restored] = await util.enlivenObjects<IText>([json]);

  // Reproduce el bug reportado: sin el fixup, el texto restaurado vuelve a
  // los valores por defecto de Fabric.js — rectángulo de selección nativo
  // visible, editable con doble click, y sobre todo: las manijas de
  // escalar/rotar quedan funcionales SIN NINGÚN control de contención
  // (`useFabricCanvas.ts` nunca tuvo que manejar ese gesto para texto,
  // porque antes de este bug era imposible dispararlo).
  assert.equal(restored.hasControls, true, 'sin el fixup, hasControls vuelve al default de Fabric.js (true)');
  assert.equal(restored.hasBorders, true, 'sin el fixup, hasBorders vuelve al default de Fabric.js (true)');
  assert.equal(restored.editable, true, 'sin el fixup, editable vuelve al default de Fabric.js (true) — doble click volvería a entrar en edición nativa');
  assert.equal(restored.lockScalingX, false, 'sin el fixup, lockScalingX vuelve a false — la manija nativa de escalar queda disponible y sin contención');
  assert.equal(restored.lockRotation, false, 'sin el fixup, lockRotation vuelve a false — la manija nativa de rotar queda disponible y sin contención');
});

test('Etapa 14A — corrección: applyTextInteractionLocks devuelve un texto reconstruido al MISMO estado que uno recién creado', async () => {
  const original = buildNodeSafeCurvedText();
  const json = original.toObject([...TEXT_CUSTOM_PROPERTIES]);
  const [restored] = await util.enlivenObjects<IText>([json]);

  applyTextInteractionLocks(restored);

  for (const prop of INTERACTION_PROPS) {
    assert.equal(restored[prop], original[prop], `la propiedad "${prop}" debe coincidir con la de un texto recién creado`);
  }
});
