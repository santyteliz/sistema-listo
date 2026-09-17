// Etapa 8D — lógica de la experiencia "Subí tu propio ícono", separada de
// `IconLibraryDrawer.tsx` (que solo renderiza) para poder testearla igual
// que el resto del proyecto: `node --test`, sin DOM/jsdom, sin dependencias
// nuevas. `UploadIconView` (el componente) consume `uploadFlowReducer` vía
// `useReducer` en vez de una cadena de `setState` sueltos — mismo resultado
// visual, pero las transiciones de estado quedan en una función pura
// verificable acá.
import type { IconAsset } from './iconCatalog';
import type { SvgIconGeometry } from './svgIconExtractor';
import { MAX_RASTER_UPLOAD_FILE_SIZE_BYTES } from './uploadRasterValidation';

export type UploadFlowState =
  | { step: 'idle' }
  | { step: 'drag-over' }
  | { step: 'processing' }
  | { step: 'preview'; icon: IconAsset }
  | { step: 'error'; message: string };

export type UploadFlowAction =
  | { type: 'drag-enter' }
  | { type: 'drag-leave' }
  | { type: 'validation-failed'; message: string }
  | { type: 'processing-started' }
  | { type: 'extraction-failed'; message: string }
  | { type: 'extraction-succeeded'; icon: IconAsset }
  | { type: 'cancel' };

export const INITIAL_UPLOAD_FLOW_STATE: UploadFlowState = { step: 'idle' };

/**
 * Única fuente de verdad de las transiciones de la vista de upload. A
 * propósito, `drag-enter` solo tiene efecto desde `idle`/`error` — un
 * `dragover` disparado mientras ya se está `processing` (petición en
 * vuelo) o mostrando un `preview` (archivo ya confirmado como válido) no
 * debe pisar ese estado con el highlight de dropzone.
 */
export function uploadFlowReducer(state: UploadFlowState, action: UploadFlowAction): UploadFlowState {
  switch (action.type) {
    case 'drag-enter':
      return state.step === 'idle' || state.step === 'error' ? { step: 'drag-over' } : state;
    case 'drag-leave':
      return state.step === 'drag-over' ? { step: 'idle' } : state;
    case 'validation-failed':
      return { step: 'error', message: action.message };
    case 'processing-started':
      return { step: 'processing' };
    case 'extraction-failed':
      return { step: 'error', message: action.message };
    case 'extraction-succeeded':
      return { step: 'preview', icon: action.icon };
    case 'cancel':
      return { step: 'idle' };
    default:
      return state;
  }
}

/** Texto de la acción principal — depende de si estamos agregando un ícono nuevo o reemplazando el seleccionado (mismo `iconPickerMode` que ya usa el resto del drawer). */
export function uploadConfirmLabel(mode: 'add' | 'replace'): string {
  return mode === 'replace' ? 'Reemplazar ícono' : 'Agregar ícono';
}

/**
 * Copy fijo del formato aceptado — un solo lugar, para que drawer y
 * validación de archivo nunca digan cosas distintas. Etapa 9E: el cargador
 * público pasó de SVG a PNG/WebP (ver el informe de esa etapa) — el tamaño
 * se deriva de `MAX_RASTER_UPLOAD_FILE_SIZE_BYTES` (`uploadRasterValidation.ts`)
 * en vez de repetir el número a mano, para no tener dos fuentes de verdad.
 */
export const UPLOAD_FORMAT_HINT = `Formato PNG o WebP · Máximo ${MAX_RASTER_UPLOAD_FILE_SIZE_BYTES / (1024 * 1024)} MB`;

/**
 * Deriva un nombre de presentación a partir del nombre de archivo — nunca
 * se inventa una descripción, solo se saca la extensión (mismo criterio ya
 * usado por `deriveName` en `scripts/icon-import/importConfig.ts` para los
 * PDFs del catálogo). Reconoce `.svg` (formato legado de `SvgIconGeometry`,
 * ver el tipo de `buildUploadedIconAsset` más abajo) y `.png`/`.webp`
 * (Etapa 9E, el cargador público real hoy) — cualquier otra extensión
 * queda tal cual en el nombre, nunca se le inventa un recorte.
 */
export function nameFromFileName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.(svg|png|webp)$/i, '');
  return withoutExtension.trim().length > 0 ? withoutExtension : 'Mi ícono';
}

/**
 * Recibe la geometría COMPLETA que devuelve `extractIconFromSvg`
 * (`SvgIconGeometry`, `svgIconExtractor.ts`) — antes de esta corrección el
 * parámetro estaba tipado con un subconjunto a mano que no incluía
 * `layers`, así que un ícono compuesto (Etapa 8E — `boca 02.svg`, ink/
 * paper) llegaba hasta acá con sus capas completas y salía sin ellas: el
 * `IconAsset` resultante quedaba indistinguible de un ícono simple, y
 * `createIconObject` (`iconElement.ts`) terminaba usando el fallback
 * `svgPath` (unión de las capas `ink`, sin las `paper`) en vez del
 * `Group` compuesto real. Acá no se reconstruye ni se reinterpreta
 * `layers` — se copia tal cual, en el mismo orden, cuando está presente.
 */
export function buildUploadedIconAsset(
  fileName: string,
  geometry: SvgIconGeometry,
): IconAsset {
  const now = new Date().toISOString();
  return {
    id: `upload-${crypto.randomUUID()}`,
    name: nameFromFileName(fileName),
    categoryId: '__uploads__',
    svgPath: geometry.svgPath,
    paintMode: geometry.paintMode,
    fillRule: geometry.fillRule,
    strokeWidth: geometry.strokeWidth,
    ...(geometry.layers ? { layers: geometry.layers } : {}),
    order: 0,
    active: true,
    source: 'upload',
    createdAt: now,
    updatedAt: now,
  };
}
