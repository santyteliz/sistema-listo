/**
 * Medidas y geometría de la virola.
 *
 * Medidas reales confirmadas por el cliente: diámetro exterior 94,0 mm,
 * diámetro interior 72,0 mm (diferencia radial: 11 mm). Fabric.js trabaja
 * siempre en píxeles, así que acá se define UNA sola escala interna
 * (`mmToPx`) y todo lo demás —radios, diámetros, tamaño del canvas— se
 * DERIVA matemáticamente de esa escala. Ningún otro archivo debe tener un
 * número de la virola escrito a mano: si hace falta un radio, se importa
 * de acá.
 *
 * La escala (`mmToPx`) es una decisión de visualización en pantalla, no
 * una medida física — no hace falta que 1mm real ocupe físicamente 1mm de
 * pantalla, solo que la relación 94:72 entre exterior e interior se
 * respete siempre, y hoy se respeta exactamente porque ambos radios salen
 * de la misma multiplicación.
 *
 * Lo que SIGUE pendiente (no inventar, ver docs/PRODUCTION-SPECS.md):
 * tolerancias/sangrados de producción, resolución final de grabado, y
 * cualquier margen de seguridad adicional que todavía no confirmó el
 * cliente. `textCurveRadius` e `iconPlacementRadius` son posiciones por
 * defecto del EDITOR dentro de la banda física ya confirmada (72–94 mm) —
 * no representan ningún margen de producción inventado.
 */
export interface VirolaConfig {
  /** Diámetro exterior real de la virola, en milímetros. */
  outerDiameterMm: number;
  /** Diámetro interior real de la virola, en milímetros. */
  innerDiameterMm: number;
  /** Escala única mm → px: cuántos píxeles de canvas representan 1 mm real. */
  mmToPx: number;
  /** Aire alrededor de la virola dentro del canvas, en píxeles (para handles de selección, etc.). */
  stageMarginPx: number;

  // --- A partir de acá, todo se deriva de lo anterior (ver buildVirolaConfig). ---

  /** Ancho del área de trabajo del canvas (derivado). */
  width: number;
  /** Alto del área de trabajo del canvas (derivado). */
  height: number;
  /** Radio interior de la virola en píxeles (derivado de innerDiameterMm). */
  innerRadius: number;
  /** Radio exterior de la virola en píxeles (derivado de outerDiameterMm). */
  outerRadius: number;
  /** Radio por defecto sobre el que se curva el texto (derivado, dentro de la banda real). */
  textCurveRadius: number;
  /** Radio por defecto donde se ubican los íconos (derivado; distinto del de texto a propósito, ver iconElement.ts). */
  iconPlacementRadius: number;
}

function buildVirolaConfig(params: {
  outerDiameterMm: number;
  innerDiameterMm: number;
  mmToPx: number;
  stageMarginPx: number;
}): VirolaConfig {
  const { outerDiameterMm, innerDiameterMm, mmToPx, stageMarginPx } = params;

  const outerRadius = (outerDiameterMm / 2) * mmToPx;
  const innerRadius = (innerDiameterMm / 2) * mmToPx;
  const bandWidth = outerRadius - innerRadius;

  return {
    outerDiameterMm,
    innerDiameterMm,
    mmToPx,
    stageMarginPx,
    width: outerRadius * 2 + stageMarginPx * 2,
    height: outerRadius * 2 + stageMarginPx * 2,
    innerRadius,
    outerRadius,
    // A mitad de camino entre el borde interior y el exterior de la banda real.
    textCurveRadius: innerRadius + bandWidth * 0.5,
    // Más cerca del borde exterior que el texto, para que nunca coincida
    // exactamente con textCurveRadius (si compartieran radio, el cuadro
    // delimitador del texto curvo puede tapar el punto donde arranca un
    // ícono — ver docs/DECISIONS.md / historial de iconElement.ts).
    iconPlacementRadius: innerRadius + bandWidth * 0.85,
  };
}

export const VIROLA_CONFIG: VirolaConfig = buildVirolaConfig({
  outerDiameterMm: 94,
  innerDiameterMm: 72,
  mmToPx: 5,
  stageMarginPx: 85,
});
