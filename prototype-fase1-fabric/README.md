# Prototipo Fase 1 — Validación de Fabric.js (D4)

Prototipo técnico aislado, definido en `docs/DECISIONS.md` (D4) como condición antes
de construir el editor completo. **No es el personalizador final** y no forma parte de
la arquitectura de producción (`apps/`, `packages/`) — se puede borrar esta carpeta
entera en cualquier momento sin afectar el resto del proyecto.

No integra Tienda Nube, no tiene autenticación, base de datos, emails, pagos ni
selección de modelos de mate. Representa una única virola estándar (placeholder
visual: las medidas reales de producción todavía están pendientes, ver
`docs/PRODUCTION-SPECS.md`).

## Cómo abrirlo

Abrí `index.html` directamente en un navegador (doble click, o clic derecho → "Abrir
con..."). No requiere Node.js ni ninguna instalación: Fabric.js se carga desde un CDN
(cdnjs, versión 5.3.1) con una etiqueta `<script>`.

## Qué probar

1. "Agregar texto" — aparece un texto con curvatura por defecto.
2. Doble click sobre el texto para editar el contenido.
3. Arrastrar para mover, usar los handles de esquina para escalar, el handle superior
   para rotar.
4. Mover el slider "Intensidad" y el checkbox "Invertir dirección" con el texto
   seleccionado, para ver la curvatura cambiar en vivo.
5. "Serializar diseño" — el JSON completo aparece en el textarea.
6. "Limpiar canvas" — el diseño desaparece (queda solo el círculo placeholder).
7. "Restaurar desde el JSON de abajo" — el diseño vuelve, y el panel de "Diagnóstico"
   confirma si cada texto restauró su curvatura (radio, dirección, `pathStartOffset`,
   `pathSide`).

## Decisión de implementación

La curvatura usa la funcionalidad nativa de Fabric.js "texto sobre un path"
(`text.path` + `pathStartOffset` + `pathSide`, disponible desde Fabric.js v5), no una
simulación visual aparte. Esto es intencional: si esta funcionalidad no serializa o
restaura bien, es exactamente lo que D4 necesita saber antes de comprometerse a
Fabric.js para el editor completo.

## Bugs de Fabric.js 5.3.1 encontrados y resueltos acá

Probando el flujo completo (agregar → curvar → serializar → limpiar → restaurar) con
un navegador real aparecieron tres problemas reales de la librería, ya corregidos en
`index.html` (con comentarios en el código en cada punto):

1. **Asignar `texto.path = elPath` directamente no funciona.** Fabric.js necesita que
   la asignación pase por `texto.set('path', elPath)` para calcular internamente la
   geometría del arco (`path.segmentsInfo`). La asignación directa compila sin error
   pero rompe el primer render.
2. **`canvas.loadFromJSON` no reconstruye bien un texto curvo.** El `path` que arma a
   partir del JSON queda como un objeto plano, no como un objeto Fabric real, y eso
   tira una excepción *dentro* de la propia llamada a `loadFromJSON` — su callback
   nunca se llega a ejecutar. Hay que capturar el error con `try/catch`.
3. **Esa excepción deja el canvas con el dibujo desplazado/con zoom incorrecto**,
   porque interrumpe un render a mitad de camino. Hace falta forzar
   `canvas.setDimensions(...)` con las mismas medidas para que Fabric reinicie el
   contexto de dibujo limpio.
4. **Reconstruir el `path` a mano desde los datos ya deserializados no alcanza** — el
   texto deja de tirar error pero el curvado queda mal aplicado (se ve derecho). La
   solución que funcionó de forma confiable es volver a generar la curva con la misma
   función que arma el prototipo (`applyCurve`) a partir de `curveRadius` /
   `curveInverted`, dos propiedades propias que se guardan junto con el diseño
   específicamente para esto.

**Conclusión para D4:** el modelo de datos de Fabric.js para texto curvo (radio y
dirección) SÍ sobrevive el guardado y la restauración del diseño — la curvatura vuelve
igual — pero la reconstrucción automática de Fabric.js (`loadFromJSON`) no es
confiable tal cual viene en la v5.3.1 y necesitó una solución manual. Antes de construir
el editor completo sobre Fabric.js, conviene decidir si esa solución manual es
aceptable a largo plazo o si vale la pena probar Fabric.js v6 (reescritura más nueva)
para ver si el bug de restauración sigue estando.
