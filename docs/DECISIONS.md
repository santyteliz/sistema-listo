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

## D4 — Motor gráfico del editor: Fabric.js
**Alternativa evaluada:** Konva.js.
**Motivo de la elección:** Fabric.js ya trae resuelto de fábrica la selección, mover,
rotar y escalar objetos, y la serialización/restauración del diseño a JSON — Konva
exige construir esas interacciones desde más abajo. El texto curvo (funcionalidad
crítica del proyecto) no viene resuelto de fábrica en ninguna de las dos, así que no
fue un factor decisivo entre ellas.
**Condición:** esta elección se valida con un prototipo chico (Fase 1) que debe
demostrar texto curvo funcionando, y guardar/restaurar el diseño, antes de construir
el editor completo. Si el texto curvo resulta inviable en Fabric.js, se reevalúa Konva.