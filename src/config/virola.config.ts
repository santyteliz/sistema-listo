/**
 * Medidas y parámetros de la virola.
 *
 * IMPORTANTE — VALORES PROVISORIOS: las medidas reales de producción todavía
 * no fueron confirmadas por el cliente (ver docs/PRODUCTION-SPECS.md). Los
 * valores de acá solo sirven para poder visualizar y desarrollar el editor.
 * Cuando se confirmen las medidas reales, se reemplazan ÚNICAMENTE en este
 * archivo — ningún otro lugar del código debe tener medidas hardcodeadas.
 *
 * Todas las medidas están en píxeles del canvas (no en milímetros ni en
 * ninguna unidad física real), porque todavía no sabemos la relación entre
 * píxeles y milímetros que va a pedir producción.
 */
export interface VirolaConfig {
  /** Ancho del área de trabajo del canvas. */
  width: number;
  /** Alto del área de trabajo del canvas. */
  height: number;
  /** Radio interior de la virola (borde con el cuerpo del mate). */
  innerRadius: number;
  /** Radio exterior de la virola. */
  outerRadius: number;
  /** Banda segura dentro de la virola donde se puede grabar contenido. */
  engravingArea: {
    minRadius: number;
    maxRadius: number;
  };
  /** Radio por defecto sobre el que se curva el texto. */
  textCurveRadius: number;
}

// PROVISORIO — ver comentario arriba. Reemplazar acá cuando lleguen las medidas reales.
export const VIROLA_CONFIG: VirolaConfig = {
  width: 600,
  height: 600,
  innerRadius: 160,
  outerRadius: 220,
  engravingArea: {
    minRadius: 170,
    maxRadius: 210,
  },
  textCurveRadius: 200,
};
