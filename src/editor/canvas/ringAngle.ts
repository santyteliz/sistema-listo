/**
 * Conversión entre un ángulo alrededor de la virola (0° = arriba, sentido
 * horario — la misma convención que ya usaban los íconos) y un punto/
 * dirección en el plano del canvas. Centralizado acá porque, a partir de
 * esta etapa, tanto los íconos (`iconElement.ts`, posición angular) como el
 * texto curvo (`curvedText.ts`, posición alrededor del anillo vía rotación)
 * comparten exactamente la misma convención — antes solo la usaban los
 * íconos.
 */

/** Punto sobre un círculo de radio dado, centrado en (centerX, centerY), para un ángulo dado. */
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
 * Inversa de `angleToPoint`: dado un desplazamiento (dx, dy) respecto del
 * centro de la virola, el ángulo (0-360, mismo sentido) que apunta hacia
 * ese punto. Se usa para convertir un arrastre del mouse (posición
 * atractiva de un objeto) de vuelta a "a qué ángulo de la virola
 * corresponde" — ver `handleTextMoving` en `useFabricCanvas.ts`.
 */
export function pointToAngleDeg(dx: number, dy: number): number {
  const angleRad = Math.atan2(dx, -dy);
  const angleDeg = (angleRad * 180) / Math.PI;
  return angleDeg < 0 ? angleDeg + 360 : angleDeg;
}

/** Normaliza cualquier ángulo (incluso negativo o > 360) al rango [0, 360). */
export function normalizeAngleDeg(angleDeg: number): number {
  const wrapped = angleDeg % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}
