/**
 * Biblioteca propia de íconos del editor (ver docs/PRODUCT.md,
 * "Edición de íconos", y docs/ARCHITECTURE.md — "Los íconos se preparan
 * como SVGs propios/curados"). Son recursos de la propia aplicación, nunca
 * contenido de terceros ni subido por usuarios: se definen acá como datos
 * de trazo (`d` de un `<path>`) y se dibujan siempre a través de Fabric.js
 * (`new Path(...)`) o de JSX (`<path d={...} />`), nunca con `innerHTML` ni
 * insertando SVG ajeno en el DOM (ver docs/ARCHITECTURE.md, "SVG y
 * seguridad").
 *
 * Es un conjunto chico a propósito (no una librería masiva de terceros):
 * pensado para crecer agregando entradas acá, no para cubrir todos los
 * casos de una — cada ícono es una sola figura de línea (sin relleno),
 * simple y limpia, apta para grabado láser.
 *
 * El `viewBox` de referencia de todos los `d` es `0 0 100 100`.
 */
export interface IconDefinition {
  /** ID estable — no cambiar una vez publicado (queda en diseños serializados). */
  id: string;
  /** Nombre visible en el selector. */
  name: string;
  /** Datos de trazo del ícono (uno o más subpaths), en un viewBox 0 0 100 100. */
  svgPath: string;
}

export const ICON_LIBRARY: readonly IconDefinition[] = [
  {
    id: 'heart',
    name: 'Corazón',
    svgPath:
      'M50,88 C20,65 5,45 5,28 C5,12 18,2 32,2 C42,2 48,8 50,15 ' +
      'C52,8 58,2 68,2 C82,2 95,12 95,28 C95,45 80,65 50,88 Z',
  },
  {
    id: 'star',
    name: 'Estrella',
    svgPath:
      'M50,5 L60.58,35.44 L92.8,36.09 L67.12,55.56 L76.45,86.41 ' +
      'L50,68 L23.55,86.41 L32.88,55.56 L7.2,36.09 L39.42,35.44 Z',
  },
  {
    id: 'infinity',
    name: 'Infinito',
    svgPath:
      'M20,50 C20,35 35,35 50,50 C65,65 80,65 80,50 ' +
      'C80,35 65,35 50,50 C35,65 20,65 20,50 Z',
  },
  {
    id: 'leaf',
    name: 'Hoja',
    svgPath: 'M50,10 C75,25 85,55 50,90 C15,55 25,25 50,10 Z M50,22 L50,78',
  },
  {
    id: 'mate',
    name: 'Mate',
    svgPath:
      'M30,45 C30,30 40,20 50,20 C60,20 70,30 70,45 C70,65 60,85 50,85 ' +
      'C40,85 30,65 30,45 Z M55,35 L82,12 M89,10 A4,4 0 1,1 81,10 A4,4 0 1,1 89,10',
  },
  {
    id: 'sun',
    name: 'Sol',
    svgPath:
      'M65,50 A15,15 0 1,1 35,50 A15,15 0 1,1 65,50 ' +
      'M70,50 L82,50 M64.14,64.14 L72.63,72.63 M50,70 L50,82 M35.86,64.14 L27.37,72.63 ' +
      'M30,50 L18,50 M35.86,35.86 L27.37,27.37 M50,30 L50,18 M64.14,35.86 L72.63,27.37',
  },
] as const;

export function getIconDefinition(id: string): IconDefinition | undefined {
  return ICON_LIBRARY.find((icon) => icon.id === id);
}
