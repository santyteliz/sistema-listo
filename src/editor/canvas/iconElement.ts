import { Path, type FabricObject } from 'fabric';
import type { VirolaConfig } from '../../config/virola.config';
import { getIconDefinition, type IconDefinition } from '../icons/iconLibrary';
import type { EditorSelection } from '../state/selection';

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

const DEFAULT_ICON_SCALE = 0.4;
const DEFAULT_STROKE = '#222222';
const DEFAULT_STROKE_WIDTH = 8;
const START_ANGLE_DEG = 90;
const ANGLE_STEP_DEG = 60;

/**
 * Nombres de las propiedades propias (no nativas de Fabric) que un ícono
 * guarda sobre sí mismo. Igual que con el texto curvo (ver curvedText.ts,
 * `TEXT_CUSTOM_PROPERTIES`), `canvas.toJSON()` no las incluye solo —
 * `actions.ts` las suma vía `canvas.toObject([...])` al serializar.
 * (`flipX`/`flipY` no están acá porque son propiedades nativas de Fabric:
 * se serializan solas.)
 */
export const ICON_CUSTOM_PROPERTIES = ['graphicKind', 'iconId', 'angleDeg'] as const;

/** Punto sobre el anillo de la virola para un ángulo dado (0° = arriba, sentido horario). */
export function angleToPoint(
  angleDeg: number,
  radius: number,
  centerX: number,
  centerY: number,
): { x: number; y: number } {
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: centerX + radius * Math.sin(angleRad),
    y: centerY - radius * Math.cos(angleRad),
  };
}

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
 */
export function applyIconAngle(icon: Path, angleDeg: number, config: VirolaConfig): void {
  const { x, y } = angleToPoint(angleDeg, config.iconPlacementRadius, config.width / 2, config.height / 2);
  icon.set({ left: x, top: y, angleDeg });
  icon.setCoords();
}

/** Crea un nuevo ícono de la biblioteca, ubicado sobre el anillo en el ángulo dado. */
export function createIconObject(iconDef: IconDefinition, config: VirolaConfig, angleDeg: number): Path {
  const icon = new Path(iconDef.svgPath, {
    originX: 'center',
    originY: 'center',
    fill: 'transparent',
    stroke: DEFAULT_STROKE,
    strokeWidth: DEFAULT_STROKE_WIDTH,
    strokeLineCap: 'round',
    strokeLineJoin: 'round',
    scaleX: DEFAULT_ICON_SCALE,
    scaleY: DEFAULT_ICON_SCALE,
  });
  icon.set({
    graphicKind: 'icon' satisfies GraphicElementKind,
    iconId: iconDef.id,
  });
  applyIconAngle(icon, angleDeg, config);
  return icon;
}

/** Ángulo inicial "razonable" para el N-ésimo ícono agregado (los reparte alrededor del anillo). */
export function getDefaultIconAngle(existingIconCount: number): number {
  return (START_ANGLE_DEG + existingIconCount * ANGLE_STEP_DEG) % 360;
}

/** Type guard: el objeto es un ícono de la biblioteca propia. */
export function isIconObject(object: FabricObject | null | undefined): object is Path {
  return !!object && object.get('graphicKind') === 'icon';
}

export function getIconAngle(icon: Path): number {
  const angle = icon.get('angleDeg');
  return typeof angle === 'number' ? angle : 0;
}

export function getIconId(icon: Path): string {
  const id = icon.get('iconId');
  return typeof id === 'string' ? id : '';
}

/**
 * Reemplaza la figura de un ícono ya agregado por la de otro ícono de la
 * biblioteca, conservando su posición, escala, rotación y espejado/
 * inversión. Se crea un objeto nuevo (la geometría de un Path no está
 * pensada para reemplazarse en el lugar) y se le copian las propiedades de
 * transformación del anterior antes de reemplazarlo en el canvas.
 */
export function buildReplacementIcon(current: Path, iconDef: IconDefinition, config: VirolaConfig): Path {
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
  return replacement;
}

/** Estado mínimo de UI derivado de un ícono seleccionado (ver EditorSelection). */
export function toIconSelection(icon: Path): EditorSelection {
  return {
    type: 'icon',
    iconId: getIconId(icon),
    flipX: !!icon.flipX,
    flipY: !!icon.flipY,
    angleDeg: getIconAngle(icon),
  };
}

export { getIconDefinition };
