# PRODUCT.md — pendiente de completar en la primera sesión de Claude Code

Ver CLAUDE.md sección "Primera tarea".

## Flujo post-compra (actualizado)

1. Cliente compra 1 o más mates en Tienda Nube (misma orden, uno o varios SKUs).
2. Webhook `order/paid` dispara el proceso en el backend.
3. Backend consulta el pedido completo: line items, SKU, nombre, cantidad de cada uno.
4. Por cada unidad de mate del pedido se genera un link único y seguro
   (orderId + lineItemId + unitIndex codificados en un token no adivinable).
5. Un solo mail al cliente con un link por cada unidad, rotulado con el nombre del
   producto y "unidad X de N".
6. Al entrar a la unidad 1, el cliente diseña desde cero.
7. Al entrar a una unidad siguiente del mismo SKU, se le ofrece "usar el mismo diseño"
   (clonar) o "crear uno nuevo".
8. Al confirmar cada diseño, queda en estado "enviado para producción" y se dispara el
   mail al equipo con: número de pedido, SKU, nombre del producto, unidad, JSON y
   preview de imagen.
