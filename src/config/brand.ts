/**
 * Tokens de marca de MateShop, extraídos del manual de marca provisto por
 * el cliente (`recursos-marca/manual-marca/`). Es la única fuente de
 * verdad para colores y tipografías de marca — ningún componente debe
 * escribir un hex o un nombre de fuente de marca "a mano", siempre importa
 * estas constantes.
 *
 * IMPORTANTE — esto es distinto de `fontLibrary.ts` (editor/fonts): esos
 * son los tipos de letra que el CLIENTE FINAL puede elegir para grabar su
 * texto en la virola (una decisión de producto, sin relación con el manual
 * de marca). Los tokens de acá son para la interfaz de la propia
 * aplicación (botones, paneles, navegación, branding) — nunca se usan
 * dentro del diseño que el usuario graba.
 *
 * Todavía NO están aplicados a ningún componente (eso es una etapa
 * posterior) — este archivo solo los deja disponibles y verificados.
 */

/** Paleta oficial (manual de marca, sección de color). No inventar otros valores. */
export const BRAND_COLORS = {
  /** Negro cálido — color primario (~35% de uso). */
  black: '#160f0d',
  /** Verde oliva — color primario / acento (~35% de uso). */
  olive: '#758a4f',
  /** Blanco hueso — color secundario, fondos claros (~20% de uso). */
  offWhite: '#f1f8f2',
  /** Gris — color terciario, texto secundario (~10% de uso). */
  gray: '#52524c',
} as const;

/**
 * Roles tipográficos según el manual de marca (sección de tipografía):
 * - `logo`: Call Free Room — uso puntual de marca/impacto, nunca para UI.
 * - `heading`: Stack Sans Notch — títulos y cuerpos no muy chicos.
 * - `ui`: Inter (peso Light) — interfaz, navegación, formularios, botones.
 *
 * Los tres se auto-hospedan desde `public/fonts/` (ver `brandFonts.css`) a
 * partir de los archivos reales que entregó el cliente, no de una fuente
 * "parecida" de un CDN.
 */
export const BRAND_FONTS = {
  logo: '"Call Free Room", serif',
  heading: '"Stack Sans Notch", sans-serif',
  ui: '"Inter", system-ui, sans-serif',
} as const;

/** Rutas de los logos oficiales (servidos como archivos estáticos desde `public/brand/`). */
export const BRAND_LOGO = {
  /** Isotipo solo (el mate) — para espacios chicos/cuadrados. */
  isotipo: '/brand/isotipo.png',
  /** Isotipo + wordmark — para espacios horizontales con lugar de sobra. */
  logotipo: '/brand/logotipo.png',
} as const;
