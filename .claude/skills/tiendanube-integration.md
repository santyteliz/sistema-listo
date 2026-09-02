# Skill: tiendanube-integration

Usar para cualquier trabajo relacionado con la API de Tienda Nube.

1. Consultar la documentación oficial vigente de Tienda Nube antes de asumir un
   endpoint, formato de respuesta o comportamiento — nunca inventar esos detalles.
2. Nunca exponer tokens ni secretos de la integración en el frontend.
3. Diseñar cada operación sensible (validar pedido, procesar webhook) para que sea
   idempotente — si se recibe dos veces el mismo evento, el resultado no debe duplicarse.
4. Registrar errores de integración de forma segura, sin loguear datos sensibles.
5. Documentar en docs/TIENDANUBE.md cualquier evento o dato nuevo que se empiece a usar.
