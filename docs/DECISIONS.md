# DECISIONS.md

## D1 — Identificar el diseño por SKU/línea de pedido, no solo por número de pedido
**Problema:** un pedido de Tienda Nube puede tener más de un producto y/o más de una
unidad del mismo producto. Si el diseño solo se asocia al número de pedido, el equipo
de producción no puede saber a cuál mate corresponde cada diseño.

**Decisión:** cada diseño se asocia a `orderId + lineItemId + unitIndex` (no solo a
`orderId`). El mail que recibe producción siempre incluye: número de pedido, SKU,
nombre del producto, número de unidad (ej. "1 de 2"), y el diseño (JSON + preview).

## D2 — Momento de habilitar el envío oficial: después del pago, no durante el checkout
**Alternativa descartada:** ofrecer el acceso al personalizador dentro de la pasarela
de pago de Tienda Nube.
**Motivo del descarte:** Tienda Nube no permite intervenir su checkout nativo en la
mayoría de los planes, y el pedido no es un dato definitivo hasta que el pago se
confirma.
**Decisión:** el backend escucha el webhook `order/paid`. En ese momento consulta el
detalle real del pedido (line items, SKUs, cantidades) y genera un link único y seguro
por cada unidad de mate comprada. Todos los links llegan en un solo mail al cliente.

## D3 — Múltiples unidades del mismo SKU en un mismo pedido
**Decisión:** el cliente diseña primero la unidad 1 desde cero. Para las unidades
siguientes del mismo SKU, se le ofrecen dos opciones: "usar el mismo diseño" (clona el
JSON de una unidad anterior) o "crear uno nuevo" (abre el editor vacío/desde plantilla).
Cada diseño clonado guarda una referencia `clonedFrom` al diseño original, para que
producción sepa que la repetición es intencional.

## D4 — Motor gráfico del editor: Fabric.js 6.0.2
**Alternativa evaluada:** Konva.js.
**Motivo de la elección:** Fabric.js ya trae resuelto de fábrica la selección, mover,
rotar y escalar objetos, y la serialización/restauración del diseño a JSON — Konva
exige construir esas interacciones desde más abajo. El texto curvo (funcionalidad
crítica del proyecto) no viene resuelto de fábrica en ninguna de las dos, así que no
fue un factor decisivo entre ellas.

**Validación:** la elección se validó con dos prototipos técnicos aislados, ejecutados
en Chrome real mediante Playwright (no simulación manual): uno con Fabric.js 5.3.1 y
otro con Fabric.js 6.0.2. En ambos se probó el mismo flujo crítico: crear texto,
aplicarle curvatura, modificar radio/dirección/posición, serializar el diseño y
restaurarlo con `loadFromJSON()`.

**Resultado:**
- **Fabric.js 5.3.1 queda descartado para el proyecto.** `loadFromJSON()` reconstruye
  el texto curvo de forma defectuosa (el `path` queda como objeto plano, no como
  instancia real de Fabric), tira una excepción interna que corta la restauración a
  mitad de camino, y corrompe la transformación del canvas. Sortear esto exigía
  workarounds manuales (try/catch, reset de dimensiones del canvas, reconstrucción
  manual del `Path`) que el proyecto no quiere mantener a largo plazo.
- **Fabric.js 6.0.2 resuelve el problema de raíz.** `loadFromJSON()` restaura el texto
  curvo sin excepciones y sin ningún workaround manual: el `path` queda reconstruido
  como una instancia real de Fabric, y el radio, la dirección, la posición, la rotación
  y la escala se recuperan idénticos al diseño original.

**Decisión final:** el editor real usa **Fabric.js 6.0.2** como dependencia, integrado
con React + TypeScript + Vite (Fabric.js 6 se distribuye como ES module, compatible de
forma nativa con ese stack). El texto curvo se implementa siempre como un objeto Fabric
nativo serializable (texto sobre un `path`, con sus propiedades `pathStartOffset` /
`pathSide` / `pathAlign`) — nunca como una simulación visual que no pueda guardarse y
reconstruirse fielmente.