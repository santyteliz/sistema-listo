import { useEffect, useRef, useState, type RefObject } from 'react';
import { Canvas, config as fabricConfig, type FabricObject, type IText, type Point } from 'fabric';
import { VIROLA_CONFIG } from '../../config/virola.config';
import { renderGuides } from './guides';
import { applyTextCurve, getCurveRadius, getCurveState, isTextObject, setTextCurveRadius, setTextVisibilityClip, toTextSelection } from './curvedText';
import { clampTextAgainstOtherTexts } from './textCollision';
import { isIconObject, setIconVisibilityClip, toIconSelection } from './iconElement';
import { clampIconPosition, clampIconScale, clampIconRotation } from './containment';
import { normalizeAngleDeg } from './ringAngle';
import { getDesignElementCounts, type DesignElementCounts } from './designLimits';
import { getCircularLineStyle, isCircularLineObject, renderCircularLines, type CircularLineStyle } from './circularLines';
import { createEditorActions, type EditorActions } from './actions';
import { useTouchGestures } from './useTouchGestures';
import { preloadEditorFonts } from '../fonts/fontLibrary';
import type { EditorSelection } from '../state/selection';

declare global {
  interface Window {
    /**
     * Puente de depuración, solo en desarrollo (`import.meta.env.DEV`), para
     * poder probar `serializeDesign`/`restoreDesign` desde fuera de React
     * (ej. verificación manual o automatizada en el navegador). No existe en
     * el build de producción.
     */
    __editorActions?: EditorActions;
  }
}

/**
 * Nitidez del render: por qué hacía falta esto y por qué esta es la forma
 * correcta de arreglarlo (investigado antes de tocar nada).
 *
 * Fabric.js 6.0.2 YA escala el backing buffer del `<canvas>` según
 * `devicePixelRatio` por defecto (`enableRetinaScaling: true` es el default
 * de `StaticCanvas`, confirmado en `StaticCanvasOptions.mjs`) — en una
 * pantalla Retina/HiDPI (`devicePixelRatio` del navegador = 2, verificado
 * con Playwright: `canvas.getRetinaScaling()` da 2, el `<canvas>` real
 * queda en 1280×1280px de buffer para 640×640 CSS-px) esto YA funciona
 * bien, no hacía falta arreglar nada ahí.
 *
 * El problema es en una pantalla ESTÁNDAR (`devicePixelRatio = 1`, la
 * mayoría de los monitores externos y notebooks no-Retina): ahí
 * `getRetinaScaling()` da 1, así que el buffer real quedaba en 640×640px
 * — exactamente 1 píxel de buffer por 1 píxel visible en pantalla, sin
 * ningún "sobremuestreo". El texto curvo, los trazos finos de los íconos y
 * sobre todo las líneas circulares (2px de grosor) dependen enteramente del
 * antialiasing nativo del canvas 2D para verse suaves — con exactamente 1
 * píxel de buffer por píxel de pantalla, ese antialiasing tiene mucho menos
 * información para trabajar que en una pantalla Retina, y se nota
 * (bordes/curvas con un aspecto más "escalonado").
 *
 * La solución NO es agrandar los objetos (eso cambiaría medidas/escalas
 * lógicas, prohibido acá) ni tocar el tamaño del `<canvas>` a mano: Fabric
 * ya expone el mecanismo correcto — `getDevicePixelRatio()` (en
 * `env/index.mjs`) usa `config.devicePixelRatio` si está definido, y ese
 * valor arranca igual a `window.devicePixelRatio` pero es un número
 * público y escribible (`config.d.ts`: `devicePixelRatio: number`) pensado
 * exactamente para este caso ("adjust for more realistic conversion", ver
 * el comentario fuente de Fabric). Fijarlo acá a un mínimo de 2 fuerza que
 * el backing buffer SIEMPRE tenga como mínimo el doble de resolución que el
 * tamaño visible en pantalla — un "sobremuestreo" (supersampling) parejo
 * para cualquier trazo, curva o texto — incluso en una pantalla de
 * `devicePixelRatio = 1`. En una pantalla que YA es Retina (`devicePixelRatio`
 * ≥ 2) esto no cambia nada (`Math.max` se queda con el valor real, más alto).
 *
 * Se asigna UNA sola vez, a nivel de módulo (no en el efecto): es
 * configuración global de la librería Fabric, no algo ligado al ciclo de
 * vida de una instancia de canvas en particular — todo `getRetinaScaling()`
 * posterior (incluida `applyResponsiveScale`, más abajo, que llama
 * `canvas.setDimensions(...)` de nuevo en cada resize del contenedor) lee
 * este mismo valor ya corregido, así que no hace falta repetir nada ahí.
 *
 * No afecta: coordenadas lógicas de los objetos (`left`/`top`/`scaleX`/
 * `angle`, en el mismo espacio de 640×640 de siempre), `serializeDesign()`/
 * `restoreDesign()` (serializan esas mismas coordenadas lógicas, nunca el
 * buffer), ni el hit-testing de clicks (Fabric ya traduce coordenadas de
 * pantalla a lógicas usando el mismo mecanismo que ya usa correctamente en
 * pantallas Retina reales). Tampoco afecta ningún export a imagen (no existe
 * esa función todavía en el editor — y de existir, `toDataURL` de Fabric
 * tiene su propio flag `enableRetinaScaling` en las opciones de esa llamada
 * puntual, independiente de esto).
 */
const SUPERSAMPLE_MIN_DEVICE_PIXEL_RATIO = 2;
if (typeof window !== 'undefined') {
  fabricConfig.devicePixelRatio = Math.max(window.devicePixelRatio || 1, SUPERSAMPLE_MIN_DEVICE_PIXEL_RATIO);
}

export interface UseFabricCanvasOptions {
  /**
   * Se llama cuando el usuario hace doble click sobre un texto o un ícono
   * en el canvas — dispara el menú contextual flotante (ver
   * `ContextualToolbar.tsx`). Reemplaza al anterior `onIconDoubleClick`
   * (que abría directamente el selector para reemplazar el ícono): esa
   * acción sigue existiendo, pero ahora se llega a ella desde el botón
   * "Cambiar ícono" del panel lateral, no desde el doble click.
   */
  onElementDoubleClick?: () => void;
}

/**
 * Crea y administra la instancia de Fabric.Canvas fuera del ciclo de
 * renderizado de React: se crea una sola vez al montar (useEffect +
 * useRef), y se destruye al desmontar. React nunca guarda el canvas ni sus
 * objetos en useState — Fabric es la fuente de verdad del estado gráfico.
 * Lo único que se sincroniza a estado de React es lo mínimo que la UI
 * necesita: la capa de acciones (una vez que existe), la selección actual,
 * y si el menú contextual flotante está abierto (ver docs/ARCHITECTURE.md).
 */
export function useFabricCanvas(
  canvasElRef: RefObject<HTMLCanvasElement | null>,
  options: UseFabricCanvasOptions = {},
) {
  const canvasRef = useRef<Canvas | null>(null);
  const [actions, setActions] = useState<EditorActions | null>(null);
  const [selection, setSelection] = useState<EditorSelection>({ type: 'none' });
  const [elementCounts, setElementCounts] = useState<DesignElementCounts>({ total: 0, text: 0, icon: 0 });
  const [circularLineStyle, setCircularLineStyleState] = useState<CircularLineStyle>('none');
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const onElementDoubleClickRef = useRef(options.onElementDoubleClick);
  onElementDoubleClickRef.current = options.onElementDoubleClick;

  // Etapa 14C — selección por doble toque + pellizco/rotación de dos dedos,
  // exclusivo de touch (ver useTouchGestures.ts para el porqué de cada
  // decisión). Se conecta acá, no dentro del efecto de más abajo, porque
  // necesita reaccionar tanto a la instancia del canvas como a `actions`
  // (que se crea recién dentro de ese mismo efecto, más tarde) — su propio
  // useEffect interno ya se encarga de no hacer nada mientras cualquiera de
  // los dos sea `null`.
  useTouchGestures(canvasRef, actions);

  useEffect(() => {
    const canvasEl = canvasElRef.current;
    if (!canvasEl) {
      return;
    }

    const canvas = new Canvas(canvasEl, {
      width: VIROLA_CONFIG.width,
      height: VIROLA_CONFIG.height,
      backgroundColor: '#ffffff',
      // `selection: false` desactiva la selección múltiple de Fabric.js por
      // completo — nuestro producto no tiene ningún caso de uso para mover
      // texto e ícono juntos, y una `ActiveSelection` (el objeto-grupo
      // sintético que arma Fabric.js) no pasa por `isTextObject`/
      // `isIconObject` en ningún handler de acá abajo, así que ni la
      // contención de íconos (`containment.ts`) ni el movimiento propio del
      // texto se aplican a ese grupo — se puede sacar completo de la virola.
      // `canvas.selection` es un único flag que gatilla DOS mecanismos
      // nativos de Fabric.js, ambos indeseados acá:
      //  1) arrastrar desde un punto vacío del canvas dibuja un rectángulo
      //     de selección (`_groupSelector`) que agrupa en una
      //     `ActiveSelection` todo objeto que toque, ver
      //     `SelectableCanvas.mjs` (dibujo) y `Canvas.mjs` `__onMouseDown`
      //     (arranca el rectángulo solo si `this.selection` es true);
      //  2) clickear un segundo objeto con Shift presionado (`selectionKey`,
      //     Shift por defecto) lo suma a la selección activa vía
      //     `handleMultiSelection`, que también exige `this.selection` true.
      // Poniendo el flag en `false` se cierran los dos caminos a la vez, sin
      // afectar la selección individual por click (que en el código fuente
      // de Fabric.js es un camino aparte, no condicionado por `selection`).
      selection: false,
      // NO usar perPixelTargetFind ACÁ (a nivel canvas): probado y
      // descartado. Con íconos de solo trazo (sin relleno, a propósito —
      // ver iconLibrary.ts) el interior transparente no cuenta como "click
      // válido" bajo detección por píxel, así que solo el contorno finito
      // quedaría clickeable — el problema real (un ícono en su posición
      // inicial coincidiendo con el cuadro delimitador del texto curvo) se
      // resolvió separando los radios de texto e íconos en
      // VirolaConfig/iconElement.ts en su lugar. El texto curvo sí lo activa
      // (`perPixelTargetFind: true` en su propio objeto, ver
      // `createCurvedText`) — es una propiedad por objeto, así que no afecta
      // a los íconos.
      //
      // `targetFindTolerance` sí es del canvas (no existe por objeto) y le
      // suma unos píxeles de margen alrededor del punto de click antes de
      // decidir "esto es transparente" — sin esto, con perPixelTargetFind
      // activo, haría falta acertarle al pixel exacto del trazo de la letra
      // para seleccionar el texto.
      targetFindTolerance: 4,
    });
    canvasRef.current = canvas;

    renderGuides(canvas, VIROLA_CONFIG);

    function selectionToState(active: FabricObject | undefined): EditorSelection {
      if (isTextObject(active)) {
        return toTextSelection(active);
      }
      if (isIconObject(active)) {
        return toIconSelection(active);
      }
      return { type: 'none' };
    }

    // Objeto activo (si hay uno, ícono o texto) → se ve completo; el resto →
    // recortado al anillo real Ø72–Ø94 de la virola (ver
    // `setIconVisibilityClip`/`setTextVisibilityClip`, puramente visual, no
    // toca coordenadas ni exportación). Se recalcula para TODOS los
    // elementos en cada cambio de selección — nunca hace falta actualizar
    // esto durante un arrastre/escalado/rotación en curso: el que cambia de
    // tamaño/posición es siempre el elemento ACTIVO (sin recorte mientras
    // dura), y el recorte de los demás no depende de su propia geometría.
    function refreshVisibilityClips(): void {
      const active = canvas.getActiveObject();
      canvas.getObjects().forEach((object) => {
        if (isIconObject(object)) {
          setIconVisibilityClip(object, object === active, VIROLA_CONFIG);
        } else if (isTextObject(object)) {
          setTextVisibilityClip(object, object === active, VIROLA_CONFIG);
        }
      });
      canvas.requestRenderAll();
    }

    // Vuelve a calcular (desde cero, nunca acumulando) las líneas circulares
    // decorativas a partir del estilo elegido + la posición/tamaño/rotación
    // ACTUALES de cada elemento — ver circularLines.ts. Se llama cada vez
    // que la geometría de algún elemento pudo haber cambiado (arrastre,
    // gesto de tamaño/rotación del ContextualToolbar, agregar/quitar un
    // elemento), nunca solo al cambiar de selección (eso no mueve nada).
    function refreshCircularLinesGeometry(): void {
      renderCircularLines(canvas, VIROLA_CONFIG, getCircularLineStyle(canvas));
    }

    function handleCircularLineStyleModified({ style }: { style: CircularLineStyle }): void {
      setCircularLineStyleState(style);
    }

    function syncSelectionFromCanvas(): void {
      const state = selectionToState(canvas.getActiveObject());
      setSelection(state);
      // El overlay propio (`ContextualToolbar`) se muestra apenas Fabric.js
      // selecciona un texto o un ícono — ya no hace falta doble click para
      // verlo. `handleDoubleClick` (más abajo) vuelve a pedir que se
      // muestre para el mismo elemento ya seleccionado: como es el mismo
      // booleano (no una pila), no genera un segundo menú ni un estado
      // inconsistente.
      setIsContextMenuOpen(state.type !== 'none');
      refreshVisibilityClips();
    }

    function handleTextChanged({ target }: { target: IText }): void {
      applyTextCurve(target, VIROLA_CONFIG, getCurveState(target));
      canvas.requestRenderAll();
      setSelection(toTextSelection(target));
      refreshCircularLinesGeometry();
    }

    function handleObjectModified({ target }: { target: FabricObject }): void {
      if (isIconObject(target)) {
        setSelection(toIconSelection(target));
      }
      refreshCircularLinesGeometry();
    }

    function handleDoubleClick({ target }: { target?: FabricObject }): void {
      if (isTextObject(target) || isIconObject(target)) {
        setIsContextMenuOpen(true);
        onElementDoubleClickRef.current?.();
      }
    }

    // Reabre el menú contextual al clickear un texto/ícono que YA es el
    // objeto activo (p. ej. se había cerrado el menú con un click afuera,
    // sin deseleccionar — ver `ContextualToolbar.tsx` — y se vuelve a
    // clickear el mismo elemento): en ese caso Fabric.js no dispara
    // `selection:created` ni `selection:updated` (desde su punto de vista
    // la selección no cambió), así que `syncSelectionFromCanvas` nunca se
    // ejecuta de nuevo. Este handler cubre exactamente ese caso — es
    // idempotente con `syncSelectionFromCanvas` en cualquier otro (nueva
    // selección, o clickear un objeto ya activo con el menú ya abierto).
    function handleMouseDown({ target }: { target?: FabricObject }): void {
      if (isTextObject(target) || isIconObject(target)) {
        setIsContextMenuOpen(true);
      }
    }

    // Contención geométrica de íconos (Etapa 5 P0, ahora también con
    // rotación — Etapa 5 objetivo 4): se corrige en el mismo frame en que
    // Fabric.js ya aplicó el movimiento/escalado/rotación propuesto por el
    // usuario, así la restricción se ve — y funciona — en tiempo real
    // mientras se arrastra, se escala o se rota, no solo al soltar.
    //
    // `pointer` viene directo del payload de Fabric.js (`BasicTransformEvent`
    // ya lo incluye en coordenadas de escena) — es la posición real del
    // mouse/dedo en este evento, y es lo que necesita `handleTextMoving`
    // para el arrastre incremental (ver ahí el porqué).
    function handleObjectMoving({ target, pointer }: { target: FabricObject; pointer: Point }): void {
      if (isIconObject(target)) {
        clampIconPosition(target, VIROLA_CONFIG);
        // Mismo patrón que `handleTextMoving` (ver abajo) para el texto:
        // recalcula la selección en cada frame del arrastre, no solo al
        // soltar, para que el `ContextualToolbar` (que se posiciona a
        // partir de `selection.left/top`) siga al ícono en vivo.
        setSelection(toIconSelection(target));
      } else {
        handleTextMoving(target, pointer);
      }
      // La posición del elemento activo cambió — las líneas circulares (si
      // las hay) tienen que recalcular sus huecos en cada frame del
      // arrastre, no solo al soltar.
      refreshCircularLinesGeometry();
    }

    function handleObjectScaling({ target }: { target: FabricObject }): void {
      if (isIconObject(target)) {
        clampIconScale(target, VIROLA_CONFIG);
      }
      refreshCircularLinesGeometry();
    }

    function handleObjectRotating({ target }: { target: FabricObject }): void {
      if (isIconObject(target)) {
        clampIconRotation(target, VIROLA_CONFIG);
      }
      refreshCircularLinesGeometry();
    }

    // Posición real del mouse en el evento `object:moving` anterior, en
    // coordenadas de escena — `null` cuando no hay un arrastre de texto en
    // curso (se limpia en `mouse:up`). Ver `handleTextMoving`.
    let lastTextDragPointer: { x: number; y: number } | null = null;

    /**
     * Mover el texto (Etapa 5, objetivo 1) — arrastre incremental basado en
     * el delta del mouse, no en su ángulo absoluto respecto del centro.
     *
     * La versión anterior calculaba el ángulo directamente desde
     * `target.left/top` (la posición "virtual" que Fabric.js le da al
     * objeto durante el arrastre, aunque después se la pise siempre de
     * vuelta al centro): Fabric arrastra sumando el delta TOTAL del mouse
     * desde el mousedown a la posición ORIGINAL (el centro, siempre, porque
     * la pisamos ahí al final de cada frame) — así que esa posición virtual
     * se aleja cada vez más del centro cuanto más dura el gesto, sin límite.
     * Como el ángulo (`atan2`) es mucho más sensible a un mismo delta de
     * mouse cuando el radio es chico que cuando es grande, el resultado era
     * una sensibilidad que cambiaba todo el tiempo dentro del mismo
     * arrastre: muy brusca al principio del gesto, cada vez más lenta
     * después — exactamente la sensación de "perseguir" el texto.
     *
     * La corrección: en cada evento se mide el DESPLAZAMIENTO real del
     * puntero desde el evento anterior (no desde el mousedown), se proyecta
     * ese vector sobre la TANGENTE a la circunferencia en el ángulo actual
     * (la dirección en la que "correr" el texto sin moverlo radialmente), y
     * esa distancia tangencial se convierte en grados usando el radio fijo
     * de la virola (arco = radio × ángulo). El resultado es una ganancia
     * constante (grados por píxel de mouse) que no depende de cuánto ya se
     * arrastró en este gesto ni de en qué parte del círculo está el texto —
     * el mismo movimiento de mouse siempre produce el mismo giro.
     *
     * El objeto nunca se desplaza de verdad — su pivote sigue siendo
     * siempre el centro de la virola (ver `createCurvedText`) — lo único
     * que cambia es el ÁNGULO (`curveOffset`) y, desde esta etapa, también
     * el RADIO (`curveRadius`): la componente del delta del mouse que antes
     * se descartaba (la radial, hacia adentro/afuera) ahora se usa para dar
     * al texto la misma libertad de movimiento radial que ya tienen los
     * íconos, acotada a `getTextRadialRange` (ver curvedText.ts) — un texto
     * grande tiene poco margen para alejarse del centro; uno chico, mucho
     * más. `setTextCurveRadius` es la única función que reconstruye el path
     * del arco por esto (no se llama a todo `applyTextCurve`, que además
     * re-ajustaría el tamaño de fuente — acá el tamaño no cambia, solo la
     * posición).
     */
    function handleTextMoving(target: FabricObject, pointer: { x: number; y: number }): void {
      if (!isTextObject(target)) {
        return;
      }
      const centerX = VIROLA_CONFIG.width / 2;
      const centerY = VIROLA_CONFIG.height / 2;
      const currentAngleDeg = target.angle ?? 0;

      if (lastTextDragPointer) {
        const deltaX = pointer.x - lastTextDragPointer.x;
        const deltaY = pointer.y - lastTextDragPointer.y;

        // Vectores tangente y radial unitarios en el ángulo actual (misma
        // convención que angleToPoint/pointToAngleDeg en ringAngle.ts: 0° =
        // arriba, sentido horario; el radial es la derivada del tangente,
        // apunta hacia AFUERA del centro). Proyectar el delta del mouse
        // sobre cada uno separa el movimiento en sus dos componentes: a lo
        // LARGO del arco (cambia el ángulo) y hacia ADENTRO/AFUERA (cambia
        // el radio) — perpendiculares entre sí, así que no se interfieren.
        const angleRad = (currentAngleDeg * Math.PI) / 180;
        const tangentX = Math.cos(angleRad);
        const tangentY = Math.sin(angleRad);
        const radialX = Math.sin(angleRad);
        const radialY = -Math.cos(angleRad);
        const tangentialDelta = deltaX * tangentX + deltaY * tangentY;
        const radialDelta = deltaX * radialX + deltaY * radialY;

        const radius = getCurveRadius(target, VIROLA_CONFIG);
        const deltaAngleDeg = (tangentialDelta / radius) * (180 / Math.PI);
        const proposedAngleDeg = normalizeAngleDeg(currentAngleDeg + deltaAngleDeg);
        const proposedRadius = radius + radialDelta;

        // Con varios textos permitidos a la vez (ver designLimits.ts), el
        // arrastre no puede llevar a este texto a invadir el espacio real de
        // otro — `clampTextAgainstOtherTexts` (textCollision.ts) deja pasar
        // el movimiento propuesto sin tocarlo mientras no colisiona, y si
        // colisiona retrocede por el mismo camino recién recorrido hasta el
        // punto válido más cercano (nunca bloquea el gesto en seco). Con un
        // solo texto en el canvas es un no-op inmediato: el comportamiento
        // de esta etapa queda igual al de antes de esta función existir.
        const { angleDeg: newAngleDeg, radius: clampedRadius } = clampTextAgainstOtherTexts(
          canvas,
          target,
          currentAngleDeg,
          radius,
          proposedAngleDeg,
          proposedRadius,
          VIROLA_CONFIG,
        );

        target.set({
          left: centerX,
          top: centerY,
          angle: newAngleDeg,
          curveOffset: newAngleDeg,
        });
        setTextCurveRadius(target, clampedRadius, VIROLA_CONFIG);
        target.setCoords();
        setSelection(toTextSelection(target));
      } else {
        // Primer evento de este gesto: todavía no hay un puntero anterior
        // con el que calcular un delta, así que este frame solo reafirma
        // la posición (por si Fabric.js ya la movió) sin girar nada.
        target.set({ left: centerX, top: centerY });
        target.setCoords();
      }

      lastTextDragPointer = { x: pointer.x, y: pointer.y };
    }

    // Se recalcula desde cero (no se suma/resta a mano) cada vez que se
    // agrega o saca un objeto del canvas — así no importa si el cambio
    // viene de agregar texto/ícono, eliminar, reemplazar un ícono (que
    // saca uno y agrega otro) o restaurar un diseño completo: siempre
    // termina reflejando la cantidad real de elementos (total y por tipo),
    // sin poder desincronizarse.
    function syncElementCounts({ target }: { target?: FabricObject } = {}): void {
      setElementCounts(getDesignElementCounts(canvas));
      // Agregar/quitar un elemento cambia qué zonas de exclusión existen —
      // ver circularLines.ts. OJO: `renderCircularLines` agrega/quita las
      // líneas mismas con `canvas.add()`/`canvas.remove()`, lo que dispara
      // este mismo evento — sin este chequeo, cada redibujado volvería a
      // disparar otro redibujado de sí mismo, sin fin (`RangeError: Maximum
      // call stack size exceeded`, encontrado al probar esto).
      if (target && isCircularLineObject(target)) {
        return;
      }
      refreshCircularLinesGeometry();
    }

    canvas.on('selection:created', syncSelectionFromCanvas);
    canvas.on('selection:updated', syncSelectionFromCanvas);
    canvas.on('selection:cleared', () => {
      setSelection({ type: 'none' });
      setIsContextMenuOpen(false);
      refreshVisibilityClips();
    });
    canvas.on('text:changed', handleTextChanged);
    canvas.on('object:modified', handleObjectModified);
    canvas.on('mouse:dblclick', handleDoubleClick);
    canvas.on('mouse:down', handleMouseDown);
    canvas.on('object:moving', handleObjectMoving);
    canvas.on('object:scaling', handleObjectScaling);
    canvas.on('object:rotating', handleObjectRotating);
    // Cierra el gesto de arrastre de texto: sin esto, el primer evento del
    // PRÓXIMO arrastre calcularía su delta contra el último puntero del
    // arrastre anterior (que puede estar en cualquier parte del canvas),
    // produciendo un giro grande y espurio apenas se empieza a mover de
    // nuevo. Es inofensivo para íconos (no usan esta variable).
    canvas.on('mouse:up', () => {
      lastTextDragPointer = null;
    });
    canvas.on('object:added', syncElementCounts);
    canvas.on('object:removed', syncElementCounts);
    canvas.on('circularLineStyle:modified', handleCircularLineStyleModified);

    canvas.requestRenderAll();

    // Las tipografías se cargan de verdad en segundo plano (declaradas en
    // index.html); una vez listas, se vuelve a pintar para que cualquier
    // texto ya agregado antes de que terminaran de cargar se vea con la
    // tipografía real y no con el reemplazo del navegador.
    preloadEditorFonts().then(() => {
      canvas.requestRenderAll();
    });

    const editorActions = createEditorActions(canvas, VIROLA_CONFIG);
    setActions(editorActions);

    if (import.meta.env.DEV) {
      window.__editorActions = editorActions;
    }

    // Responsive: en pantallas angostas (celular/tablet), el <canvas> nativo
    // (siempre VIROLA_CONFIG.width/height de resolución, ~640px, para que el
    // grabado se vea nítido) no puede ocupar más ancho que el que le deja su
    // contenedor sin generar scroll horizontal (sección 12/16 de la Etapa 4:
    // requisito de UI, no un cambio de geometría de la virola — los 640px de
    // *resolución* interna no cambian, solo el tamaño en pantalla).
    //
    // Se logra con `setDimensions` (tamaño real en pantalla) + `setZoom`
    // (mismo factor), en vez de solo CSS: `setZoom` reescala el
    // `viewportTransform`, que es lo que Fabric.js usa tanto para dibujar
    // como para traducir clicks/touches a coordenadas de escena (ver
    // `getPointer`) — así los objetos siguen siendo seleccionables,
    // arrastrables, etc. con precisión en cualquier tamaño de pantalla. Un
    // simple `max-width` por CSS únicamente escala la imagen, no los
    // eventos de puntero, y desalinearía el drag/resize de Fabric.js.
    const container = canvasEl.parentElement;

    function getAvailableWidth(el: HTMLElement): number {
      const style = window.getComputedStyle(el);
      const paddingX = parseFloat(style.paddingLeft || '0') + parseFloat(style.paddingRight || '0');
      return Math.max(0, el.clientWidth - paddingX);
    }

    function applyResponsiveScale(): void {
      if (!container) {
        return;
      }
      const availableWidth = getAvailableWidth(container);
      if (!availableWidth) {
        return;
      }
      // Nunca se agranda más allá de la resolución nativa (escalar > 1
      // desenfocaría el trazo, sin ninguna ganancia real de espacio útil).
      const scale = Math.min(1, availableWidth / VIROLA_CONFIG.width);
      canvas.setDimensions({
        width: VIROLA_CONFIG.width * scale,
        height: VIROLA_CONFIG.height * scale,
      });
      canvas.setZoom(scale);
      canvas.requestRenderAll();
    }

    applyResponsiveScale();

    let resizeObserver: ResizeObserver | undefined;
    if (container && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(applyResponsiveScale);
      resizeObserver.observe(container);
    }

    return () => {
      resizeObserver?.disconnect();
      canvas.dispose();
      canvasRef.current = null;
      setActions(null);
      setSelection({ type: 'none' });
      setElementCounts({ total: 0, text: 0, icon: 0 });
      setCircularLineStyleState('none');
      setIsContextMenuOpen(false);
      if (import.meta.env.DEV) {
        delete window.__editorActions;
      }
    };
  }, [canvasElRef]);

  return {
    actions,
    selection,
    elementCounts,
    circularLineStyle,
    isContextMenuOpen,
    closeContextMenu: () => setIsContextMenuOpen(false),
  };
}
