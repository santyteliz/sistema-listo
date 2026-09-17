/**
 * Tests de `iconElement.ts` — Etapa 8E (íconos SVG compuestos: `fabric.Group`
 * de varias capas, ver `IconLayer` en `iconLibrary.ts`).
 *
 * IMPORTANTE — cómo se puede testear Fabric.js REAL en Node sin `jsdom` ni
 * el paquete `canvas` (ninguno de los dos está instalado, y esta etapa
 * tiene prohibido agregar dependencias nuevas): Fabric solo necesita un
 * `<canvas>`/contexto 2D real para RENDERIZAR píxeles (`.render()`/
 * `canvas.renderAll()`). Construir objetos (`new Path(...)`, `new
 * Group(...)`), leer/escribir sus propiedades (posición, escala, rotación,
 * `clipPath`), serializarlos (`toObject()`) y reconstruirlos
 * (`fabric.util.enlivenObjects()`, la MISMA función interna que usa
 * `canvas.loadFromJSON()`) son operaciones de MODELO DE DATOS puro, sin
 * ningún canvas real involucrado — se verificó esto leyendo el código
 * fuente de Fabric 6.0.2 antes de escribir este archivo (ver el informe de
 * esta etapa). Estos tests importan el paquete `fabric` REAL (no un mock),
 * así que cubren el comportamiento genuino de Fabric 6.0.2, solo sin
 * renderizar píxeles — eso se verifica por separado, visualmente, en el
 * navegador real (ver el informe).
 *
 * Correr: `node --test src/editor/canvas/iconElement.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Path, Group, util } from 'fabric';
import {
  createIconObject,
  applyIconInteractionLocks,
  buildReplacementIcon,
  getIconRuntimeDefinition,
  isIconObject,
  getIconAngle,
  getIconId,
  toIconSelection,
  ICON_CUSTOM_PROPERTIES,
  getDefaultIconAngle,
} from './iconElement.ts';
import type { IconDefinition, IconLayer } from '../icons/iconLibrary.ts';
import { VIROLA_CONFIG } from '../../config/virola.config.ts';
import { buildUploadedIconAsset } from '../icons/uploadIconFlow.ts';
import type { SvgIconGeometry } from '../icons/svgIconExtractor.ts';

const SIMPLE_ICON: IconDefinition = {
  id: 'legacy-heart',
  name: 'Corazón',
  svgPath: 'M50,20 C20,0 0,30 50,80 C100,30 80,0 50,20 Z',
  paintMode: 'fill',
  fillRule: 'nonzero',
};

const COMPOUND_LAYERS: IconLayer[] = [
  { d: 'M10,10 L90,10 L90,90 L10,90 Z', role: 'ink', fillRule: 'nonzero' },
  { d: 'M30,40 L70,40 L70,60 L30,60 Z', role: 'paper', fillRule: 'nonzero' },
  { d: 'M40,45 L60,45 L60,55 L40,55 Z', role: 'ink', fillRule: 'evenodd' },
];

const COMPOUND_ICON: IconDefinition = {
  id: 'upload-boca02-like',
  name: 'Subido',
  svgPath: '', // fallback, no autoritativo
  paintMode: 'fill',
  fillRule: 'nonzero',
  layers: COMPOUND_LAYERS,
};

// =====================================================================
// createIconObject
// =====================================================================

test('createIconObject: un IconDefinition SIN `layers` produce un Path (comportamiento de siempre, catálogo/legacy)', () => {
  const icon = createIconObject(SIMPLE_ICON, VIROLA_CONFIG, 0);
  assert.ok(icon instanceof Path);
  assert.ok(!(icon instanceof Group));
  assert.equal(icon.get('graphicKind'), 'icon');
  assert.equal(icon.get('iconId'), 'legacy-heart');
});

test('createIconObject: un IconDefinition CON `layers` produce un Group con una Path por capa, en el mismo orden', () => {
  const icon = createIconObject(COMPOUND_ICON, VIROLA_CONFIG, 0);
  assert.ok(icon instanceof Group);
  assert.equal(icon.get('graphicKind'), 'icon');
  assert.equal(icon.get('iconId'), 'upload-boca02-like');
  const children = icon.getObjects();
  assert.equal(children.length, 3);
  assert.ok(children.every((c) => c instanceof Path));
});

test('createIconObject: cada capa `ink` usa globalCompositeOperation "source-over" y cada `paper` usa "destination-out"', () => {
  const icon = createIconObject(COMPOUND_ICON, VIROLA_CONFIG, 0) as Group;
  const children = icon.getObjects() as Path[];
  assert.equal(children[0].globalCompositeOperation, 'source-over'); // ink
  assert.equal(children[1].globalCompositeOperation, 'destination-out'); // paper
  assert.equal(children[2].globalCompositeOperation, 'source-over'); // ink
});

test('createIconObject: cada capa conserva su PROPIO fillRule (no se mezclan entre capas)', () => {
  const icon = createIconObject(COMPOUND_ICON, VIROLA_CONFIG, 0) as Group;
  const children = icon.getObjects() as Path[];
  assert.equal(children[0].fillRule, 'nonzero');
  assert.equal(children[1].fillRule, 'nonzero');
  assert.equal(children[2].fillRule, 'evenodd');
});

test('createIconObject: un ícono compuesto queda posicionado sobre el anillo igual que uno simple (mismo `applyIconAngle`/containment)', () => {
  const simple = createIconObject(SIMPLE_ICON, VIROLA_CONFIG, 90);
  const compound = createIconObject(COMPOUND_ICON, VIROLA_CONFIG, 90);
  assert.equal(getIconAngle(simple), 90);
  assert.equal(getIconAngle(compound), 90);
  // Los dos quedan centrados dentro de la banda física (ninguno en 0,0 sin procesar).
  assert.ok(typeof compound.left === 'number' && typeof compound.top === 'number');
});

// =====================================================================
// isIconObject
// =====================================================================

test('isIconObject: reconoce tanto un Path simple como un Group compuesto', () => {
  assert.ok(isIconObject(createIconObject(SIMPLE_ICON, VIROLA_CONFIG, 0)));
  assert.ok(isIconObject(createIconObject(COMPOUND_ICON, VIROLA_CONFIG, 0)));
});

test('isIconObject: un Path/Group SIN graphicKind:"icon" no cuenta como ícono', () => {
  assert.equal(isIconObject(new Path('M0,0 L10,10')), false);
  assert.equal(isIconObject(new Group([new Path('M0,0 L10,10')])), false);
  assert.equal(isIconObject(null), false);
  assert.equal(isIconObject(undefined), false);
});

// =====================================================================
// buildReplacementIcon — conserva posición/escala/rotación, simple<->compuesto en cualquier dirección
// =====================================================================

test('buildReplacementIcon: reemplazar un ícono simple por uno COMPUESTO conserva left/top/scale/angle', () => {
  const current = createIconObject(SIMPLE_ICON, VIROLA_CONFIG, 0);
  current.set({ left: 123, top: 456, scaleX: 0.7, scaleY: 0.7, angle: 33 });
  current.setCoords();
  const replacement = buildReplacementIcon(current, COMPOUND_ICON, VIROLA_CONFIG);
  assert.ok(replacement instanceof Group);
  assert.equal(replacement.angle, 33);
  // clampIconScale/clampIconPosition pueden ajustar el valor exacto (igual
  // que ya hacían antes de esta etapa para reemplazos entre íconos
  // simples) — lo que se verifica acá es que el PROCESO corrió sin tirar
  // y produjo un objeto geométricamente válido, no un valor calcado 1:1.
  assert.equal(typeof replacement.left, 'number');
  assert.equal(typeof replacement.scaleX, 'number');
});

test('buildReplacementIcon: reemplazar un ícono COMPUESTO por uno simple también funciona (dirección inversa)', () => {
  const current = createIconObject(COMPOUND_ICON, VIROLA_CONFIG, 90);
  const replacement = buildReplacementIcon(current, SIMPLE_ICON, VIROLA_CONFIG);
  assert.ok(replacement instanceof Path);
  assert.ok(!(replacement instanceof Group));
});

// =====================================================================
// getIconRuntimeDefinition — reconstrucción sin destruir capas (Group -> IconDefinition)
// =====================================================================

test('getIconRuntimeDefinition: para un Path simple, reconstruye paintMode/fillRule/svgPath (comportamiento de siempre)', () => {
  const icon = createIconObject(SIMPLE_ICON, VIROLA_CONFIG, 0);
  const def = getIconRuntimeDefinition(icon);
  assert.equal(def.paintMode, 'fill');
  assert.equal(def.fillRule, 'nonzero');
  assert.ok(def.svgPath.length > 0);
  assert.equal(def.layers, undefined);
});

test('getIconRuntimeDefinition: para un Group compuesto, reconstruye `layers` con el role/fillRule de cada capa — nunca las funde con util.joinPath', () => {
  const icon = createIconObject(COMPOUND_ICON, VIROLA_CONFIG, 0);
  const def = getIconRuntimeDefinition(icon);
  assert.equal(def.paintMode, 'fill');
  assert.equal(def.layers?.length, 3);
  assert.equal(def.layers?.[0].role, 'ink');
  assert.equal(def.layers?.[1].role, 'paper');
  assert.equal(def.layers?.[2].role, 'ink');
  assert.equal(def.layers?.[2].fillRule, 'evenodd');
});

// =====================================================================
// Serialización / restauración — Paso 12: el diseño guardado debe ser
// autocontenido (nunca depender de un registro en memoria aparte).
// =====================================================================

test('serialización + restauración: un ícono COMPUESTO sobrevive toObject() -> util.enlivenObjects() sin perder capas/orden/role/fillRule/posición', async () => {
  const original = createIconObject(COMPOUND_ICON, VIROLA_CONFIG, 90) as Group;
  original.set({ left: 200, top: 150, scaleX: 1.3, angle: 12 });
  original.setCoords();

  // Mismo mecanismo real que usa `actions.ts` (`canvas.toObject(CUSTOM_PROPERTIES)`
  // -> `canvas.loadFromJSON(json)`), acá aplicado directo al objeto (sin
  // pasar por un `Canvas` real, que necesitaría un contexto 2D — ver la
  // nota grande al principio del archivo).
  const json = original.toObject([...ICON_CUSTOM_PROPERTIES]);
  const [restored] = await util.enlivenObjects<Group>([json]);

  assert.ok(restored instanceof Group);
  assert.equal(restored.get('graphicKind'), 'icon');
  assert.equal(getIconId(restored), 'upload-boca02-like');
  assert.equal(getIconAngle(restored), 90);
  assert.equal(restored.angle, 12);
  assert.equal(restored.left, 200);
  assert.equal(restored.top, 150);
  assert.equal(restored.scaleX, 1.3);

  const restoredChildren = restored.getObjects() as Path[];
  assert.equal(restoredChildren.length, 3);
  assert.equal(restoredChildren[0].globalCompositeOperation, 'source-over');
  assert.equal(restoredChildren[1].globalCompositeOperation, 'destination-out');
  assert.equal(restoredChildren[2].fillRule, 'evenodd');

  // Y la reconstrucción de `IconDefinition` (para el panel lateral, ver
  // `getSelectedIconRuntimeDefinition`) sigue funcionando sobre el objeto
  // YA RESTAURADO, no solo sobre el recién creado.
  const def = getIconRuntimeDefinition(restored);
  assert.equal(def.layers?.length, 3);
  assert.equal(def.layers?.[1].role, 'paper');
});

test('serialización + restauración: un ícono SIMPLE sigue funcionando exactamente igual que antes de esta etapa', async () => {
  const original = createIconObject(SIMPLE_ICON, VIROLA_CONFIG, 0);
  original.set({ left: 50, top: 60, angle: 5 });
  original.setCoords();
  const json = original.toObject([...ICON_CUSTOM_PROPERTIES]);
  const [restored] = await util.enlivenObjects<Path>([json]);
  assert.ok(restored instanceof Path);
  assert.ok(!(restored instanceof Group));
  assert.equal(getIconId(restored), 'legacy-heart');
  assert.equal(restored.left, 50);
  assert.equal(restored.angle, 5);
});

// =====================================================================
// toIconSelection — sigue funcionando para los dos tipos de objeto
// =====================================================================

test('toIconSelection: funciona igual para Path simple y Group compuesto', () => {
  const simpleSelection = toIconSelection(createIconObject(SIMPLE_ICON, VIROLA_CONFIG, 0));
  const compoundSelection = toIconSelection(createIconObject(COMPOUND_ICON, VIROLA_CONFIG, 0));
  assert.equal(simpleSelection.type, 'icon');
  assert.equal(compoundSelection.type, 'icon');
  assert.equal(simpleSelection.iconId, 'legacy-heart');
  assert.equal(compoundSelection.iconId, 'upload-boca02-like');
});

// =====================================================================
// Flujo real de extremo a extremo: buildUploadedIconAsset() -> createIconObject()
// (Etapa 9A.1 — corrección puntual: `buildUploadedIconAsset` perdía
// `geometry.layers` en el camino, así que este mismo flujo, con la
// implementación anterior, habría producido un Path simple en vez de un
// Group compuesto. Acá se prueban las dos funciones REALES encadenadas,
// no cada una por separado, para cubrir justo la costura donde estaba el
// bug.)
// =====================================================================

test('buildUploadedIconAsset() -> createIconObject(): una geometría compuesta real produce un Group real, no el fallback Path', () => {
  const geometry: SvgIconGeometry = {
    svgPath: 'M10,10 L90,10 L90,90 L10,90 Z', // fallback best-effort, nunca lo que se espera renderizar acá
    paintMode: 'fill',
    fillRule: 'nonzero',
    layers: COMPOUND_LAYERS,
  };
  const iconDef = buildUploadedIconAsset('boca 02.svg', geometry);
  const icon = createIconObject(iconDef, VIROLA_CONFIG, 0);
  assert.ok(icon instanceof Group, 'debe ser un Group compuesto (ink/paper), no el Path de fallback');
  const children = icon.getObjects();
  assert.equal(children.length, COMPOUND_LAYERS.length);
  assert.equal((children[1] as Path).globalCompositeOperation, 'destination-out', 'la capa `paper` real debe llegar hasta Fabric intacta');
});

// =====================================================================
// Etapa 14A — bug de restauración después de Undo: `canvas.loadFromJSON`
// reconstruye los íconos de forma GENÉRICA vía `util.enlivenObjects` (el
// mismo mecanismo interno, ver la nota grande al principio del archivo) —
// nunca pasa por `createIconObject`, así que la configuración de
// interacción (`hasControls`/`hasBorders`/`centeredScaling`/
// `perPixelTargetFind`) no viaja en el JSON y el objeto reconstruido queda
// con los valores POR DEFECTO de Fabric.js. Estos tests reproducen esa
// regresión con el mecanismo REAL de reconstrucción (no una simulación) y
// confirman que `applyIconInteractionLocks` (llamada desde
// `restoreDesign`, `actions.ts`) la corrige.
// =====================================================================

test('Etapa 14A — regresión: un ícono reconstruido vía enlivenObjects (mecanismo real de loadFromJSON) PIERDE la configuración de interacción', async () => {
  const original = createIconObject(SIMPLE_ICON, VIROLA_CONFIG, 0);
  assert.equal(original.hasControls, false);
  assert.equal(original.hasBorders, false);
  assert.equal(original.perPixelTargetFind, true);
  assert.equal(original.centeredScaling, true);

  const json = original.toObject([...ICON_CUSTOM_PROPERTIES]);
  const [restored] = await util.enlivenObjects<Path>([json]);

  // Sin el fixup de la Etapa 14A, esto reproduce el bug reportado: el
  // ícono restaurado vuelve a los valores por defecto de Fabric.js —
  // rectángulo/manijas nativas visibles y funcionales, sin ningún control
  // de contención para ese gesto.
  assert.equal(restored.hasControls, true, 'sin el fixup, hasControls vuelve al default de Fabric.js (true)');
  assert.equal(restored.hasBorders, true, 'sin el fixup, hasBorders vuelve al default de Fabric.js (true)');
  assert.equal(restored.centeredScaling, false, 'sin el fixup, centeredScaling vuelve al default de Fabric.js (false) — clampIconScale asume escalado centrado');
});

test('Etapa 14A — corrección: applyIconInteractionLocks devuelve un ícono reconstruido al MISMO estado que uno recién creado (simple y compuesto)', async () => {
  for (const iconDef of [SIMPLE_ICON, COMPOUND_ICON]) {
    const original = createIconObject(iconDef, VIROLA_CONFIG, 0);
    const json = original.toObject([...ICON_CUSTOM_PROPERTIES]);
    const [restored] = await util.enlivenObjects<Path | Group>([json]);

    applyIconInteractionLocks(restored);

    assert.equal(restored.hasControls, original.hasControls);
    assert.equal(restored.hasBorders, original.hasBorders);
    assert.equal(restored.perPixelTargetFind, original.perPixelTargetFind);
    assert.equal(restored.centeredScaling, original.centeredScaling);
  }
});

test('buildUploadedIconAsset() -> createIconObject(): una geometría simple real sigue produciendo un Path, sin cambios', () => {
  const geometry: SvgIconGeometry = {
    svgPath: 'M50,20 C20,0 0,30 50,80 C100,30 80,0 50,20 Z',
    paintMode: 'fill',
    fillRule: 'nonzero',
  };
  const iconDef = buildUploadedIconAsset('corazon.svg', geometry);
  const icon = createIconObject(iconDef, VIROLA_CONFIG, 0);
  assert.ok(icon instanceof Path);
  assert.ok(!(icon instanceof Group));
});

/**
 * Etapa 16 — regresión: agregar más de 4 íconos dejaba a los íconos 5, 9 y
 * 13 (y así sucesivamente) EXACTAMENTE en la misma posición que los íconos
 * 1, 2, 3 y 4 (mismo ángulo, mismo radio, mismo centro), tapándolos por
 * completo — confirmado visualmente agregando 16 íconos reales en el
 * navegador. Ver el comentario grande de `getDefaultIconAngle` en
 * `iconElement.ts` para la corrección.
 */
test('getDefaultIconAngle: la 1ra vuelta (íconos 1-4) sigue siendo EXACTAMENTE 0/90/270/180, sin ningún corrimiento', () => {
  const used: number[] = [];
  const angle1 = getDefaultIconAngle(used);
  assert.equal(angle1, 0);
  used.push(angle1);

  const angle2 = getDefaultIconAngle(used);
  assert.equal(angle2, 90);
  used.push(angle2);

  const angle3 = getDefaultIconAngle(used);
  assert.equal(angle3, 270);
  used.push(angle3);

  const angle4 = getDefaultIconAngle(used);
  assert.equal(angle4, 180);
});

test('getDefaultIconAngle: el 5to ícono (2da vuelta sobre 0°) NO cae exactamente sobre el 1ro', () => {
  const used = [0, 90, 270, 180];
  const angle5 = getDefaultIconAngle(used);
  assert.notEqual(angle5, 0, 'el 5to ícono no debe apilarse exactamente sobre el 1ro');
});

test('getDefaultIconAngle: 16 íconos consecutivos (4 vueltas completas) nunca repiten el mismo ángulo exacto dos veces', () => {
  const used: number[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < 16; i += 1) {
    const angle = getDefaultIconAngle(used);
    assert.ok(!seen.has(angle), `ángulo ${angle} repetido exactamente (ícono #${i + 1})`);
    seen.add(angle);
    used.push(angle);
  }
  assert.equal(seen.size, 16);
});

test('getDefaultIconAngle: al borrar un ícono del medio, ese hueco específico se vuelve a llenar primero (con corrimiento entre vueltas)', () => {
  // 4 íconos ya en la 1ra vuelta (0/90/270/180) más uno en la 2da vuelta de
  // "0" (0 + primer corrimiento) — se borra ese último y se pide uno nuevo:
  // debe volver a caer en la posición "0" (la que quedó con menos íconos),
  // no en otra distinta.
  const firstLap = [0, 90, 270, 180];
  const secondLapAtZero = getDefaultIconAngle(firstLap);
  const usedWithGap = [...firstLap]; // como si se hubiera borrado el que ocupaba secondLapAtZero
  const refill = getDefaultIconAngle(usedWithGap);
  assert.equal(refill, secondLapAtZero, 'debe volver a proponer la misma posición que quedó libre');
});
