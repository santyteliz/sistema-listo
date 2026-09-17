import { Path, type Canvas, type FabricObject, type IText } from 'fabric';
import type { VirolaConfig } from '../../config/virola.config';
import { angleToPoint, normalizeAngleDeg, pointToAngleDeg } from './ringAngle';
import { getRotatedHalfExtents } from './containment';
import { isIconObject } from './iconElement';
import { GLYPH_HEIGHT_RATIO, getCurveRadius, getCurveState, isTextObject } from './curvedText';
import { DESIGN_INK_COLOR } from './designColors';

/**
 * Líneas circulares decorativas ("Líneas circulares: No / Simple / Doble" en
 * la barra lateral — ver referencias/05-pantalladiseño.png) — un anillo (o
 * dos) dibujado dentro de la banda de diseño, que se INTERRUMPE
 * geométricamente donde haya un texto o ícono cerca, en vez de dibujarse
 * completo y confiar en el orden de capas (z-index) para que no se vea
 * encima del elemento.
 *
 * Reutiliza la misma geometría de referencia que el resto del editor
 * (radios derivados de Ø72/Ø94, ver `circularLineRadius`/
 * `circularLineDoubleOffset` en virola.config.ts — `circularLineRadius` es
 * el radio medio de la banda, igual que `textCurveRadius`/
 * `iconPlacementRadius`) — no es un sistema de geometría paralelo.
 *
 * Estado: el estilo elegido (`CircularLineStyle`) se guarda como propiedad
 * propia DEL CANVAS (no de un objeto) — `canvas.set('circularLineStyle', …)` /
 * `canvas.get('circularLineStyle')`, aprovechando que `CommonMethods` (de la
 * que hereda `Canvas`) ya soporta getters/setters genéricos por nombre, igual
 * que cualquier objeto de Fabric. Eso es lo que permite que sobreviva
 * serializar/restaurar con el mismo mecanismo que ya usan `curveOffset`,
 * `angleDeg`, etc. (`canvas.toObject(propertiesToInclude)` incluye
 * propiedades propias del canvas vía `pick(this, propertiesToInclude)`, y
 * `loadFromJSON` las repone solo con `this.set(serialized)` — confirmado
 * leyendo el código fuente de Fabric 6.0.2) — ver `getCircularLineStyle`/
 * `setCircularLineStyleOnCanvas` y `CIRCULAR_LINE_STYLE_PROPERTY` en
 * actions.ts.
 *
 * Las LÍNEAS EN SÍ (los objetos `Path` ya recortados) nunca se serializan:
 * son puramente derivadas (del estilo elegido + la geometría actual de cada
 * elemento), así que se recalculan siempre desde cero después de restaurar
 * — igual que `renderGuides` — en vez de intentar guardar su geometría ya
 * calculada (que además tiene los huecos "hardcodeados" para el tamaño de
 * pantalla/elementos de ESE momento, no algo que tenga sentido reproducir
 * tal cual). Por eso llevan `excludeFromExport: true` como cualquier guía.
 */
export type CircularLineStyle = 'none' | 'single' | 'double';

/**
 * Registra el evento propio `circularLineStyle:modified` en el mapa de
 * eventos tipado de Fabric.js (`CanvasEvents`, reexportado desde el paquete
 * `fabric` — ver `fabric/dist/fabric.d.ts`) — así `canvas.fire(...)`/
 * `canvas.on(...)` lo aceptan con tipos, sin `any`, igual que cualquier
 * evento nativo. Es el mismo patrón que ya usa este código para `text:changed`
 * (evento nativo de IText, reutilizado acá a nivel canvas — ver
 * `notifyTextChanged` en actions.ts), solo que ese ya viene declarado por
 * Fabric y este es nuevo, así que hace falta declararlo una vez acá.
 */
declare module 'fabric' {
  interface CanvasEvents {
    'circularLineStyle:modified': { style: CircularLineStyle };
  }
}

// Mismo negro que el texto y los íconos (ver `designColors.ts`) — antes acá
// se usaba el gris-oliva de las guías (`#8a8680`), pero la línea circular
// NO es una guía: es un elemento más del diseño real (como el texto y los
// íconos), así que tiene que verse con la misma tinta.
const CIRCULAR_LINE_STROKE_WIDTH = 2;

/**
 * Margen de seguridad entre el borde real de un elemento y la línea circular
 * más cercana — la zona de exclusión de cada elemento (ver `ExclusionZone`)
 * es su alcance real MÁS este margen. Es el único lugar donde vive este
 * número (punto 7 de la tarea: "centralizado como configuración, no
 * hardcodeado en múltiples lugares") — ni `containment.ts` ni
 * `curvedText.ts` lo necesitan para nada más.
 */
const EXCLUSION_MARGIN_PX = 8;

/**
 * Marca (propiedad propia, no nativa de Fabric) que identifica a un objeto
 * como línea circular decorativa — para poder ubicarlas y quitarlas sin
 * tocar el resto del diseño, y para que `useFabricCanvas.ts` pueda ignorar
 * los eventos `object:added`/`object:removed` que estas MISMAS líneas
 * disparan al agregarse/quitarse (si no, cada redibujado dispararía un
 * nuevo redibujado de sí mismo, sin fin).
 */
export function isCircularLineObject(object: FabricObject): boolean {
  return object.get('circularLine') === true;
}

/**
 * Zona de exclusión de un elemento: un CÍRCULO (centro `dx,dy` respecto del
 * centro de la virola, radio `radius`) que ninguna línea circular puede
 * atravesar. Modelarla como círculo (un envolvente del bounding box real ya
 * rotado/escalado, no el rectángulo exacto) es lo que permite calcular el
 * rango angular que bloquea con una fórmula cerrada (intersección de dos
 * círculos, ver `getExclusionAngularRange`) en vez de necesitar una
 * bisección numérica — a costa de excluir, en el peor caso, un arco
 * levemente más ancho del estrictamente necesario (nunca más angosto: el
 * círculo envolvente nunca queda por dentro del rectángulo real), que es el
 * lado seguro para evitar que la línea toque al elemento.
 */
interface ExclusionZone {
  dx: number;
  dy: number;
  radius: number;
}

/**
 * Zona de exclusión de un ícono: mismo cálculo de semi-ancho/alto rotado que
 * ya usa `containment.ts` para mantenerlo dentro de la banda (`getRotatedHalfExtents`,
 * ahora exportada) — el círculo envolvente es la hipotenusa de esos dos
 * semi-anchos, así que crece/rota con el ícono automáticamente: no hace
 * falta escuchar ningún evento particular para "actualizar" esta zona, se
 * recalcula entera cada vez que se vuelve a dibujar la línea.
 */
function getIconExclusionZone(icon: FabricObject, config: VirolaConfig): ExclusionZone {
  const centerX = config.width / 2;
  const centerY = config.height / 2;
  const dx = (icon.left ?? centerX) - centerX;
  const dy = (icon.top ?? centerY) - centerY;
  const { halfWidth, halfHeight } = getRotatedHalfExtents(icon, icon.scaleX ?? 1, icon.angle ?? 0);
  return { dx, dy, radius: Math.hypot(halfWidth, halfHeight) + EXCLUSION_MARGIN_PX };
}

/**
 * Zona de exclusión de un texto: el punto de referencia es su propio punto
 * sobre el anillo (a su `curveOffset`/radio actuales, ver `getCurveRadius` —
 * ya contempla el desplazamiento radial de texto) y el círculo envolvente
 * sale del ancho REAL medido (`calcTextWidth()`, igual que `fitFontSizeToArc`
 * — nunca una heurística por cantidad de caracteres) y del alcance radial
 * real del cuerpo de la letra (`fontSize * GLYPH_HEIGHT_RATIO`, la misma
 * fórmula que ya usa curvedText.ts para no sobresalir de la banda).
 */
function getTextExclusionZone(text: IText, config: VirolaConfig): ExclusionZone {
  const centerX = config.width / 2;
  const centerY = config.height / 2;
  const radius = getCurveRadius(text, config);
  const angleDeg = getCurveState(text).offset;
  const point = angleToPoint(angleDeg, radius, centerX, centerY);
  const halfTextWidth = (text.calcTextWidth() || 0) / 2;
  const halfGlyphReach = text.fontSize * GLYPH_HEIGHT_RATIO;
  return {
    dx: point.x - centerX,
    dy: point.y - centerY,
    radius: Math.hypot(halfTextWidth, halfGlyphReach) + EXCLUSION_MARGIN_PX,
  };
}

/**
 * Zona de exclusión de cualquier elemento reconocido (ícono o texto) — `null`
 * para cualquier otra cosa (guías, líneas circulares ya dibujadas, o un
 * futuro tipo de elemento gráfico que todavía no tenga esta regla). Reutiliza
 * los mismos type guards que ya usa el resto del editor (`isIconObject`,
 * `isTextObject`) — no duplica la identificación de tipos.
 */
function getExclusionZone(object: FabricObject, config: VirolaConfig): ExclusionZone | null {
  if (isIconObject(object)) {
    return getIconExclusionZone(object, config);
  }
  if (isTextObject(object)) {
    return getTextExclusionZone(object, config);
  }
  return null;
}

/** Rango angular (grados, convención ringAngle.ts) que una zona de exclusión bloquea. */
interface AngularRange {
  center: number;
  halfWidth: number;
}

/**
 * Rango angular que una zona de exclusión bloquea sobre el círculo de radio
 * `lineRadius` centrado en el mismo origen — `null` si ese círculo ni
 * siquiera roza la zona.
 *
 * EXISTENCIA (¿esta línea puntual llega a tocar la zona?): dos círculos —
 * uno de radio `lineRadius` centrado en el origen (la línea), otro de radio
 * `zone.radius` centrado a distancia `d` del origen (la zona) — se tocan
 * exactamente cuando el ángulo entre ellos (teorema del coseno sobre el
 * triángulo origen/centro-de-zona/punto-de-intersección, lados `d`,
 * `lineRadius`, `zone.radius`) existe, `cos(ángulo) = (d² + lineRadius² −
 * zone.radius²) / (2·d·lineRadius) < 1`. Esta parte de la fórmula NO
 * cambió: decide exactamente las mismas líneas que antes (ninguna línea que
 * antes se cortaba deja de cortarse, y viceversa).
 *
 * ANCHO angular del corte, una vez que sabemos que SÍ toca: acá es donde
 * estaba el problema (corte "Doble" con un mordisco desparejo entre las dos
 * líneas). La fórmula de arriba da el ángulo de la intersección exacta
 * círculo-línea/círculo-zona, que varía con `lineRadius` — una línea más
 * cerca del centro de la zona (`d`) corta más angosto que una más cerca del
 * borde de la zona, aunque las dos estén a solo unos píxeles de distancia
 * entre sí (el caso de las dos líneas de "Doble"). Visualmente, dos cortes
 * con ancho distinto para el MISMO elemento no se leen como un corte
 * radial limpio: una línea queda "más mordida" que la otra sin que haya una
 * diferencia real en dónde está el elemento.
 *
 * En cambio, acá se usa el ángulo TANGENTE clásico (cateto opuesto =
 * `zone.radius`, hipotenusa = `d`): el ángulo, visto desde el centro de la
 * virola, que subtiende el borde de la zona de exclusión — el mismo en
 * cualquier radio, porque no depende de `lineRadius` en absoluto. Es
 * exactamente la lectura geométrica del pedido: "el corte debe ser radial
 * respecto del centro de la virola" — un corte radial es, por definición,
 * el mismo ángulo sin importar a qué distancia del centro se lo mida. Con
 * esto, las dos líneas de "Doble" (que SIGUEN decidiendo cada una por su
 * cuenta si les toca o no un corte, con la fórmula de existencia de
 * siempre) quedan con el MISMO ancho angular cuando a las dos les toca —
 * el corte se ve alineado sobre el mismo rayo radial en ambas.
 */
function getExclusionAngularRange(zone: ExclusionZone, lineRadius: number): AngularRange | null {
  const d = Math.hypot(zone.dx, zone.dy);

  if (d === 0) {
    // Caso degenerado (elemento exactamente sobre el centro de la virola —
    // no debería pasar en uso normal, ver el mismo respaldo en
    // containment.ts): si su zona alcanza el radio de la línea, la tapa
    // entera; si no, no la toca.
    return zone.radius >= lineRadius ? { center: 0, halfWidth: 180 } : null;
  }

  const cosHalf = (d * d + lineRadius * lineRadius - zone.radius * zone.radius) / (2 * d * lineRadius);
  if (cosHalf >= 1) {
    return null; // esta línea puntual ni siquiera llega a tocar la zona
  }
  const center = normalizeAngleDeg(pointToAngleDeg(zone.dx, zone.dy));

  if (zone.radius >= d) {
    // Caso degenerado (el centro de la virola queda DENTRO del alcance de
    // la propia zona de exclusión — solo posible con un elemento enorme
    // muy cerca del centro): el ángulo tangente de abajo no está definido
    // (el "cateto opuesto" zone.radius ya no es menor que la hipotenusa
    // `d`), así que acá se conserva el cálculo exacto de siempre en vez de
    // inventar un valor — es un caso raro donde la prioridad es no tapar
    // de más, no la consistencia visual entre líneas.
    if (cosHalf <= -1) {
      return { center, halfWidth: 180 }; // la zona cubre el círculo entero
    }
    return { center, halfWidth: (Math.acos(cosHalf) * 180) / Math.PI };
  }

  return { center, halfWidth: (Math.asin(zone.radius / d) * 180) / Math.PI };
}

/**
 * Fusiona rangos angulares posiblemente superpuestos en el mínimo número de
 * intervalos disjuntos, sobre un dominio CIRCULAR (0-360°): cada rango se
 * duplica desplazado ±360° antes de fusionar (técnica estándar para
 * intervalos circulares — así un rango que cruza 0°/360°, como uno centrado
 * en 355° con `halfWidth=10`, se fusiona correctamente con uno centrado en
 * 2°, aunque en la representación [0,360) queden en extremos opuestos de la
 * lista) y después se recorta el resultado a un único período representativo.
 */
function mergeExcludedRanges(ranges: AngularRange[]): Array<{ start: number; end: number }> {
  if (ranges.length === 0) {
    return [];
  }
  const raw = ranges.map((r) => ({ start: r.center - r.halfWidth, end: r.center + r.halfWidth }));
  const tripled = [
    ...raw.map((r) => ({ start: r.start - 360, end: r.end - 360 })),
    ...raw,
    ...raw.map((r) => ({ start: r.start + 360, end: r.end + 360 })),
  ].sort((a, b) => a.start - b.start);

  const merged: Array<{ start: number; end: number }> = [];
  for (const range of tripled) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }

  return merged.filter((r) => r.end > 0 && r.start < 360);
}

/** Arcos VISIBLES (complemento de los rangos excluidos) dentro de un período de 360°, ordenados. */
function getVisibleArcs(mergedExcluded: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
  if (mergedExcluded.length === 0) {
    return [{ start: 0, end: 360 }];
  }
  const visible: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const excluded of mergedExcluded) {
    const start = Math.max(0, excluded.start);
    if (start > cursor) {
      visible.push({ start: cursor, end: start });
    }
    cursor = Math.max(cursor, Math.min(360, excluded.end));
  }
  if (cursor < 360) {
    visible.push({ start: cursor, end: 360 });
  }
  return visible;
}

/** Círculo completo (sin ningún hueco) — dos arcos de 180°, misma técnica que `circlePathD` en guides.ts, para no depender de un único comando `A` con inicio y fin coincidentes (ambiguo/indefinido en SVG). */
function buildFullCirclePathD(radius: number, centerX: number, centerY: number): string {
  const top = angleToPoint(0, radius, centerX, centerY);
  const bottom = angleToPoint(180, radius, centerX, centerY);
  return (
    `M ${top.x} ${top.y} A ${radius} ${radius} 0 1 1 ${bottom.x} ${bottom.y} ` +
    `A ${radius} ${radius} 0 1 1 ${top.x} ${top.y}`
  );
}

/**
 * Un comando `M...A...` por cada arco VISIBLE (nunca uno solo que "salte" por
 * encima de un hueco) — el `Path` resultante queda con varios subtrazos
 * independientes, que es justamente lo que se necesita para que la línea se
 * vea interrumpida en vez de continua. Mismo ángulo de barrido creciente que
 * ya usa `buildArcPath` en curvedText.ts (sweep-flag=1 siempre, convención
 * de ringAngle.ts: 0°=arriba, sentido horario).
 */
function buildBrokenCirclePathD(
  radius: number,
  visibleArcs: Array<{ start: number; end: number }>,
  centerX: number,
  centerY: number,
): string {
  return visibleArcs
    .map(({ start, end }) => {
      const startPoint = angleToPoint(start, radius, centerX, centerY);
      const endPoint = angleToPoint(end, radius, centerX, centerY);
      const largeArcFlag = end - start > 180 ? 1 : 0;
      return `M ${startPoint.x} ${startPoint.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endPoint.x} ${endPoint.y}`;
    })
    .join(' ');
}

/** 'd' completo de la línea a un radio dado, ya con los huecos de todas las zonas de exclusión — '' si queda completamente tapada. */
function buildCircularLinePathD(
  radius: number,
  excludedRanges: AngularRange[],
  centerX: number,
  centerY: number,
): string {
  const merged = mergeExcludedRanges(excludedRanges);
  const visibleArcs = getVisibleArcs(merged);
  if (visibleArcs.length === 0) {
    return '';
  }
  if (visibleArcs.length === 1 && visibleArcs[0].end - visibleArcs[0].start >= 359.999) {
    return buildFullCirclePathD(radius, centerX, centerY);
  }
  return buildBrokenCirclePathD(radius, visibleArcs, centerX, centerY);
}

/**
 * Construye (si corresponde) el objeto de Fabric para UNA línea circular al
 * radio dado, ya recortada según la posición/tamaño/rotación ACTUALES de
 * todos los elementos del canvas — `null` si queda completamente tapada (no
 * hay nada que dibujar).
 *
 * `selectable: false` / `evented: false` / `hasControls: false` / `hasBorders:
 * false`: el usuario nunca puede seleccionarla ni manipularla, es puramente
 * decorativa (punto 10 de la tarea). `excludeFromExport: true`: no sobrevive
 * a `canvas.toObject()` — se recalcula siempre desde `circularLineStyle` +
 * la geometría real de los elementos, nunca desde su propia geometría ya
 * calculada (ver el comentario grande al principio del archivo).
 */
function createCircularLinePath(canvas: Canvas, config: VirolaConfig, radius: number): Path | null {
  const centerX = config.width / 2;
  const centerY = config.height / 2;

  const excludedRanges = canvas
    .getObjects()
    .map((object) => getExclusionZone(object, config))
    .filter((zone): zone is ExclusionZone => zone !== null)
    .map((zone) => getExclusionAngularRange(zone, radius))
    .filter((range): range is AngularRange => range !== null);

  const d = buildCircularLinePathD(radius, excludedRanges, centerX, centerY);
  if (!d) {
    return null;
  }

  const line = new Path(d, {
    fill: '',
    stroke: DESIGN_INK_COLOR,
    strokeWidth: CIRCULAR_LINE_STROKE_WIDTH,
    selectable: false,
    evented: false,
    hasControls: false,
    hasBorders: false,
    hoverCursor: 'default',
    excludeFromExport: true,
  });
  line.set('circularLine', true);
  return line;
}

/** Quita del canvas cualquier línea circular ya dibujada (nunca toca guías ni elementos de diseño). */
export function removeCircularLines(canvas: Canvas): void {
  canvas.getObjects().filter(isCircularLineObject).forEach((object) => canvas.remove(object));
}

/**
 * Vuelve a dibujar las líneas circulares desde cero, según el estilo pedido
 * — se llama tanto al cambiar el estilo como cada vez que un elemento se
 * mueve/escala/rota/agrega/quita (ver `useFabricCanvas.ts`), así que siempre
 * refleja la geometría más reciente sin arrastrar estado propio de un
 * llamado al siguiente.
 */
export function renderCircularLines(canvas: Canvas, config: VirolaConfig, style: CircularLineStyle): void {
  removeCircularLines(canvas);
  if (style === 'none') {
    canvas.requestRenderAll();
    return;
  }

  const radii =
    style === 'single'
      ? [config.circularLineRadius]
      : [config.circularLineRadius - config.circularLineDoubleOffset, config.circularLineRadius + config.circularLineDoubleOffset];

  for (const radius of radii) {
    const line = createCircularLinePath(canvas, config, radius);
    if (line) {
      canvas.add(line);
    }
  }
  canvas.requestRenderAll();
}

/** Estilo de línea circular guardado en el canvas (`'none'` si nunca se tocó). */
export function getCircularLineStyle(canvas: Canvas): CircularLineStyle {
  const stored = canvas.get('circularLineStyle');
  return stored === 'single' || stored === 'double' ? stored : 'none';
}
