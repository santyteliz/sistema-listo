/**
 * Color de "tinta" del diseño real (lo que terminaría grabado en la
 * virola) — distinto del color de marca de la interfaz (`--brand-black` en
 * `src/index.css`, que es para el texto/UI del sitio, no para el diseño).
 *
 * Única fuente de verdad: texto (`curvedText.ts`), íconos (`iconElement.ts`)
 * y líneas circulares (`circularLines.ts`) importan este mismo valor — antes
 * de esto, texto e íconos ya usaban el mismo `#222222` pero como dos
 * literales hardcodeados independientes (una coincidencia de valor, no una
 * fuente compartida), y las líneas circulares usaban un tercer valor
 * distinto (`#8a8680`, el mismo tono gris-oliva de las guías). Con este
 * archivo, los tres importan el mismo símbolo — si el color del diseño
 * cambia alguna vez, se cambia acá una sola vez.
 */
export const DESIGN_INK_COLOR = '#222222';
