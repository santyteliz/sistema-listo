/**
 * Tests de `designPersistence.ts` — lógica pura de storage, sin React ni
 * Fabric. `localStorage` no existe en Node por defecto (no hay `window`
 * global ni Web Storage sin flags experimentales) — se inyecta un mock
 * mínimo en memoria en `globalThis.localStorage` ANTES de importar el
 * módulo bajo prueba (el módulo referencia `localStorage` como global
 * "pelado", nunca `window.localStorage`, a propósito para que esto
 * funcione tanto en el navegador real como acá).
 *
 * Correr: `node --test src/editor/persistence/designPersistence.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
  get size(): number {
    return this.store.size;
  }
}

const memoryStorage = new MemoryStorage();
(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = memoryStorage;

const {
  saveDesignSnapshot,
  loadDesignSnapshot,
  clearDesignSnapshot,
  DESIGN_STORAGE_KEY,
  DESIGN_STORAGE_SCHEMA_VERSION,
} = await import('./designPersistence.ts');

function resetStorage(): void {
  memoryStorage.clear();
}

test('DESIGN_STORAGE_KEY es específica del producto, no un nombre genérico', () => {
  assert.equal(DESIGN_STORAGE_KEY, 'mateshop-personalizer-design');
  assert.notEqual(DESIGN_STORAGE_KEY, 'design');
  assert.notEqual(DESIGN_STORAGE_KEY, 'state');
  assert.notEqual(DESIGN_STORAGE_KEY, 'data');
});

test('loadDesignSnapshot: sin nada guardado, devuelve null (primera carga)', () => {
  resetStorage();
  assert.equal(loadDesignSnapshot(), null);
});

test('save + load: round-trip exacto de un diseño válido', () => {
  resetStorage();
  const design = { objects: [{ type: 'Path', left: 10, top: 20 }], circularLineStyle: 'double', version: '6.0.2' };
  saveDesignSnapshot(design);
  const loaded = loadDesignSnapshot();
  assert.deepEqual(loaded, design);
});

test('save + load: un diseño VACÍO (objects: []) se guarda y se lee igual que cualquier otro — no es un caso especial', () => {
  resetStorage();
  const empty = { objects: [], circularLineStyle: 'none' };
  saveDesignSnapshot(empty);
  assert.deepEqual(loadDesignSnapshot(), empty);
});

test('loadDesignSnapshot: JSON corrupto (no parseable) se ignora, no rompe, y limpia la entrada inválida', () => {
  resetStorage();
  memoryStorage.setItem(DESIGN_STORAGE_KEY, '{esto no es JSON válido');
  assert.equal(loadDesignSnapshot(), null);
  // La entrada inválida se elimina — no vuelve a aparecer en la próxima lectura.
  assert.equal(memoryStorage.getItem(DESIGN_STORAGE_KEY), null);
});

test('loadDesignSnapshot: JSON válido pero de forma completamente distinta (no es un sobre de este editor) se ignora y se limpia', () => {
  resetStorage();
  memoryStorage.setItem(DESIGN_STORAGE_KEY, JSON.stringify({ algoTotalmenteDistinto: true }));
  assert.equal(loadDesignSnapshot(), null);
  assert.equal(memoryStorage.getItem(DESIGN_STORAGE_KEY), null);
});

test('loadDesignSnapshot: sobre con "design" sin "objects" (forma de Fabric inválida) se ignora y se limpia', () => {
  resetStorage();
  memoryStorage.setItem(
    DESIGN_STORAGE_KEY,
    JSON.stringify({ schemaVersion: DESIGN_STORAGE_SCHEMA_VERSION, design: { noHayObjects: true } }),
  );
  assert.equal(loadDesignSnapshot(), null);
  assert.equal(memoryStorage.getItem(DESIGN_STORAGE_KEY), null);
});

test('loadDesignSnapshot: versión de esquema antigua/incompatible se ignora y se limpia (formato antiguo)', () => {
  resetStorage();
  memoryStorage.setItem(
    DESIGN_STORAGE_KEY,
    JSON.stringify({ schemaVersion: DESIGN_STORAGE_SCHEMA_VERSION + 999, design: { objects: [] } }),
  );
  assert.equal(loadDesignSnapshot(), null);
  assert.equal(memoryStorage.getItem(DESIGN_STORAGE_KEY), null);
});

test('clearDesignSnapshot: elimina lo guardado; una lectura posterior da null', () => {
  resetStorage();
  saveDesignSnapshot({ objects: [] });
  assert.notEqual(loadDesignSnapshot(), null);
  clearDesignSnapshot();
  assert.equal(loadDesignSnapshot(), null);
});

test('saveDesignSnapshot: si localStorage.setItem tira (cuota excedida, modo privado, etc.), no propaga la excepción', () => {
  resetStorage();
  const original = memoryStorage.setItem.bind(memoryStorage);
  memoryStorage.setItem = () => {
    throw new Error('QuotaExceededError simulado');
  };
  try {
    assert.doesNotThrow(() => saveDesignSnapshot({ objects: [] }));
  } finally {
    memoryStorage.setItem = original;
  }
});

test('loadDesignSnapshot: si localStorage.getItem tira, devuelve null en vez de propagar', () => {
  resetStorage();
  const original = memoryStorage.getItem.bind(memoryStorage);
  memoryStorage.getItem = () => {
    throw new Error('SecurityError simulado (localStorage deshabilitado)');
  };
  try {
    assert.equal(loadDesignSnapshot(), null);
  } finally {
    memoryStorage.getItem = original;
  }
});
