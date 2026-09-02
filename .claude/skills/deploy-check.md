# Skill: deploy-check

Usar antes de desplegar cualquier cambio a producción (Hostinger).

1. Ejecutar tests.
2. Ejecutar typecheck.
3. Ejecutar lint.
4. Revisar que las variables de entorno necesarias estén documentadas en .env.example
   (sin valores reales).
5. Verificar que no haya secretos hardcodeados en el código o en Git.
6. Revisar que el build termine sin errores.
7. Generar un checklist final en texto simple para que el dueño del proyecto confirme
   antes de que el deploy sea definitivo.
