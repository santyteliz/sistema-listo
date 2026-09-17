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
  /**
   * Cuánto lugar radial hay, desde `textCurveRadius`, hasta cualquiera de
   * los dos bordes de la banda física (derivado: la mitad de `bandWidth`,
   * porque `textCurveRadius` está exactamente a mitad de camino). El texto
   * curvo se apoya con la base sobre `textCurveRadius` y el cuerpo de las
   * letras "crece" en sentido radial desde ahí — sin este límite, una
   * tipografía grande puede pasar por encima del ancho de arco disponible
   * y aun así sobresalir del anillo hacia adentro o hacia afuera (ver
   * curvedText.ts, `GLYPH_HEIGHT_RATIO`).
   */
  maxTextGlyphHeight: number;
  /**
   * Radio de la línea circular decorativa "Simple" (y radio CENTRAL del par
   * "Doble", ver `circularLineDoubleOffset`) — ver `circularLines.ts`.
   *
   * Vuelto al radio MEDIO de la banda (mismo criterio que `textCurveRadius`/
   * `iconPlacementRadius`, centrado entre Ø72 y Ø94) — una iteración
   * intermedia lo había corrido al tercio exterior (~82-88% del ancho de
   * banda) a partir de una lectura manual del video de referencia de Zizou,
   * pero esa lectura era una estimación con margen de error reconocido, y
   * el usuario pidió explícitamente volver al centro de la banda. No
   * modificar esto de nuevo sin evidencia visual concreta y confirmada.
   */
  circularLineRadius: number;
  /**
   * Cuánto se separa cada línea del radio medio, hacia cada lado, en la
   * línea circular decorativa "Doble" (derivado: 10% de `bandWidth` por
   * lado, así la separación TOTAL entre las dos líneas es el 20% del ancho
   * de banda real — valor de diseño confirmado con el usuario, no una
   * referencia visual extraíble de las capturas disponibles en
   * `referencias/`, que solo muestran el selector en "No"). Ver
   * `circularLines.ts`.
   */
  circularLineDoubleOffset: number;
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
    // A mitad de camino entre el borde interior y el exterior de la banda real
    // (radio medio de la franja de diseño, 41.5mm con las medidas actuales:
    // (47+36)/2). Los íconos usan el MISMO criterio radial que el texto a
    // propósito — ambos nacen centrados radialmente en la franja — así que
    // `iconPlacementRadius` comparte exactamente esta fórmula (ver abajo).
    textCurveRadius: innerRadius + bandWidth * 0.5,
    // Antes usaba 0.85 (más cerca del borde exterior que el texto) para
    // evitar coincidir exactamente con `textCurveRadius` — ya no hace falta:
    // texto e íconos nuevos ocupan ángulos por defecto distintos (0° el
    // texto; 180°/90°/270° los íconos, ver `iconElement.ts`), así que
    // comparten radio sin superponerse. El pedido explícito de esta etapa es
    // que los íconos nazcan en el mismo radio medio que el texto.
    iconPlacementRadius: innerRadius + bandWidth * 0.5,
    maxTextGlyphHeight: bandWidth / 2,
    // Radio medio de la banda — ver el comentario grande de
    // `circularLineRadius` más arriba (vuelto acá tras una iteración
    // intermedia que lo había corrido al tercio exterior).
    circularLineRadius: innerRadius + bandWidth * 0.5,
    circularLineDoubleOffset: bandWidth * 0.1,
  };
}

export const VIROLA_CONFIG: VirolaConfig = buildVirolaConfig({
  outerDiameterMm: 94,
  innerDiameterMm: 72,
  mmToPx: 5,
  stageMarginPx: 85,
});
