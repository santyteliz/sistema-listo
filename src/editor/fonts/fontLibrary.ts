/**
 * Biblioteca curada de tipografías del editor (ver docs/PRODUCT.md). Se
 * cargan de verdad desde Google Fonts — la hoja de estilos está declarada en
 * `index.html` — y acá solo se listan los nombres que usa la UI y Fabric.js.
 */
export interface FontOption {
  /** Nombre que ve el usuario y valor de `fontFamily` que usa Fabric.js. */
  label: string;
}

export const FONT_OPTIONS: readonly FontOption[] = [
  { label: 'Lato' },
  { label: 'Playfair Display' },
  { label: 'Poppins' },
  { label: 'Merriweather' },
  { label: 'Dancing Script' },
];

export const DEFAULT_FONT_FAMILY: string = FONT_OPTIONS[0].label;

/**
 * Fuerza la carga real de las tipografías con la Font Loading API del
 * navegador, y espera a que estén listas. Es necesario porque un <canvas>
 * no espera solo con que la hoja de estilos de Google Fonts haya cargado:
 * si Fabric.js dibuja texto con una tipografía que todavía no terminó de
 * descargarse/parsearse, el navegador cae en una tipografía de reemplazo.
 * Nunca tira: si una fuente falla, se resuelve igual (con fallback) y el
 * resto del editor sigue funcionando.
 */
export async function preloadEditorFonts(): Promise<void> {
  await Promise.allSettled(
    FONT_OPTIONS.map((font) => document.fonts.load(`16px "${font.label}"`)),
  );
}
