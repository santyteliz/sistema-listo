# PRODUCT.md

## Objetivo

App web donde cualquier persona puede personalizar el grabado de la virola de un mate
(texto, íconos, líneas decorativas) y ver el resultado en un preview realista, sin
necesidad de cuenta ni de haber comprado nada. Es una herramienta de diseño libre —
"probá antes de comprar" — y, en fases futuras, el canal por el cual una compra real en
Tienda Nube se convierte en un diseño definitivo enviado a producción (ver
`docs/DECISIONS.md`, D1–D3).

## Referencia funcional y visual

La referencia de producto es **CreaTuMate / Zizou Mates**
(`https://zizoumates.creatumate.com.ar/`), analizada en detalle a partir de 12 capturas
de su flujo completo (`referencias/01` a `12`). Se usa como referencia de **experiencia
y funcionalidades**, no como algo a clonar literalmente: adaptamos lo relevante a
nuestro propio producto, diseño visual y alcance de MVP.

## Alcance de este MVP

- **Standalone**: no depende de Tienda Nube, no tiene backend, no tiene base de datos.
- El usuario entra **directamente al personalizador de una virola estándar**. No hay
  pantalla de selección de mate/modelo — **no existe ese selector en este MVP**. Todo el
  proyecto asume una única virola.
- Sin login ni cuentas: cualquiera puede diseñar libremente.
- El resultado de este MVP es un diseño terminado, revisado y listo — sin que eso
  dispare todavía ningún proceso real de producción, pedido, pago o envío de mail (ver
  "Qué NO incluye este MVP" más abajo).

## Flujo principal del MVP

```
1. Plantillas   → elegir un punto de partida
2. Diseño       → editor completo (texto, íconos, líneas, imagen)
3. Revisión final → repasar el diseño antes de darlo por terminado
```

Igual que en la referencia, es un flujo de 3 pasos con navegación fija entre ellos y el
área de diseño (canvas) siempre visible.

### 1. Plantillas

Punto de entrada. Opciones iniciales:

- **Texto + 1 ícono**
- **Texto + 2 íconos**
- **Texto + 3 íconos**
- **Empezar desde cero**

Al elegir una plantilla se previsualiza en el canvas antes de confirmar. Elegir "cero"
o una plantilla habilita continuar al paso de Diseño.

### 2. Diseño

El editor. Un panel lateral **contextual** (su contenido cambia según qué objeto esté
seleccionado en el canvas: texto, ícono, o nada) y el canvas con la virola.

**Edición de texto**
- Agregar texto y editar su contenido.
- Elegir tipografía, de una biblioteca curada propia.
- El texto se renderiza siempre **curvo**, siguiendo el arco de la virola (no es una
  simulación visual: es un objeto de Fabric.js real sobre un `path`, serializable — ver
  `docs/DECISIONS.md`, D4).
- Control de curvatura (intensidad/radio del arco y dirección).
- Posición y rotación libres sobre el anillo.
- "Invertir texto": se incluye como funcionalidad a llevar al MVP, pero **su
  significado exacto todavía no está validado** (¿invierte el string de texto, o el
  sentido en que recorre el arco?). Hay que confirmarlo interactuando con la referencia
  en vivo antes de implementarlo — no asumir un comportamiento.

**Edición de íconos**
- Biblioteca propia de íconos (curados para el proyecto, no una librería genérica de
  terceros sin revisar — ver `docs/ARCHITECTURE.md`).
- Cambiar el ícono seleccionado por otro de la biblioteca.
- Mover, escalar y rotar.
- Espejar / invertir.
- Posición y ángulo de partida sobre el arco de la virola.

**Líneas circulares decorativas**
- Ninguna / simple / doble — anillos concéntricos decorativos alrededor del diseño.

**Subida de imágenes**
- El usuario puede subir una imagen propia para incorporarla al diseño.
- **La vectorización automática real (convertir la imagen subida en línea vectorial
  apta para grabado láser) queda pendiente de definir.** No se asume ninguna solución
  técnica todavía (librería, servicio propio, o alcance reducido para el MVP) — ver
  "Decisiones pendientes" en `docs/ARCHITECTURE.md`. Toda imagen subida debe sanitizarse
  antes de procesarse o mostrarse (regla no negociable de seguridad del proyecto).

**Guías visuales**
- Guías de alineación (cruz central) y guía del arco disponible para curvar texto,
  siempre visibles como referencia. No forman parte del diseño final exportado.

**Deshacer / rehacer**
- Estándar esperado en cualquier editor gráfico; no estaba documentado en la referencia
  pero se incluye como requisito propio del MVP.

**Autosave local**
- El diseño en curso se guarda automáticamente en el navegador (`localStorage`), sin
  necesidad de backend, para que nadie pierda su trabajo al cerrar o recargar la
  pestaña.

### 3. Revisión final

Reemplaza la pantalla de "Confirmar" de la referencia (que en Zizou Mates está atada a
un pedido real de Tienda Nube: tipo de compra, número de orden, envío al equipo). En
este MVP standalone esa lógica no existe todavía; esta pantalla es una **revisión del
diseño terminado** antes de darlo por cerrado, sin checkout ni envío real. El detalle
exacto de qué acciones ofrece (descargar, solo visualizar, etc.) es una decisión técnica
pendiente (ver `docs/ARCHITECTURE.md`).

## Qué NO incluye este MVP

- Integración con Tienda Nube.
- Backend.
- Base de datos.
- Login / cuentas de usuario.
- Pagos.
- Envío de emails.
- Pedidos reales o validación de compra.
- Integración con el equipo de producción.

## Preparación para fases futuras

Aunque este MVP es standalone, el diseño del producto debe quedar preparado
conceptualmente para conectarse más adelante con una compra real, sin rehacer el
editor. Eso significa, en particular:

- El modelo de datos del diseño (ver `docs/ARCHITECTURE.md`) debe poder asociarse en el
  futuro a `orderId + lineItemId + unitIndex` (D1) sin cambiar su estructura interna.
- El flujo post-compra ya decidido (D1–D3) — webhook `order/paid`, un link único por
  unidad de mate comprada, clonado de diseño entre unidades del mismo SKU — sigue siendo
  la referencia para cuando se construya esa fase. No se implementa en este MVP.

## Medidas físicas de la virola

**Pendientes.** No se asumen medidas reales de la virola (diámetro, área de grabado
segura, resolución/DPI necesaria para producción, etc.) — quedan documentadas como
pendientes de recibir del cliente en `docs/PRODUCTION-SPECS.md`. Mientras tanto, el
editor debe tratarlas como **configurables**, nunca hardcodeadas, para poder cargarlas
sin rehacer el editor apenas se confirmen (ver `docs/ARCHITECTURE.md`).

## Responsive / mobile

Es un requisito del MVP, no una mejora opcional. La referencia (capturas) solo muestra
uso de escritorio; el comportamiento en celular (guías, handles de Fabric.js para
mover/escalar/rotar, paneles) se diseña y prueba de forma propia, siguiendo
`.claude/skills/production-check.md`.
