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
      curveOffset: number;
    }
  | {
      type: 'icon';
      iconId: string;
      flipX: boolean;
      flipY: boolean;
      angleDeg: number;
    };
