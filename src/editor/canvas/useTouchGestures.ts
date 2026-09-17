import { useEffect, type RefObject } from 'react';
import type { Canvas, FabricObject } from 'fabric';
import type { EditorActions } from './actions';
import { isTextObject, getDesiredFontSize, MIN_FONT_SIZE, getEffectiveMaxFontSize } from './curvedText';
import { isIconObject } from './iconElement';
import { MIN_ICON_SCALE, getMaxValidIconScale } from './containment';
import { VIROLA_CONFIG } from '../../config/virola.config';
import {
  resolveTouchSelectionAction,
  pinchScale,
  clampPinchValue,
  shortestAngleDeltaDeg,
  angleBetweenPointsDeg,
  distanceBetweenPoints,
  TOUCH_GESTURE_EVENT_NAME,
  type TouchGestureEventDetail,
  type PinchTargetKind,
} from './touchGestures';

/**
 * Selección por UN toque + pellizco de dos dedos para íconos (escala +
 * rotación) y texto (Etapa 17: solo escala), EXCLUSIVO de touch. Nada de
 * esto usa `PointerEvent` ni `MouseEvent`: escucha directamente `TouchEvent`
 * nativos, que el mouse jamás dispara — así que un usuario de mouse/desktop
 * nunca pasa por este código, sin necesidad de detectar el tipo de
 * dispositivo.
 *
 * Etapa 14D: reemplaza el doble toque de la Etapa 14C (probado físicamente
 * en iPhone, resultó incómodo en uso real) por selección directa de un solo
 * toque — ver `resolveTouchSelectionAction` (`touchGestures.ts`) para la
 * decisión en sí. El pellizco de dos dedos para ÍCONOS no cambia desde
 * entonces (sección 3 del pedido de la Etapa 14D): sigue siendo la misma
 * matemática, los mismos límites de `containment.ts`, reutilizados tal cual.
 *
 * Etapa 17: el mismo gesto de dos dedos (detección, cálculo de distancia,
 * ratio de escala vía `pinchScale`, protección de desambiguación) se
 * reutiliza tal cual para TEXTO — reemplaza al botón "Tamaño" de un dedo del
 * toolbar en mobile (ver `ContextualToolbar.tsx`, gate por
 * `usePointerIsCoarse`). La ÚNICA diferencia real entre los dos casos es qué
 * propiedad se escala (`icon.scaleX` vía `actions.setSelectedIconScale` vs.
 * `desiredFontSize` vía `actions.setSelectedTextFontSize`, ver
 * `startGesture`/`handleDocumentTouchMove`) y que el texto NUNCA rota con
 * este gesto (esa parte del pedido de la Etapa 17 — sección B1 — es
 * explícita: no tocar rotación/movimiento/curvatura de texto; el texto ya
 * no tiene NINGÚN control de rotación en ningún dispositivo, así que este
 * gesto para texto solo actualiza `desiredFontSize`, nunca un ángulo).
 *
 * PROTECCIÓN CONTRA SELECCIÓN ACCIDENTAL, sin doble toque: durante un gesto
 * de dos dedos, `handleWrapperTouchStart` nunca vuelve a evaluar selección —
 * la rama `touches.length >= 2` es la PRIMERA que se chequea en cada
 * touchstart, así que un tercer dedo que cae accidentalmente sobre otro
 * elemento mientras ya hay un gesto de pellizco/rotación en curso jamás
 * llega a la lógica de selección de un dedo (sección 3 del pedido).
 *
 * POR QUÉ intercepta en la FASE DE CAPTURA de `canvas.wrapperEl` (el div
 * contenedor que Fabric.js crea alrededor de sus dos <canvas>, nunca
 * `canvasEl` directamente — ver `wrapperEl` en SelectableCanvas.d.ts):
 * Fabric.js decide con qué objeto interactuar (seleccionarlo, arrancar un
 * arrastre, o deseleccionar todo al tocar una zona vacía) DENTRO de su
 * propio `_onTouchStart`/`__onMouseDown`, de forma SÍNCRONA y ANTES de
 * disparar cualquier evento propio (`mouse:down`, `selection:created`, etc)
 * — para cuando esos eventos llegan a un `canvas.on(...)` externo, la
 * selección ya cambió. No hay ningún hook público de Fabric.js para vetar
 * ese cambio desde afuera. La única forma de manejar la selección nosotros
 * mismos es que Fabric.js nunca llegue a enterarse de ese toque — y la única
 * manera confiable de lograr eso sin tocar el código fuente de Fabric.js es
 * interceptar el evento nativo ANTES de que llegue al <canvas> (su propio
 * listener de 'touchstart' está puesto directo sobre `upperCanvasEl`). La
 * fase de CAPTURA de un ancestro (el wrapper) siempre se ejecuta antes que
 * cualquier listener puesto sobre el propio elemento hijo (target), sin
 * importar el orden de registro.
 *
 * Una vez que decidimos DEJAR PASAR el toque (cuando cae sobre el objeto ya
 * activo), no se hace nada más acá — Fabric.js procesa ese mismo evento con
 * su lógica de arrastre de siempre, sin cambios: mover un texto/ícono ya
 * seleccionado sigue funcionando exactamente igual que siempre.
 *
 * Etapa 14D, sección 1 (scroll): a diferencia de la Etapa 14C, acá NUNCA se
 * llama `event.preventDefault()` para un toque de UN dedo — solo
 * `stopPropagation()` cuando hace falta bloquear la selección nativa de
 * Fabric.js. `preventDefault()` es lo que le dice al navegador "no
 * interpretes este toque como el inicio de un scroll/swipe de la página";
 * llamarlo en CUALQUIER toque dentro del canvas (como hacía la Etapa 14C,
 * copiando el mismo patrón defensivo que usa el propio `_onTouchStart` de
 * Fabric.js) mataba el gesto de scroll cada vez que un swipe para navegar la
 * página arrancaba con el dedo apoyado sobre el canvas — que ocupa gran
 * parte de la pantalla en mobile — incluso si esa `preventDefault()` nunca
 * corresponde a NINGUNA interacción real con el diseño (tocar una zona vacía
 * de la virola, o otro elemento). `stopPropagation()` alone ya alcanza para
 * bloquear a Fabric.js (ver el porqué arriba); sin la `preventDefault()`
 * extra, el navegador queda libre de tratar ese mismo gesto como scroll
 * normal si el dedo se mueve después. La ÚNICA rama que sigue necesitando
 * `preventDefault()` es la de dos dedos (pellizco/rotación): ahí si hace
 * falta bloquear el pinch-zoom nativo de la página, que sí competiría con el
 * gesto del ícono.
 */
export function useTouchGestures(canvasRef: RefObject<Canvas | null>, actionsOrNull: EditorActions | null): void {
  useEffect(() => {
    // `canvasRef.current` se lee ACÁ ADENTRO (nunca durante el render del
    // componente que llama a este hook) — es una ref, no algo reactivo, así
    // que leerla fuera de un efecto/handler está desaconsejado (regla de
    // React) aunque en la práctica ya esté poblada para cuando `actionsOrNull`
    // se vuelve no-nulo (ambas cosas se fijan en el mismo efecto de
    // `useFabricCanvas.ts`, en ese orden).
    const canvasOrNull = canvasRef.current;
    if (!canvasOrNull || !actionsOrNull) {
      return;
    }
    // Variables nuevas (no los parámetros originales) para que TypeScript
    // pueda seguir tratándolas como no-nulas dentro de las funciones
    // anidadas de más abajo — el estrechamiento de un parámetro por un `if`
    // no se conserva dentro de closures declaradas más adelante en el mismo
    // scope, aunque en este caso nunca cambien de valor.
    const canvas = canvasOrNull;
    const actions = actionsOrNull;
    const wrapper = canvas.wrapperEl;
    if (!wrapper) {
      return;
    }

    /**
     * Etapa 14D, sección 1 (scroll): Fabric.js pone `touch-action: none` en
     * los dos <canvas> reales (`lowerCanvasEl`/`upperCanvasEl` — nunca en el
     * `wrapperEl`, ver `CanvasDOMManager.mjs`) porque `allowTouchScrolling`
     * (opción del `Canvas`) por defecto es `false`. Ese `touch-action:none`
     * es una barrera a nivel CSS, evaluada por el navegador ANTES de que
     * cualquier JS corra — bloquea el scroll nativo para CUALQUIER toque
     * que arranque sobre el propio `<canvas>` sin importar qué haga
     * después nuestro JS (no alcanza con no llamar `preventDefault()`, como
     * se corrigió más abajo — hace falta cambiar este valor).
     *
     * `pan-y` es el reemplazo correcto: sigue bloqueando el pinch-zoom
     * nativo de la página (necesario, para no competir con el pellizco
     * propio del ícono) pero permite que el navegador SÍ interprete un
     * arrastre vertical como scroll de la página cuando nuestro propio
     * código no llama `preventDefault()` para ese toque en particular (ver
     * `handleWrapperTouchStart` — solo deja pasar `preventDefault()` cuando
     * el toque cae sobre el objeto YA seleccionado, vía el propio
     * `_onTouchStart` de Fabric.js, que si la llama). El resultado: tocar el
     * ícono/texto ya seleccionado y arrastrar lo mueve (Fabric.js gana);
     * tocar cualquier otra parte del canvas y arrastrar hace scroll de la
     * página (el navegador gana) — exactamente la distinción pedida.
     *
     * Se fija UNA sola vez acá (no en `useFabricCanvas.ts`, que es genérico
     * y no debe saber de touch): Fabric.js solo aplica su propio
     * `touch-action` una vez, en la construcción del canvas — nunca lo
     * vuelve a tocar en `setDimensions`/`setZoom` (confirmado leyendo
     * `CanvasDOMManager.mjs`), así que este cambio no se pierde en ningún
     * resize/rotación de pantalla posterior.
     */
    canvas.lowerCanvasEl.style.touchAction = 'pan-y';
    canvas.upperCanvasEl.style.touchAction = 'pan-y';

    interface TwoFingerGesture {
      /** `'icon'` (escala + rotación) o `'text'` (Etapa 17: solo escala). */
      kind: PinchTargetKind;
      /**
       * Valor de partida en la unidad de `kind` — `icon.scaleX` (factor de
       * escala) para íconos, `desiredFontSize` (px) para texto. Leído del
       * objeto Fabric real UNA sola vez al empezar el gesto (nunca de un
       * gesto anterior), igual que `DragGesture.baseline` en
       * `ContextualToolbar.tsx`.
       */
      baselineValue: number;
      /**
       * Piso/techo reales para este gesto puntual, en la MISMA unidad que
       * `baselineValue` — para íconos, `MIN_ICON_SCALE`/`getMaxValidIconScale`
       * (Etapa 14C: sin este techo, un pellizco que pide una escala mucho
       * mayor a la que la posición ACTUAL del ícono admite hacía que
       * `applyIconScale`, actions.ts, reacomodara la posición hacia el
       * centro de la virola — zona inválida para íconos — y el escalado
       * final terminara recortado muy por debajo de lo esperado); para
       * texto, `MIN_FONT_SIZE`/`getEffectiveMaxFontSize` (el mismo techo
       * geométrico real que ya usa el gesto de arrastre de un dedo en
       * `ContextualToolbar.tsx`). Calculados UNA sola vez al empezar el
       * gesto — nunca recalculados frame a frame — y aplicados vía
       * `clampPinchValue` (touchGestures.ts) en cada `touchmove`.
       */
      minValue: number;
      maxValue: number;
      startDistance: number;
      /** Solo se usa (y actualiza) para `kind === 'icon'` — el texto nunca rota con este gesto. */
      lastAngleDeg: number;
      touchIds: [number, number];
    }

    let gesture: TwoFingerGesture | null = null;

    /**
     * Cuánto esperar, ante un toque de UN dedo que cambiaría la selección
     * mientras YA hay un ÍCONO seleccionado, antes de confirmar ese cambio —
     * tiempo suficiente para que, si es en realidad el PRIMER dedo de un
     * pellizco de dos dedos sobre ese mismo ícono, llegue el segundo dedo y
     * cancele el cambio. Bug real encontrado probando esto: un pellizco casi
     * nunca pone el primer dedo exactamente sobre el trazo fino del ícono
     * (los íconos son de solo trazo, sin relleno — ver iconLibrary.ts) —
     * "cerca pero no exacto" es lo normal — así que sin este margen, el
     * simple hecho de apoyar el primer dedo cerca (no exactamente encima)
     * del ícono ya seleccionado lo deseleccionaba de entrada, antes de que
     * el segundo dedo llegara a empezar el pellizco.
     *
     * Nunca se aplica si NO hay nada seleccionado (ver `isIconObject`/
     * `isTextObject` más abajo) — en ese caso, "seleccionar"/"deseleccionar"
     * sigue siendo instantáneo, sin ninguna demora, como pide la sección 2.
     * Etapa 17: antes esta demora solo aplicaba con un ÍCONO ya seleccionado
     * (el pellizco de texto no existía); ahora aplica igual con un TEXTO ya
     * seleccionado, por la misma razón exacta (un texto curvo son letras
     * finas con mucho espacio vacío alrededor — el primer dedo de un
     * pellizco rara vez cae exactamente sobre un glyph).
     */
    const PINCH_DISAMBIGUATION_DELAY_MS = 80;
    let pendingSelectionTimer: ReturnType<typeof setTimeout> | null = null;

    function cancelPendingSelection(): void {
      if (pendingSelectionTimer !== null) {
        clearTimeout(pendingSelectionTimer);
        pendingSelectionTimer = null;
      }
    }

    function commitSelectionChange(action: 'select' | 'deselect', target: FabricObject | undefined): void {
      if (action === 'deselect') {
        canvas.discardActiveObject();
      } else if (target) {
        canvas.setActiveObject(target);
      }
      canvas.requestRenderAll();
    }

    function fireGestureEvent(active: boolean): void {
      window.dispatchEvent(new CustomEvent<TouchGestureEventDetail>(TOUCH_GESTURE_EVENT_NAME, { detail: { active } }));
    }

    function findTouchesByIds(touchList: TouchList, ids: readonly [number, number]): [Touch | null, Touch | null] {
      let a: Touch | null = null;
      let b: Touch | null = null;
      for (let i = 0; i < touchList.length; i++) {
        const t = touchList[i];
        if (t.identifier === ids[0]) a = t;
        if (t.identifier === ids[1]) b = t;
      }
      return [a, b];
    }

    function stopGesture(): void {
      gesture = null;
      document.removeEventListener('touchmove', handleDocumentTouchMove);
      document.removeEventListener('touchend', handleDocumentTouchEnd);
      document.removeEventListener('touchcancel', handleDocumentTouchEnd);
      fireGestureEvent(false);
    }

    /**
     * Continuación del gesto de dos dedos — escucha en `document` (no en el
     * canvas) por la misma razón por la que Fabric.js mismo lo hace durante
     * un arrastre normal: los dedos pueden moverse fuera de los límites del
     * `<canvas>` en medio del gesto sin que eso deba cortarlo.
     */
    function handleDocumentTouchMove(event: TouchEvent): void {
      if (!gesture || !actions) {
        return;
      }
      const [a, b] = findTouchesByIds(event.touches, gesture.touchIds);
      if (!a || !b) {
        return;
      }
      event.preventDefault();

      const currentDistance = distanceBetweenPoints(a.clientX, a.clientY, b.clientX, b.clientY);
      const rawTargetValue = pinchScale(gesture.baselineValue, gesture.startDistance, currentDistance);
      const targetValue = clampPinchValue(rawTargetValue, gesture.minValue, gesture.maxValue);

      if (gesture.kind === 'icon') {
        actions.setSelectedIconScale(targetValue);
        const currentAngle = angleBetweenPointsDeg(a.clientX, a.clientY, b.clientX, b.clientY);
        const deltaDeg = shortestAngleDeltaDeg(gesture.lastAngleDeg, currentAngle);
        gesture.lastAngleDeg = currentAngle;
        actions.rotateSelectedIcon(deltaDeg);
      } else {
        // Etapa 17, sección B1: el texto nunca rota con este gesto — el
        // pellizco de dos dedos sobre un texto solo actualiza
        // `desiredFontSize` (mismo campo que ya actualiza el gesto de
        // arrastre de un dedo en desktop, `handleSizePointerDown` de
        // `ContextualToolbar.tsx`), dejando que el auto-fit existente
        // (`fitFontSizeToArc`, curvedText.ts) decida el tamaño EFECTIVO
        // real, exactamente igual que ya hace el resto del editor.
        actions.setSelectedTextFontSize(targetValue);
      }
    }

    function handleDocumentTouchEnd(event: TouchEvent): void {
      if (!gesture) {
        return;
      }
      if (event.touches.length < 2) {
        stopGesture();
      }
    }

    function startGesture(target: FabricObject, touchA: Touch, touchB: Touch): void {
      // Si Fabric.js ya había arrancado una transformación con el primer
      // dedo (p. ej. cayó sobre el elemento ya seleccionado y arrancó un
      // arrastre normal antes de que llegara el segundo dedo), hay que
      // cerrarla en limpio antes de que el gesto de dos dedos tome el
      // control — mismo patrón que usa Fabric.js internamente para
      // interrumpir una transformación en curso.
      if (canvas._currentTransform) {
        canvas.endCurrentTransform();
      }
      const startDistance = distanceBetweenPoints(touchA.clientX, touchA.clientY, touchB.clientX, touchB.clientY) || 1;
      // Etapa 17: `target` puede ser un ícono o un texto — el tipo de
      // gesto y qué campo escala cada uno se resuelven acá, UNA sola vez al
      // empezar (nunca frame a frame), reutilizando exactamente los mismos
      // helpers que ya usa el resto del editor para cada tipo (ver el
      // comentario grande de `TwoFingerGesture` sobre por qué min/max se
      // calculan acá y no en cada `touchmove`). El `if (isTextObject(...))`
      // (en vez de una ternera sobre un booleano ya calculado) es a
      // propósito: es la única forma de que TypeScript reduzca `target` al
      // tipo real de texto DENTRO de esta rama para poder llamar
      // `getDesiredFontSize` sin un cast inseguro.
      let kind: PinchTargetKind;
      let baselineValue: number;
      let minValue: number;
      let maxValue: number;
      if (isTextObject(target)) {
        kind = 'text';
        baselineValue = getDesiredFontSize(target);
        minValue = MIN_FONT_SIZE;
        maxValue = getEffectiveMaxFontSize(VIROLA_CONFIG);
      } else {
        kind = 'icon';
        baselineValue = target.scaleX ?? 1;
        minValue = MIN_ICON_SCALE;
        maxValue = getMaxValidIconScale(target, VIROLA_CONFIG);
      }
      gesture = {
        kind,
        baselineValue,
        minValue,
        maxValue,
        startDistance,
        lastAngleDeg: angleBetweenPointsDeg(touchA.clientX, touchA.clientY, touchB.clientX, touchB.clientY),
        touchIds: [touchA.identifier, touchB.identifier],
      };
      document.addEventListener('touchmove', handleDocumentTouchMove, { passive: false });
      document.addEventListener('touchend', handleDocumentTouchEnd);
      document.addEventListener('touchcancel', handleDocumentTouchEnd);
      // Etapa 14D, sección 5: el `ContextualToolbar` escucha esto para
      // congelar su posición mientras dura el gesto (nunca reposicionarse a
      // mitad de un pellizco/rotación) y solo recalcularla al terminar.
      fireGestureEvent(true);
    }

    function handleWrapperTouchStart(event: TouchEvent): void {
      const touches = event.touches;

      if (touches.length >= 2) {
        // El segundo dedo llegó a tiempo: cualquier cambio de selección que
        // el primer dedo hubiera dejado pendiente (ver más abajo) se
        // cancela — este toque pasa a ser el pellizco del ícono/texto YA
        // seleccionado, no una nueva selección.
        cancelPendingSelection();
        const active = canvas.getActiveObject();
        if ((isIconObject(active) || isTextObject(active)) && !gesture) {
          event.preventDefault();
          event.stopPropagation();
          startGesture(active, touches[0], touches[1]);
        } else if (gesture) {
          event.preventDefault();
          event.stopPropagation();
        }
        // Sin ícono/texto activo: no hay nada que pellizcar — se deja pasar
        // sin tocar nada (Fabric.js de por sí solo mira el primer dedo).
        return;
      }

      if (gesture) {
        // Gesto de dos dedos en curso y se levantó uno — `handleDocumentTouchEnd`
        // ya lo cierra; nada más que hacer con este dedo restante.
        return;
      }

      // Etapa 14D, sección 2: selección directa de UN toque, decidida en el
      // propio touchstart (no hace falta esperar al touchend ni comparar
      // contra un toque anterior — ver `resolveTouchSelectionAction`).
      const target = canvas.findTarget(event);
      const selectableTarget = isTextObject(target) || isIconObject(target) ? target : undefined;
      const activeObject = canvas.getActiveObject();
      const action = resolveTouchSelectionAction(selectableTarget, activeObject);

      if (action === 'none') {
        // El toque cae sobre el objeto YA activo (o sobre una zona vacía sin
        // nada seleccionado) — se deja pasar tal cual, para que Fabric.js
        // arranque (o continúe) el arrastre normal, o simplemente no haga
        // nada (ver el comentario grande al principio del archivo).
        return;
      }

      // 'select' o 'deselect': Fabric.js NUNCA se entera de este toque — solo
      // bloqueamos su propia lógica de selección (`stopPropagation`), sin
      // `preventDefault()` (ver el comentario grande de arriba sobre scroll).
      event.stopPropagation();

      if (isIconObject(activeObject) || isTextObject(activeObject)) {
        // Podría ser el primer dedo de un pellizco sobre el ícono/texto ya
        // seleccionado — esperar el margen de desambiguación (ver el
        // comentario grande de `PINCH_DISAMBIGUATION_DELAY_MS`) antes de
        // confirmar. Si llega un segundo dedo antes, `cancelPendingSelection`
        // (rama de arriba) lo cancela y la selección nunca cambia.
        cancelPendingSelection();
        pendingSelectionTimer = setTimeout(() => {
          pendingSelectionTimer = null;
          commitSelectionChange(action, selectableTarget);
        }, PINCH_DISAMBIGUATION_DELAY_MS);
      } else {
        // Nada seleccionado — cambio instantáneo, sin demora.
        commitSelectionChange(action, selectableTarget);
      }
    }

    const captureOptions: AddEventListenerOptions = { capture: true, passive: false };
    wrapper.addEventListener('touchstart', handleWrapperTouchStart, captureOptions);

    return () => {
      wrapper.removeEventListener('touchstart', handleWrapperTouchStart, captureOptions);
      cancelPendingSelection();
      stopGesture();
    };
    // `canvasRef` en sí (el objeto ref) nunca cambia de identidad entre
    // renders, así que como dependencia es inerte — lo que realmente
    // dispara este efecto de nuevo es `actionsOrNull` pasando de `null` al
    // valor real (ver el comentario grande de arriba sobre el orden con el
    // que `useFabricCanvas.ts` fija ambos).
  }, [canvasRef, actionsOrNull]);
}
