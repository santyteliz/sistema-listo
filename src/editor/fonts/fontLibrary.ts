/**
 * Biblioteca curada de tipografías del editor (ver docs/PRODUCT.md). Se
 * cargan de verdad desde Google Fonts — la hoja de estilos está declarada en
 * `index.html` — y acá solo se listan los nombres que usa la UI y Fabric.js.
 */
export interface FontOption {
  /**
   * Nombre que ve el usuario en el selector (categoría de producto: "Clásica",
   * "Manuscrita", etc. — ver docs/PRODUCT.md). Puramente de presentación, no
   * es un nombre de fuente real.
   */
  label: string;
  /**
   * Nombre técnico real de la tipografía (el que declara Google Fonts en
   * `index.html`, y el valor que efectivamente se guarda en `fontFamily` de
   * Fabric.js / se serializa con el diseño). Separado de `label` porque, a
   * partir de las 8 categorías nuevas, el nombre que ve el usuario ("De
   * puño") ya no coincide con el nombre real de la tipografía ("Caveat") —
   * en las 5 fuentes originales los dos valores siguen siendo iguales
   * (nunca se les cambió el nombre visible), así que ningún diseño ya
   * guardado con esas 5 se ve afectado.
   */
  family: string;
}

export const FONT_OPTIONS: readonly FontOption[] = [
  { label: 'Lato', family: 'Lato' },
  { label: 'Playfair Display', family: 'Playfair Display' },
  { label: 'Poppins', family: 'Poppins' },
  { label: 'Merriweather', family: 'Merriweather' },
  { label: 'Dancing Script', family: 'Dancing Script' },
  // 8 categorías nuevas (ver docs/PRODUCT.md) — cada una con una tipografía
  // real de Google Fonts distinta entre sí y distinta de las 5 de arriba,
  // para que ninguna de las 13 opciones del selector se vea igual a otra.
  { label: 'Clásica', family: 'Lora' },
  { label: 'Manuscrita', family: 'Sacramento' },
  { label: 'Firma', family: 'Alex Brush' },
  { label: 'Bloque', family: 'Anton' },
  { label: 'Romana', family: 'Cinzel' },
  { label: 'Condensada', family: 'Oswald' },
  { label: 'De puño', family: 'Caveat' },
  { label: 'Imprenta', family: 'Montserrat' },
];

export const DEFAULT_FONT_FAMILY: string = FONT_OPTIONS[0].family;

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
    FONT_OPTIONS.map((font) => document.fonts.load(`16px "${font.family}"`)),
  );
}
