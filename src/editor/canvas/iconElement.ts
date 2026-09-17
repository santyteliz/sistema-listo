import { Path, Group, util, type FabricObject } from 'fabric';
import type { VirolaConfig } from '../../config/virola.config';
import { getIconDefinition, type IconDefinition, type IconLayer } from '../icons/iconLibrary';
import { getIconPaintProps, getIconLayerPaintProps } from '../icons/iconPaintProps';
import type { EditorSelection } from '../state/selection';
import { clampIconPosition, clampIconScale } from './containment';
import { angleToPoint } from './ringAngle';
import { createRingVisibilityMask } from './visibilityMask';

/**
 * Un ícono en el canvas es, o bien un `Path` único (el modelo de siempre —
 * los 233 íconos del catálogo, los 6 legacy, y cualquier SVG subido de una
 * sola forma), o bien un `Group` de varios `Path` en orden de pintado (un
 * SVG subido con `layers`, Etapa 8E — ver `IconLayer`, `iconLibrary.ts`).
 * Todo el resto del editor (containment, clipping, gestos, selección,
 * serialización) opera sobre estos dos por igual vía `FabricObject`
 * genérico — nunca necesitó saber cuál es cuál (ver `containment.ts`, ya
 * tipado así desde antes de esta etapa).
 */
export type IconObject = Path | Group;

/**
 * Íconos de la biblioteca propia, colocados alrededor de la virola. Cada
 * ícono es un `fabric.Path` construido a partir del `svgPath` de
 * `iconLibrary.ts` — nunca se usa `innerHTML` ni el parser de SVG externo
 * de Fabric (`loadSVGFromString`) sobre contenido no controlado (ver
 * docs/ARCHITECTURE.md, "SVG y seguridad").
 *
 * Modelo de elemento gráfico: todo ícono lleva una propiedad propia
 * `graphicKind: 'icon'`, que es el discriminador que usa el editor para
 * reconocerlo (no el `.type` de Fabric, que solo dice "es un Path"). El
 * día que se incorpore una imagen personalizada vectorizada, va a usar el
 * mismo campo con otro valor (`'custom-image'`, todavía no implementado) —
 * así la selección, el panel contextual y la serialización no necesitan
 * rehacerse, solo sumar el caso nuevo.
 */
export type GraphicElementKind = 'icon' | 'custom-image';

/** Escala de partida para posicionar (ver `createIconObject`) — el tamaño real final nunca es este. */
const INITIAL_PLACEMENT_SCALE = 0.4;
/**
 * Escala de partida "a propósito absurda" para el cálculo del tamaño
 * inicial máximo (ver `createIconObject`): siempre mayor que cualquier
 * `maxValidScale` real que pueda devolver la búsqueda de `clampIconScale`
 * (esa búsqueda interna, en containment.ts, nunca considera más de 20), así
 * que pedir esto y dejar que `clampIconScale` lo recorte es exactamente
 * "usar el máximo real" — incluido el margen especial de manipulación de
 * íconos (`ICON_MARGIN_PX`, containment.ts), que `clampIconScale` ya
 * conoce — sin duplicar esa búsqueda acá.
 */
const OVERSIZED_SCALE_FOR_MAX_FIT = 999;
/**
 * Orden exacto de posiciones para íconos nuevos (convención de
 * `ringAngle.ts`: 0°=arriba, sentido horario): Y+ (arriba, 0°), X+
 * (derecha, 90°), X- (izquierda, 270°), Y- (abajo, 180°) — pedido explícito
 * del cliente, la misma secuencia de 4 posiciones que ya usan los textos
 * (ver `CANDIDATE_TEXT_ANGLES_DEG`, textCollision.ts). No es una fórmula
 * (progresión aritmética de paso fijo): es la secuencia pedida tal cual, así
 * que se declara explícita. Con `MAX_ICON_ELEMENTS` por encima de 4 (ver
 * designLimits.ts) esta lista de 4 posiciones se recorre más de una vez —
 * `getDefaultIconAngle` la repite en orden hasta cubrir los 16 íconos (ver
 * ahí).
 */
const INITIAL_ICON_ANGLES_DEG = [0, 90, 270, 180] as const;

/**
 * Etapa 16 — corrección de un bug real y demostrado: con `MAX_ICON_ELEMENTS`
 * en 16 (4 vueltas de las 4 posiciones de arriba), `getDefaultIconAngle`
 * elegía la MISMA posición exacta para el 5to ícono que para el 1ro (mismo
 * ángulo, mismo `iconPlacementRadius`, mismo centro) — sin ningún corrimiento
 * entre vueltas, el 5to ícono queda pixel a pixel arriba del 1ro,
 * completamente tapado (y así también el 9no sobre el 5to/1ro, el 13ro sobre
 * ellos, etc.). Confirmado visualmente: agregar 16 íconos deja solo 4
 * visibles en el anillo. Los otros 12 existen (cuentan para el límite,
 * aparecen en el conteo, se exportarían superpuestos) pero son
 * indistinguibles a simple vista.
 *
 * La corrección es mínima y NO toca la secuencia pedida por el cliente: la
 * 1ra vuelta (íconos 1-4) sigue cayendo exactamente en 0°/90°/270°/180°, sin
 * ningún corrimiento (`ICON_LAP_OFFSETS_DEG[0] === 0`). Solo de la 2da vuelta
 * en adelante (íconos 5-16) se suma un corrimiento angular fijo por vuelta,
 * elegido para que las 4 posibles vueltas de una misma posición queden
 * siempre separadas entre sí Y dentro del cuadrante propio de esa posición
 * (±45°, la mitad de los 90° que separan a las 4 posiciones) — así
 * `nearestCandidateAngleDeg` (ver más abajo) sigue pudiendo reconocer sin
 * ambigüedad a qué posición de las 4 "pertenece" un ícono ya corrido, para
 * seguir repartiendo los íconos nuevos por la posición con MENOS íconos
 * (el mismo criterio de balance que ya existía, ahora robusto a que el
 * ángulo guardado no sea exactamente uno de los 4 valores de la lista).
 */
const ICON_LAP_OFFSETS_DEG = [0, 22, -22, 40] as const;

/**
 * Distancia angular más corta entre dos ángulos (en grados, siempre ≥ 0),
 * sin importar el sentido — usada para encontrar, dado un ángulo YA corrido
 * por `ICON_LAP_OFFSETS_DEG`, cuál de las 4 posiciones de
 * `INITIAL_ICON_ANGLES_DEG` es la más cercana (ver `getDefaultIconAngle`).
 */
function angularDistanceDeg(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * A cuál de las 4 posiciones de `INITIAL_ICON_ANGLES_DEG` "pertenece" un
 * ángulo ya guardado (que puede tener un corrimiento de
 * `ICON_LAP_OFFSETS_DEG` aplicado) — la más cercana en distancia angular.
 * Como esos corrimientos nunca superan los 40° y las 4 posiciones están a
 * 90° una de otra, siempre hay una única más cercana sin ambigüedad.
 */
function nearestCandidateAngleDeg(angle: number): number {
  let best: number = INITIAL_ICON_ANGLES_DEG[0];
  let bestDistance = Infinity;
  for (const candidate of INITIAL_ICON_ANGLES_DEG) {
    const distance = angularDistanceDeg(angle, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

/**
 * Nombres de las propiedades propias (no nativas de Fabric) que un ícono
 * guarda sobre sí mismo. Igual que con el texto curvo (ver curvedText.ts,
 * `TEXT_CUSTOM_PROPERTIES`), `canvas.toJSON()` no las incluye solo —
 * `actions.ts` las suma vía `canvas.toObject([...])` al serializar.
 * (`flipX`/`flipY` no están acá porque son propiedades nativas de Fabric:
 * se serializan solas.)
 */
export const ICON_CUSTOM_PROPERTIES = ['graphicKind', 'iconId', 'angleDeg'] as const;

/**
 * Aplica una posición angular sobre el anillo de la virola a un ícono
 * existente. Usa `config.iconPlacementRadius`, no `config.textCurveRadius`:
 * si compartieran el mismo radio, un ícono en la posición inicial por
 * defecto (90°) cae exactamente sobre el borde del cuadro delimitador del
 * texto curvo (el cuadro invisible de un texto sobre un arco es mucho más
 * grande que las letras que se ven), y un click ahí puede terminar
 * seleccionando el texto en lugar del ícono. Separar los radios (ambos
 * derivados de la banda física real de la virola, ver virola.config.ts)
 * evita esa coincidencia.
 *
 * `clampIconPosition` corrige el resultado si hace falta (ver
 * `containment.ts`): a la escala por defecto de un ícono nuevo, el radio
 * `iconPlacementRadius` puede dejar su bounding box levemente por fuera del
 * borde exterior real de la banda, así que este es el único lugar donde se
 * fija una posición angular "de fábrica" — de acá en más, cualquier ícono
 * (nuevo, reposicionado por el slider, o arrastrado a mano) pasa siempre
 * por la misma corrección geométrica.
 */
export function applyIconAngle(icon: IconObject, angleDeg: number, config: VirolaConfig): void {
  const { x, y } = angleToPoint(angleDeg, config.iconPlacementRadius, config.width / 2, config.height / 2);
  icon.set({ left: x, top: y, angleDeg });
  icon.setCoords();
  clampIconPosition(icon, config);
}

/**
 * Crea un nuevo ícono de la biblioteca, ubicado sobre el anillo en el
 * ángulo dado.
 *
 * `centeredScaling: true` hace que escalar desde cualquier esquina lo haga
 * siempre desde su propio centro (nunca desde la esquina opuesta, el
 * comportamiento por defecto de Fabric.js) — así el centro no se mueve al
 * escalar, que es exactamente lo que asume `clampIconScale` (ver
 * `containment.ts`) al recalcular la escala máxima válida.
 *
 * La rotación nativa (manija `mtr`) ya NO está habilitada (`hasControls:
 * false`, ver abajo) — `containment.ts` sigue sin asumir un bounding box
 * alineado a los ejes (calcula el bounding box real del ícono a su ángulo
 * actual con `getRotatedHalfExtents`), porque escalar/rotar programático
 * (desde el `ContextualToolbar`, `growSelectedIcon`/`rotateSelectedIcon`)
 * sigue existiendo tal cual — lo que se retira acá es únicamente la manija
 * visual nativa, no la función de escalar/rotar en sí.
 *
 * `hasControls: false` + `hasBorders: false` esconden las manijas de
 * esquina/rotación y el marco de selección rectangular de Fabric.js (mismo
 * mecanismo ya usado por el texto curvo, ver `createCurvedText` en
 * `curvedText.ts`) — el ícono se ve como un elemento gráfico suelto, sin
 * "caja" alrededor. `perPixelTargetFind: true` hace que el click solo
 * seleccione el ícono si cae sobre su trazo visible, no en cualquier punto
 * del bounding box invisible (que, con el marco ya oculto, sería confuso
 * poder seleccionar "de la nada"). Es una propiedad por objeto, así que no
 * afecta el trazo de otros íconos ni al texto.
 *
 * Tamaño inicial: el ícono nace directamente en el máximo tamaño que la
 * contención permite en su posición (incluido el margen especial de
 * manipulación de íconos, ver `ICON_MARGIN_PX` en containment.ts). Se
 * posiciona primero a `INITIAL_PLACEMENT_SCALE` (así `clampIconPosition`,
 * dentro de `applyIconAngle`, decide un centro razonable con un ícono de
 * tamaño normal, no uno enorme) y recién ahí se le pide una escala a
 * propósito exagerada (`OVERSIZED_SCALE_FOR_MAX_FIT`) y se llama a
 * `clampIconScale` — la MISMA función que ya usan
 * `growSelectedIcon`/`setSelectedIconScale` (actions.ts) — que la recorta
 * al verdadero máximo válido para ese centro y ángulo, cualquiera sea la
 * proporción del ícono (`iconLibrary.ts` trae formas con anchos/altos bien
 * distintos entre sí). No es un sistema de límites nuevo: es reusar
 * `clampIconScale` con un pedido que garantiza que el resultado sea su
 * techo real, no un valor menor — y ese techo real ya incluye el margen de
 * manipulación porque `clampIconScale` lo aplica internamente.
 *
 * Pintado (`fill`/`stroke`/`fillRule`/`strokeWidth`): ya NO son valores
 * fijos iguales para todos los íconos (ver el informe de la Etapa 4) — se
 * derivan de `iconDef.paintMode`/`fillRule`/`strokeWidth` vía
 * `getIconPaintProps` (`iconPaintProps.ts`), la MISMA función que usa el
 * generador de thumbnails (`scripts/icon-import/renderIconCanvas.ts`) —
 * evita que ambos lugares tomen la decisión por separado y terminen
 * mostrando cosas distintas.
 */
/** Un `fabric.Path` para UNA capa de un ícono compuesto — pintado normal (`source-over`) para `ink`, o que revela lo pintado antes (`destination-out`, nunca blanco real) para `paper`. Ver `IconLayer` (`iconLibrary.ts`) y `getIconLayerPaintProps` (`iconPaintProps.ts`), la única fuente de verdad de esta traducción. Sin posición/escala propia: ya está en el mismo espacio normalizado compartido que el resto de las capas (`normalizeIconLayers`), así que agrupar los `Path` tal cual los deja alineados entre sí automáticamente. */
function createIconLayerPath(layer: IconLayer): Path {
  const paintProps = getIconLayerPaintProps(layer);
  return new Path(layer.d, {
    fill: paintProps.fill,
    fillRule: layer.fillRule,
    globalCompositeOperation: paintProps.globalCompositeOperation,
  });
}

/**
 * Ícono COMPUESTO (Etapa 8E) — un `fabric.Group` de una `Path` por capa,
 * en el MISMO orden que `iconDef.layers` (orden de pintado real, nunca
 * reordenado). El `Group` en sí es el único objeto que el resto del
 * editor ve/selecciona/mueve — sus hijos nunca se seleccionan por
 * separado (comportamiento por defecto de `Group`, `subTargetCheck:
 * false`).
 */
function createCompoundIconObject(layers: readonly IconLayer[]): Group {
  const children = layers.map(createIconLayerPath);
  return new Group(children, {
    originX: 'center',
    originY: 'center',
    scaleX: INITIAL_PLACEMENT_SCALE,
    scaleY: INITIAL_PLACEMENT_SCALE,
  });
}

function createSimpleIconObject(iconDef: IconDefinition): Path {
  const paintProps = getIconPaintProps(iconDef);
  return new Path(iconDef.svgPath, {
    originX: 'center',
    originY: 'center',
    fill: paintProps.fill,
    stroke: paintProps.stroke,
    fillRule: paintProps.fillRule,
    strokeWidth: paintProps.strokeWidth,
    strokeLineCap: 'round',
    strokeLineJoin: 'round',
    scaleX: INITIAL_PLACEMENT_SCALE,
    scaleY: INITIAL_PLACEMENT_SCALE,
  });
}

/**
 * Bloqueo de interacción nativa de Fabric.js que debe tener SIEMPRE un
 * ícono (simple o compuesto) — ver el comentario grande de `createIconObject`
 * (más abajo, arriba de la Etapa 8E) para el porqué de cada propiedad.
 *
 * Etapa 14A (bug de restauración después de Undo): extraída a su propia
 * función por el mismo motivo que `applyTextInteractionLocks`
 * (`curvedText.ts`, ver ese comentario grande) — `canvas.loadFromJSON`
 * (`restoreDesign`, `actions.ts`) reconstruye el ícono de forma genérica,
 * sin pasar por acá, y estas propiedades no viajan en el JSON. Sin volver a
 * aplicarlas después de restaurar, un ícono reconstruido queda con
 * `hasControls`/`hasBorders`: `true` (rectángulo y manijas nativas
 * visibles) y `centeredScaling`: `false` (una manija de escalar ya vuelta a
 * mostrar escalaría desde la esquina, no desde el centro — la asunción
 * exacta de la que depende `clampIconScale`, `containment.ts`).
 */
export function applyIconInteractionLocks(icon: IconObject): void {
  icon.set({
    centeredScaling: true,
    hasControls: false,
    hasBorders: false,
    perPixelTargetFind: true,
  });
}

export function createIconObject(iconDef: IconDefinition, config: VirolaConfig, angleDeg: number): IconObject {
  // `layers` (Etapa 8E) tiene prioridad sobre `svgPath` — ver el
  // comentario de `IconDefinition.layers` (`iconLibrary.ts`). Los 233
  // íconos del catálogo y los 6 legacy nunca traen `layers`, así que
  // siguen produciendo exactamente el mismo `Path` único de siempre.
  const icon: IconObject = iconDef.layers && iconDef.layers.length > 0
    ? createCompoundIconObject(iconDef.layers)
    : createSimpleIconObject(iconDef);
  applyIconInteractionLocks(icon);
  icon.set({
    graphicKind: 'icon' satisfies GraphicElementKind,
    iconId: iconDef.id,
  });
  applyIconAngle(icon, angleDeg, config);
  icon.set({ scaleX: OVERSIZED_SCALE_FOR_MAX_FIT, scaleY: OVERSIZED_SCALE_FOR_MAX_FIT });
  clampIconScale(icon, config);
  return icon;
}

/**
 * Ángulo inicial para un ícono nuevo, siguiendo la secuencia de 4
 * posiciones de `INITIAL_ICON_ANGLES_DEG` (Y+ → X+ → X- → Y-) repetida
 * hasta los `MAX_ICON_ELEMENTS` (16, ver designLimits.ts) — es decir, la
 * misma secuencia de siempre dando 4 vueltas.
 *
 * Como la lista de posiciones (4) es más chica que la cantidad máxima de
 * íconos (16), "elegir el primer candidato no usado" ya no alcanza —
 * después del 4to ícono TODOS los candidatos ya tienen algún ícono. En vez
 * de eso, se cuenta cuántos íconos existentes hay YA en cada una de las 4
 * posiciones (`usedAngles`, ver `getIconAngle`, comparados por posición MÁS
 * CERCANA vía `nearestCandidateAngleDeg`, no por igualdad exacta — ver por
 * qué en el comentario de `ICON_LAP_OFFSETS_DEG`) y se elige la posición con
 * MENOS íconos (a igualdad, la primera en el orden de la secuencia) — el
 * mismo concepto de "buscar la posición libre" que ya usaba este archivo,
 * generalizado de booleano ("¿ocupada?") a cantidad ("¿cuál tiene menos?"),
 * necesario porque ahora varios íconos pueden compartir una misma posición
 * de la secuencia a lo largo de sus 4 repeticiones.
 *
 * Nunca se elige solo a partir de CUÁNTOS íconos hay en TOTAL (no es un
 * simple `count % 4`): sigue leyendo la ocupación real de cada posición, así
 * que si se borra un ícono del medio y se agrega uno nuevo, ese hueco
 * específico es el primero en volver a llenarse — mismo comportamiento que
 * ya tenía este archivo antes de esta etapa, ahora aplicado con cantidades
 * en vez de con un set de "usado/libre".
 *
 * El ángulo final suma el corrimiento de `ICON_LAP_OFFSETS_DEG` que
 * corresponde a cuántos íconos ya hay en esa posición (`bestCount`, la
 * "vuelta" de este ícono nuevo) — para la 1ra vuelta (`bestCount === 0`) el
 * corrimiento es 0 y el resultado es idéntico al de antes de esta corrección
 * (0°/90°/270°/180° exactos, sin excepción).
 */
export function getDefaultIconAngle(usedAngles: readonly number[]): number {
  let bestCandidate: number = INITIAL_ICON_ANGLES_DEG[0];
  let bestCount = Infinity;
  for (const candidate of INITIAL_ICON_ANGLES_DEG) {
    const count = usedAngles.filter((angle) => nearestCandidateAngleDeg(angle) === candidate).length;
    if (count < bestCount) {
      bestCount = count;
      bestCandidate = candidate;
    }
  }
  const lapOffset = ICON_LAP_OFFSETS_DEG[bestCount % ICON_LAP_OFFSETS_DEG.length] ?? 0;
  return (bestCandidate + lapOffset + 360) % 360;
}

/** Type guard: el objeto es un ícono de la biblioteca propia (`Path` simple o `Group` compuesto, ver `IconObject`). */
export function isIconObject(object: FabricObject | null | undefined): object is IconObject {
  return !!object && object.get('graphicKind') === 'icon';
}

export function getIconAngle(icon: IconObject): number {
  const angle = icon.get('angleDeg');
  return typeof angle === 'number' ? angle : 0;
}

export function getIconId(icon: IconObject): string {
  const id = icon.get('iconId');
  return typeof id === 'string' ? id : '';
}

/**
 * Reemplaza la figura de un ícono ya agregado por la de otro ícono de la
 * biblioteca, conservando su posición, escala, rotación y espejado/
 * inversión. Se crea un objeto nuevo (la geometría de un Path no está
 * pensada para reemplazarse en el lugar) y se le copian las propiedades de
 * transformación del anterior antes de reemplazarlo en el canvas.
 *
 * Los distintos íconos de la biblioteca no tienen exactamente el mismo
 * bounding box propio (un corazón y una estrella no ocupan lo mismo a
 * igual escala) — por eso, aunque la posición/escala que se copian ya eran
 * válidas para el ícono anterior, hay que volver a pasarlas por la
 * contención geométrica antes de confirmar el reemplazo.
 */
export function buildReplacementIcon(current: IconObject, iconDef: IconDefinition, config: VirolaConfig): IconObject {
  const replacement = createIconObject(iconDef, config, getIconAngle(current));
  replacement.set({
    left: current.left,
    top: current.top,
    scaleX: current.scaleX,
    scaleY: current.scaleY,
    angle: current.angle,
    flipX: current.flipX,
    flipY: current.flipY,
  });
  replacement.setCoords();
  clampIconScale(replacement, config);
  clampIconPosition(replacement, config);
  return replacement;
}

/**
 * Deriva un `IconDefinition` "en vivo" directamente de un ícono YA
 * colocado en el canvas (Etapa 8B, íconos SVG subidos por el usuario) —
 * para el caso en que su `iconId` no aparezca en ningún catálogo
 * descargado (`useIconCatalog`) ni en los 6 legacy (`iconLibrary.ts`): un
 * ícono subido nunca se agrega a `public/icons/manifest.json` (es una
 * creación de la sesión, no del catálogo oficial), así que buscarlo por id
 * en esos catálogos siempre va a fallar. En vez de mantener un registro
 * paralelo de "íconos subidos esta sesión" (un segundo lugar de estado que
 * habría que sincronizar con crear/reemplazar/deshacer/restaurar), se lee
 * la información directamente de las propiedades NATIVAS de Fabric del
 * propio objeto (`fill`/`stroke`/`fillRule`/`strokeWidth`, ya reconstruidas
 * por `loadFromJSON` igual que para cualquier otro ícono) más
 * `util.joinPath(icon.path)` (utilidad ya incluida en el paquete `fabric`,
 * ninguna dependencia nueva) para recuperar el `d` — Fabric es, en este
 * caso, la única fuente de verdad que hace falta.
 *
 * Etapa 8E (íconos compuestos): cuando `icon` es un `Group`, se aplica el
 * MISMO principio — nunca `util.joinPath` para "destruir" las capas de
 * vuelta a un solo `d` (eso es justo lo que esta etapa dejó de hacer). En
 * cambio, se reconstruye una `IconLayer` por cada `Path` hijo, leyendo sus
 * propiedades nativas de Fabric (`fillRule`, y `globalCompositeOperation`
 * para inferir `role` — `'destination-out'` es siempre `'paper'`, ver
 * `getIconLayerPaintProps`) — el `Group` reconstruido por `loadFromJSON`
 * (tras restaurar un diseño) ya trae estas propiedades intactas en sus
 * hijos, así que no hace falta ningún registro aparte.
 */
export function getIconRuntimeDefinition(icon: IconObject): IconDefinition {
  if (icon instanceof Group) {
    const layers: IconLayer[] = icon.getObjects().map((child) => {
      const layerPath = child as Path;
      return {
        d: util.joinPath(layerPath.path),
        role: layerPath.globalCompositeOperation === 'destination-out' ? 'paper' : 'ink',
        fillRule: layerPath.fillRule === 'evenodd' ? 'evenodd' : 'nonzero',
      } satisfies IconLayer;
    });
    // Fallback `svgPath` (mismo criterio que `svgIconExtractor.ts`): solo
    // las capas `ink`, nunca usado para el renderizado real (ver `layers`).
    const inkLayerDs = layers.filter((l) => l.role === 'ink').map((l) => l.d);
    return {
      id: getIconId(icon),
      name: getIconId(icon),
      svgPath: inkLayerDs.join(' ') || layers[0]?.d || '',
      paintMode: 'fill',
      fillRule: 'nonzero',
      layers,
    };
  }
  const paintMode: IconDefinition['paintMode'] = icon.fill ? 'fill' : 'stroke';
  return {
    id: getIconId(icon),
    name: getIconId(icon),
    svgPath: util.joinPath(icon.path),
    paintMode,
    fillRule: icon.fillRule === 'evenodd' ? 'evenodd' : 'nonzero',
    strokeWidth: paintMode === 'stroke' ? icon.strokeWidth : undefined,
  };
}

/** Estado mínimo de UI derivado de un ícono seleccionado (ver EditorSelection). */
export function toIconSelection(icon: IconObject): EditorSelection {
  return {
    type: 'icon',
    iconId: getIconId(icon),
    flipX: !!icon.flipX,
    flipY: !!icon.flipY,
    angleDeg: getIconAngle(icon),
    // Rotación propia del ícono (manija nativa `mtr`) — distinta de
    // `angleDeg` (dónde, alrededor del anillo, está ubicado el ícono).
    rotation: icon.angle ?? 0,
    scaleX: icon.scaleX ?? 1,
    left: icon.left ?? 0,
    top: icon.top ?? 0,
  };
}

/**
 * Muestra el ícono completo (sin recorte) cuando está seleccionado, para
 * poder manipularlo aunque una parte esté fuera de la franja de diseño (ver
 * `ICON_MARGIN_PX`, containment.ts); lo recorta al anillo real Ø72–Ø94 de la
 * virola cuando NO está seleccionado (ver `createRingVisibilityMask`,
 * compartida con el texto — ver `setTextVisibilityClip` en curvedText.ts).
 * Antes el recorte era solo por el borde exterior (Ø94); con el margen de
 * manipulación, un ícono también puede invadir levemente el agujero central
 * (Ø72), así que ahora se oculta por los dos lados. Puramente visual: no
 * mueve, escala ni rota el ícono — solo cambia su `clipPath`. Se llama para
 * TODOS los íconos cada vez que cambia la selección (ver
 * `useFabricCanvas.ts`) y una vez más después de restaurar un diseño (ver
 * `restoreDesign`, actions.ts), porque `canvas.loadFromJSON` reconstruye los
 * íconos de forma genérica, sin pasar por `createIconObject`.
 */
export function setIconVisibilityClip(icon: IconObject, isSelected: boolean, config: VirolaConfig): void {
  icon.clipPath = isSelected ? undefined : createRingVisibilityMask(config);
  icon.dirty = true;
}

export { getIconDefinition };
