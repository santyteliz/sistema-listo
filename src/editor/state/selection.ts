/**
 * Estado mínimo de UI derivado de la selección actual en Fabric.js. React no
 * guarda una copia del objeto de Fabric, solo lo justo para que el panel
 * lateral sepa qué mostrar (ver docs/ARCHITECTURE.md).
 */
export type EditorSelection = { type: 'none' } | { type: 'text'; text: string };
