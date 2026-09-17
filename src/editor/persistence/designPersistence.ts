/**
 * Persistencia local del diseño (Etapa 17) — lectura/escritura de
 * `localStorage`, sin backend, sin cuenta, sin base de datos. Lógica PURA de
 * almacenamiento (ninguna dependencia de React/Fabric): recibe/devuelve el
 * mismo objeto plano que ya produce `actions.serializeDesign()` (más
 * `circularLineStyle`, ver `useDesignHistory.ts`, `takeSnapshot`) — no
 * define un formato nuevo, reutiliza tal cual el que ya usa Undo/Redo. Quién
 * decide CUÁNDO guardar/restaurar vive en `useDesignHistory.ts` (el único
 * lugar que ya sabe distinguir un cambio real de diseño de un evento
 * disparado por un `restoreDesign` en curso) — este archivo solo sabe
 * leer/escribir/validar la clave.
 */

/**
 * Clave única y específica de este producto — nunca algo genérico como
 * "design"/"state"/"data" que pueda chocar con otra cosa que use
 * `localStorage` en el mismo dominio (sección A2 del pedido).
 */
export const DESIGN_STORAGE_KEY = 'mateshop-personalizer-design';

/**
 * Versión del formato guardado — nunca la del diseño en sí (eso ya lo
 * versiona Fabric.js con su propio campo `version` dentro del snapshot).
 * Sirve para detectar un "formato antiguo/incompatible" (sección A6) sin
 * tener que adivinar a partir de la forma del JSON: si el día de mañana el
 * sobre (`DesignStorageEnvelope`) cambia de forma, se sube este número y
 * cualquier valor guardado con uno anterior se descarta limpiamente en vez
 * de intentar interpretarlo.
 */
export const DESIGN_STORAGE_SCHEMA_VERSION = 1;

interface DesignStorageEnvelope {
  schemaVersion: number;
  design: Record<string, unknown>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Chequeo de forma MÍNIMO (no exhaustivo a propósito): alcanza para
 * distinguir "esto es plausiblemente un sobre de este editor" de un JSON
 * corrupto, de otra cosa guardada bajo la misma clave, o de un sobre de una
 * versión futura/distinta — sin intentar validar cada propiedad de cada
 * objeto de Fabric.js (esa responsabilidad ya es de `loadFromJSON`, que
 * falla de forma controlada — ver `loadDesignSnapshot` — ante datos
 * verdaderamente inválidos).
 */
function isDesignStorageEnvelope(value: unknown): value is DesignStorageEnvelope {
  if (!isPlainObject(value)) {
    return false;
  }
  if (typeof value.schemaVersion !== 'number') {
    return false;
  }
  if (!isPlainObject(value.design)) {
    return false;
  }
  return Array.isArray(value.design.objects);
}

/**
 * Guarda el diseño actual. Nunca tira: `localStorage` puede fallar (modo
 * privado de Safari, cuota excedida, `localStorage` deshabilitado) y la
 * persistencia es una comodidad — si falla, el editor debe seguir
 * funcionando exactamente igual, solo sin recordar el diseño al refrescar.
 */
export function saveDesignSnapshot(design: Record<string, unknown>): void {
  const envelope: DesignStorageEnvelope = { schemaVersion: DESIGN_STORAGE_SCHEMA_VERSION, design };
  try {
    localStorage.setItem(DESIGN_STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // Ver el comentario de la función.
  }
}

/**
 * Lee el diseño guardado, o `null` si no hay ninguno, está corrupto, o es de
 * un formato antiguo/incompatible (sección A6 del pedido) — en cualquiera de
 * esos tres últimos casos, además ELIMINA la entrada inválida (para no
 * volver a toparse con el mismo JSON corrupto en la próxima carga) y, en
 * desarrollo, deja un `console.warn` controlado (nunca en producción, para
 * no ensuciar la consola de un usuario real).
 */
export function loadDesignSnapshot(): Record<string, unknown> | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(DESIGN_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    warnAndClear('el valor guardado no es JSON válido');
    return null;
  }

  if (!isDesignStorageEnvelope(parsed)) {
    warnAndClear('el valor guardado no tiene la forma esperada');
    return null;
  }

  if (parsed.schemaVersion !== DESIGN_STORAGE_SCHEMA_VERSION) {
    warnAndClear(`versión de formato incompatible (guardada: ${parsed.schemaVersion}, actual: ${DESIGN_STORAGE_SCHEMA_VERSION})`);
    return null;
  }

  return parsed.design;
}

function warnAndClear(reason: string): void {
  // `import.meta.env` (Vite) no existe fuera de un build/dev-server real —
  // en los tests (ejecutados con `tsx`, sin Vite) sería `undefined`; el
  // encadenamiento opcional evita que ESO tire, sin cambiar el
  // comportamiento real en el navegador/servidor de desarrollo.
  if (import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.warn(`[mateshop-personalizer] Diseño guardado ignorado (${reason}) — se empieza con un diseño vacío.`);
  }
  clearDesignSnapshot();
}

/** Elimina el diseño guardado (sección A7: usado también para dejar el storage limpio ante datos inválidos — el reset en sí NO necesita llamar esto, ver el comentario grande de `useDesignHistory.ts`). */
export function clearDesignSnapshot(): void {
  try {
    localStorage.removeItem(DESIGN_STORAGE_KEY);
  } catch {
    // Ver el comentario de `saveDesignSnapshot`.
  }
}
