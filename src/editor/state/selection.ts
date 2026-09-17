/**
 * Estado mínimo de UI derivado de la selección actual en Fabric.js. React no
 * guarda una copia del objeto de Fabric, solo lo justo para que el panel
 * lateral sepa qué mostrar (ver docs/ARCHITECTURE.md).
 */
export type EditorSelection =
  | { type: 'none' }
  | {
      type: 'text';
      text: string;
      fontFamily: string;
      /** Tamaño realmente aplicado (después del auto-fit). */
      fontSize: number;
      /** Tamaño que el usuario pidió — puede ser mayor que fontSize si el auto-fit lo achicó. */
      desiredFontSize: number;
      /** true si ni siquiera al tamaño mínimo el texto entra en el arco disponible. */
      isOverflowing: boolean;
      inverted: boolean;
      /** Posición angular alrededor de la virola (0-360°, 0 = arriba, sentido horario). */
      curveOffset: number;
    }
  | {
      type: 'icon';
      iconId: string;
      flipX: boolean;
      flipY: boolean;
      /** Posición angular alrededor de la virola (dónde está ubicado el ícono). */
      angleDeg: number;
      /** Rotación propia del ícono (su "inclinación"), distinta de `angleDeg`. */
      rotation: number;
      scaleX: number;
      /** Posición actual (coordenadas del canvas, no de pantalla) — para ubicar el menú contextual. */
      left: number;
      top: number;
    };
