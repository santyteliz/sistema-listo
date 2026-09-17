import { useCallback, useEffect, useRef, useState } from 'react';
import type { EditorActions } from '../canvas/actions';
import { getCircularLineStyle } from '../canvas/circularLines';
import { loadDesignSnapshot, saveDesignSnapshot } from '../persistence/designPersistence';

/**
 * Historial de estados del diseño (Deshacer/Rehacer). Construido ENTERAMENTE
 * sobre la interfaz pública `EditorActions` que ya existe
 * (`getCanvas()`/`serializeDesign()`/`restoreDesign()`) — no toca
 * `useFabricCanvas.ts` ni `actions.ts` para leer o escribir estado, así que
 * no hay ningún riesgo de alterar la lógica del canvas en sí (movimiento,
 * resize, rotación, containment, líneas circulares, etc.).
 *
 * Cada entrada del historial es un snapshot COMPLETO del diseño —
 * `actions.serializeDesign()`, el mismo mecanismo que ya usa el proyecto,
 * nunca un formato nuevo — serializado a string con `JSON.stringify` para
 * poder compararlos por igualdad simple (detectar duplicados) sin
 * reimplementar una comparación profunda de objetos.
 *
 * Modelo de 3 pilas (como cualquier editor con Undo/Redo):
 * - `pastRef`: snapshots más viejos que el estado visible ahora mismo, el
 *   más reciente al final (tope = próximo Undo).
 * - `currentRef`: el snapshot del estado que está en pantalla ahora mismo
 *   (no es necesariamente el último commit — cambia con Undo/Redo también).
 * - `futureRef`: snapshots más nuevos que el estado visible ahora, el más
 *   próximo primero (tope = próximo Redo). Se vacía por completo apenas se
 *   confirma un cambio real nuevo (ver `commit`) — esa es la "rama futura"
 *   que se descarta después de un Undo seguido de una modificación.
 */

const MAX_HISTORY_STATES = 50;

/**
 * Ventana de agrupación: cualquier evento del canvas relevante para el
 * historial reinicia este temporizador — recién cuando pasan
 * `COMMIT_DEBOUNCE_MS` sin que llegue un evento nuevo se toma UN snapshot.
 * Así, un gesto continuo (resize/rotación del ContextualToolbar, un slider
 * de posición, arrastrar el mouse) que dispara `object:modified`/
 * `text:changed` decenas de veces termina generando una sola entrada de
 * historial — sin tocar el toolbar, los sliders, ni ningún gesto existente
 * para lograrlo.
 */
const COMMIT_DEBOUNCE_MS = 450;

export interface DesignHistory {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
}

export function useDesignHistory(actions: EditorActions | null): DesignHistory {
  const pastRef = useRef<string[]>([]);
  const currentRef = useRef<string | null>(null);
  const futureRef = useRef<string[]>([]);

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  /**
   * Protección contra recursión (punto crítico del pedido): mientras un
   * Undo/Redo está aplicando un `restoreDesign(...)`, ese mismo restore
   * dispara de nuevo eventos del canvas (`object:added`, etc. — confirmado
   * leyendo `restoreDesign` en actions.ts, que reconstruye vía
   * `canvas.loadFromJSON`). Sin esta bandera, cada Undo terminaría
   * empujando un estado nuevo que pisa la propia pila de Redo. No modifica
   * `restoreDesign` en sí — el guard vive enteramente acá, del lado que
   * escucha los eventos.
   */
  const isRestoringRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * `actions.serializeDesign()` tal cual NO alcanza para un snapshot de
   * historial: `circularLineStyle` es una propiedad del CANVAS (no de un
   * objeto) que solo existe una vez que el usuario tocó el panel de líneas
   * al menos una vez (`canvas.set('circularLineStyle', …)`, ver
   * `setCircularLineStyle`/`resetDesign` en actions.ts) — antes de eso está
   * `undefined`, y `JSON.stringify` DESCARTA las claves `undefined` por
   * completo. Un snapshot tomado antes de tocar ese panel queda sin la
   * clave `circularLineStyle` — y `canvas.loadFromJSON` (dentro de
   * `restoreDesign`) solo SOBRESCRIBE las propiedades que el JSON SÍ trae,
   * nunca limpia una que ya esté en memoria: sin este arreglo, deshacer
   * desde "Doble" hasta un estado anterior a haber elegido cualquier
   * estilo dejaría las líneas dibujadas (bug real, encontrado probando el
   * Caso C). El arreglo vive ENTERAMENTE acá — no en `serializeDesign()`
   * ni `restoreDesign()` — reutilizando `getCircularLineStyle` (mismo
   * fallback a `'none'` que ya usa el resto del editor) para que la clave
   * siempre esté presente, con un valor real, en TODO snapshot.
   */
  const takeSnapshot = useCallback((editorActions: EditorActions): string => {
    const design = editorActions.serializeDesign();
    return JSON.stringify({
      ...design,
      circularLineStyle: getCircularLineStyle(editorActions.getCanvas()),
    });
  }, []);

  const syncButtonsState = useCallback(() => {
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(futureRef.current.length > 0);
  }, []);

  const clearPendingCommit = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  /**
   * Etapa 17 — persiste `currentRef` (el string ya armado por `takeSnapshot`,
   * el MISMO formato que ya usa el historial en memoria — ver el comentario
   * grande de `designPersistence.ts` sobre por qué no hay un formato
   * paralelo) en `localStorage`. Se llama desde `commit`/`undo`/`redo`: los
   * tres son los únicos lugares donde `currentRef` cambia por una razón que
   * el usuario reconocería como "esto es lo que hay ahora" (sección A4/A8
   * del pedido — nunca en cada pixel de un gesto en curso, que sigue
   * agrupado por el debounce existente de `commit`). Nunca se llama desde la
   * restauración inicial (`seedFromCurrentCanvas`, más abajo): ese valor ya
   * viene DE `localStorage`, volver a escribirlo sería un no-op costoso y,
   * peor, el primer paso de un ciclo restore→save→restore→save que el
   * pedido pide evitar explícitamente (sección A9) — acá ni siquiera hay
   * ciclo posible, porque restaurar nunca dispara esta función.
   */
  const persistCurrent = useCallback(() => {
    if (currentRef.current === null) {
      return;
    }
    try {
      saveDesignSnapshot(JSON.parse(currentRef.current) as Record<string, unknown>);
    } catch {
      // `currentRef.current` siempre viene de `JSON.stringify` en
      // `takeSnapshot`, así que este catch no debería poder disparar nunca
      // en la práctica — existe solo para que un error de persistencia
      // (que ya se maneja adentro de `saveDesignSnapshot`) jamás pueda
      // interrumpir un commit/undo/redo ya en curso.
    }
  }, []);

  /**
   * Toma el snapshot AHORA y lo confirma como un estado nuevo del
   * historial, si y solo si es distinto del estado actual — así se evitan
   * entradas duplicadas (ej. "Empezar desde cero" sobre una virola ya
   * vacía, o un gesto que termina sin cambio neto). Empujar un estado
   * nuevo siempre vacía `future`: es la rama "vieja" de Redo, que dejó de
   * tener sentido en cuanto hubo una modificación real distinta.
   */
  const commit = useCallback(() => {
    if (!actions || isRestoringRef.current) {
      return;
    }
    const snapshot = takeSnapshot(actions);
    if (snapshot === currentRef.current) {
      return;
    }
    if (currentRef.current !== null) {
      pastRef.current.push(currentRef.current);
      if (pastRef.current.length > MAX_HISTORY_STATES) {
        pastRef.current.shift();
      }
    }
    currentRef.current = snapshot;
    futureRef.current = [];
    syncButtonsState();
    persistCurrent();
  }, [actions, syncButtonsState, takeSnapshot, persistCurrent]);

  /**
   * Confirma YA MISMO un commit que estaba esperando el debounce, en vez de
   * esperar los `COMMIT_DEBOUNCE_MS` restantes — usado por `undo`/`redo`
   * (ver el comentario grande ahí) para que un gesto recién terminado pero
   * todavía no confirmado cuente como el ÚLTIMO paso antes de deshacer, en
   * vez de perderse silenciosamente.
   *
   * A propósito NO llama a `commit()` cuando NO hay ningún commit pendiente
   * (`debounceTimerRef.current === null`): un `commit()` de más ahí
   * comparaba el snapshot recién tomado del canvas contra `currentRef` para
   * decidir si hay algo nuevo que confirmar — comparación que, se descubrió
   * probando esta misma corrección, puede dar un falso positivo justo
   * después de un Deshacer/Rehacer anterior, porque `canvas.loadFromJSON`
   * (dentro de `restoreDesign`) no garantiza que un snapshot tomado ANTES de
   * restaurar y otro tomado DESPUÉS de restaurar la MISMA información sean
   * exactamente el mismo string (aunque el diseño visible sea idéntico) —
   * un commit de más ahí vaciaba `futureRef` sin necesidad (ver `commit`),
   * rompiendo Rehacer inmediatamente después de un Deshacer. Limitando el
   * flush a "solo si había un timer pendiente de verdad" esa comparación
   * nunca se ejecuta fuera del caso real que hace falta arreglar (un gesto
   * genuinamente sin confirmar), y el comportamiento para cualquier
   * Deshacer/Rehacer sin nada pendiente queda idéntico al de antes de esta
   * corrección.
   */
  const flushPendingCommit = useCallback(() => {
    if (debounceTimerRef.current === null) {
      return;
    }
    clearPendingCommit();
    commit();
  }, [clearPendingCommit, commit]);

  const scheduleCommit = useCallback(() => {
    if (isRestoringRef.current) {
      return;
    }
    clearPendingCommit();
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      commit();
    }, COMMIT_DEBOUNCE_MS);
  }, [clearPendingCommit, commit]);

  // Se suscribe una sola vez por instancia de canvas (misma vida útil que
  // `actions`, ver useFabricCanvas.ts: se crea una vez al montar). Semilla
  // el primer estado del historial apenas el canvas está listo, antes de
  // que exista cualquier evento de usuario.
  useEffect(() => {
    if (!actions) {
      return;
    }
    // Variable nueva (no el parámetro `actions` original) para que
    // TypeScript la trate como no-nula dentro de `seedFromCurrentCanvas`
    // (declarada más abajo, en el mismo scope) — mismo patrón ya usado en
    // `useTouchGestures.ts` por la misma razón.
    const editorActions = actions;
    const canvas = editorActions.getCanvas();

    function handleCanvasChange(): void {
      scheduleCommit();
    }

    // Mismos 5 eventos identificados en el análisis previo — se agregan
    // como listeners ADICIONALES, sin tocar los que ya existen en
    // useFabricCanvas.ts para movimiento/contención/líneas/etc.
    canvas.on('object:added', handleCanvasChange);
    canvas.on('object:removed', handleCanvasChange);
    canvas.on('object:modified', handleCanvasChange);
    canvas.on('text:changed', handleCanvasChange);
    canvas.on('circularLineStyle:modified', handleCanvasChange);

    /**
     * Etapa 17, sección A5 — siembra el primer estado del historial. Si
     * hay un diseño guardado en `localStorage`, se restaura PRIMERO y
     * recién DESPUÉS (cuando `restoreDesign` termina) se toma el snapshot
     * semilla — así el diseño restaurado queda como el ÚNICO punto de
     * partida (`past`/`future` vacíos), nunca como un paso que Deshacer
     * pueda revertir a "vacío" (eso pasaría si se sembrara primero con el
     * canvas vacío y recién después se restaurara: el restore dispararía
     * `object:added`, y si esos eventos pudieran generar un commit, "vacío"
     * quedaría en `past` como una entrada artificial). `isRestoringRef` —
     * el mismo guard que ya usan `undo`/`redo` para lo mismo, reutilizado
     * tal cual — evita exactamente eso: mientras está en `true`,
     * `scheduleCommit` (llamado por cada `object:added` del propio
     * restore) no programa nada.
     */
    let cancelled = false;

    function seedFromCurrentCanvas(): void {
      currentRef.current = takeSnapshot(editorActions);
      pastRef.current = [];
      futureRef.current = [];
      syncButtonsState();
    }

    const savedDesign = loadDesignSnapshot();
    if (savedDesign) {
      isRestoringRef.current = true;
      void editorActions
        .restoreDesign(savedDesign)
        .catch(() => {
          // Un diseño guardado que pasó la validación de forma
          // (`designPersistence.ts`) pero que Fabric.js igual no puede
          // reconstruir del todo (ej. una propiedad puntual con un valor
          // que `enlivenObjects` rechaza) no debe bloquear el editor —
          // sección A6 del pedido: sigue con lo que haya quedado en el
          // canvas (posiblemente vacío), nunca con una pantalla rota.
        })
        .finally(() => {
          isRestoringRef.current = false;
          if (!cancelled) {
            seedFromCurrentCanvas();
          }
        });
    } else {
      seedFromCurrentCanvas();
    }

    return () => {
      cancelled = true;
      canvas.off('object:added', handleCanvasChange);
      canvas.off('object:removed', handleCanvasChange);
      canvas.off('object:modified', handleCanvasChange);
      canvas.off('text:changed', handleCanvasChange);
      canvas.off('circularLineStyle:modified', handleCanvasChange);
      clearPendingCommit();
    };
  }, [actions, scheduleCommit, syncButtonsState, clearPendingCommit, takeSnapshot]);

  const undo = useCallback(() => {
    if (!actions) {
      return;
    }
    // Etapa 16 — corrección de un bug real: antes, un commit pendiente (ej.
    // el usuario soltó un gesto justo antes de tocar Deshacer, todavía
    // dentro de la ventana de `COMMIT_DEBOUNCE_MS`) se descartaba sin más
    // (`clearPendingCommit` solo, sin confirmar nada) — pero `currentRef`
    // seguía apuntando al estado ANTERIOR a ese gesto, no al que se ve en
    // pantalla ahora mismo. El resultado: un solo click en "Deshacer" volvía
    // DOS pasos atrás (el gesto recién hecho, nunca confirmado, MÁS el
    // cambio confirmado anterior a él), nunca uno solo. Acá se confirma
    // (`commit()`) el gesto pendiente COMO SI ya hubiera terminado antes de
    // deshacer — así `currentRef` siempre refleja lo último visible en
    // pantalla, y Deshacer retrocede exactamente un paso desde ahí. Cuando
    // no hay ningún commit pendiente, `flushPendingCommit` no hace nada —
    // comportamiento idéntico al de antes para el caso normal (sin gesto en
    // curso), ver el comentario grande de `flushPendingCommit` sobre por qué
    // esto importa.
    flushPendingCommit();

    if (pastRef.current.length === 0 || currentRef.current === null) {
      return;
    }

    const previous = pastRef.current.pop() as string;
    futureRef.current = [currentRef.current, ...futureRef.current];
    currentRef.current = previous;
    syncButtonsState();
    // Etapa 17, sección A8: localStorage siempre representa el estado
    // ACTUAL persistible, nunca todo el historial — cada Deshacer lo
    // actualiza al nuevo `currentRef`, igual que cada `commit`.
    persistCurrent();

    isRestoringRef.current = true;
    void actions
      .restoreDesign(JSON.parse(previous) as Record<string, unknown>)
      .finally(() => {
        isRestoringRef.current = false;
      });
  }, [actions, flushPendingCommit, persistCurrent, syncButtonsState]);

  const redo = useCallback(() => {
    if (!actions) {
      return;
    }
    // Mismo arreglo que en `undo` (ver el comentario grande ahí): confirmar
    // un commit pendiente antes de decidir si hay algo para Rehacer. Si el
    // gesto pendiente era un cambio real, `commit()` ya vacía `futureRef`
    // por su cuenta (cualquier cambio nuevo invalida la rama de Redo vieja,
    // el mismo comportamiento estándar de cualquier editor) — Rehacer
    // entonces correctamente no hace nada más, en vez de "revivir" un estado
    // que ya dejó de tener sentido.
    flushPendingCommit();

    if (futureRef.current.length === 0 || currentRef.current === null) {
      return;
    }

    const [next, ...rest] = futureRef.current;
    futureRef.current = rest;
    pastRef.current.push(currentRef.current);
    if (pastRef.current.length > MAX_HISTORY_STATES) {
      pastRef.current.shift();
    }
    currentRef.current = next;
    syncButtonsState();
    // Ver el comentario equivalente en `undo`.
    persistCurrent();

    isRestoringRef.current = true;
    void actions
      .restoreDesign(JSON.parse(next) as Record<string, unknown>)
      .finally(() => {
        isRestoringRef.current = false;
      });
  }, [actions, flushPendingCommit, persistCurrent, syncButtonsState]);

  return { canUndo, canRedo, undo, redo };
}
