import { Path } from 'fabric';
import type { VirolaConfig } from '../../config/virola.config';

/**
 * Máscara de recorte visual compartida por íconos y texto cuando NO están
 * seleccionados: un anillo (donut), visible únicamente entre el radio
 * interior (Ø72) y el exterior (Ø94) de la banda física real de la virola —
 * cualquier parte de un elemento que invada el círculo interior o se pase
 * del exterior queda oculta mientras no está seleccionado (ver
 * `setIconVisibilityClip` en iconElement.ts y `setTextVisibilityClip` en
 * curvedText.ts, que asignan/quitan esto como `clipPath` según selección).
 *
 * Antes (icono) el recorte era un único círculo exterior (Ø94) — ocultaba lo
 * que se pasaba hacia afuera, pero no lo que invadía el agujero central
 * (Ø72). Con el nuevo margen de manipulación (íconos y ahora también texto
 * pueden invadir levemente Ø72 o Ø94, ver ICON_MARGIN_PX/TEXT_RADIAL_MARGIN_PX),
 * hace falta recortar también por dentro.
 *
 * Construcción: mismo truco que `drawVirolaBand` en guides.ts (dos círculos,
 * exterior e interior, en un solo `Path` con `fillRule: 'evenodd'` — el área
 * interior se "resta" sola, dejando solo la banda visible). No se importa
 * esa función porque es privada de guides.ts (guía de renderizado, no de
 * recorte) — se reconstruye acá con la misma fórmula matemática exacta.
 *
 * `absolutePositioned: true` interpreta este path en coordenadas de la
 * ESCENA (el centro real de la virola), no relativas al objeto al que se lo
 * asigne (que puede estar en cualquier posición/ángulo/escala) — así el
 * recorte siempre representa el anillo real, sin importar qué elemento lo
 * use. `excludeFromExport: true` (verificado en el código fuente de
 * Fabric 6.0.2: `this.clipPath && !this.clipPath.excludeFromExport` antes de
 * serializar) es lo que garantiza que nunca aparezca en
 * `toObject()`/`toJSON()` — puramente de rendering, no toca la exportación.
 */
function circlePathD(centerX: number, centerY: number, radius: number): string {
  return (
    `M ${centerX - radius} ${centerY} ` +
    `A ${radius} ${radius} 0 1 0 ${centerX + radius} ${centerY} ` +
    `A ${radius} ${radius} 0 1 0 ${centerX - radius} ${centerY} Z`
  );
}

export function createRingVisibilityMask(config: VirolaConfig): Path {
  const centerX = config.width / 2;
  const centerY = config.height / 2;
  const d = [
    circlePathD(centerX, centerY, config.outerRadius),
    circlePathD(centerX, centerY, config.innerRadius),
  ].join(' ');

  return new Path(d, {
    fillRule: 'evenodd',
    absolutePositioned: true,
    excludeFromExport: true,
    selectable: false,
    evented: false,
  });
}
