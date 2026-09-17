# Biblioteca visual de referencia — Zizou

Esta carpeta es la referencia de trabajo permanente sobre el comportamiento del personalizador de Zizou (`zizoumates.creatumate.com.ar`), generada una sola vez a partir de `referencias/zizou/zizou referencia.mp4` (video de ~2:35, aportado por el usuario).

## Cómo usar esta referencia (leer esto antes de re-procesar el video)

Para cualquier pedido futuro del tipo *"comparar con Zizou"* o *"revisar cómo funcionaba esto en el video"*, consultar PRIMERO, en este orden:

1. **`VISUAL-SPECS.md`** — si la pregunta es sobre geometría, medidas, posiciones o apariencia visual.
2. **`INTERACTION-MAP.md`** — si la pregunta es sobre CÓMO se comporta algo (qué pasa cuando el usuario hace X).
3. **`FRAME-INDEX.md`** — para ubicar el frame exacto que respalda una afirmación, o para saber en qué timestamp del video está algo.
4. **`frames/`** — para mirar la imagen directamente.
5. **`contact-sheet.png`** — para una vista general rápida de las 11 referencias en una sola imagen.

Solo volver a abrir/procesar `zizou referencia.mp4` si la pregunta necesita algo que estos documentos explícitamente NO cubren (ver "Limitaciones" abajo) — en ese caso, decírselo al usuario en vez de asumir que el video tiene la respuesta.

## Estructura

```text
referencias/zizou/
├── zizou referencia.mp4      ← video original, INTACTO (no modificado ni movido)
├── 01..12-*.png               ← capturas estáticas de una tarea anterior (sin relación con esta carpeta)
└── analisis/
    ├── README.md              ← este archivo
    ├── FRAME-INDEX.md         ← índice de los 11 frames elegidos, con timestamp y justificación
    ├── INTERACTION-MAP.md     ← comportamiento observado, por categoría
    ├── VISUAL-SPECS.md        ← medidas/posiciones, con "dato observado" separado de "hipótesis"
    ├── contact-sheet.png      ← las 11 miniaturas en una sola imagen, con número + timestamp
    └── frames/                ← los 11 PNG a resolución completa (o casi — 004 es un recorte ampliado)
```

## Herramienta usada

`ffmpeg` (ya estaba instalado en el entorno — se verificó antes de asumir que hacía falta otra cosa). Extracción en dos etapas:

1. **Candidatos**: 77 frames por muestreo periódico (1 cada 2s) + 31 frames por detección de cambio de escena (`select='gt(scene,0.03)'`, umbral bajo porque es una grabación de pantalla con poco movimiento, donde el umbral por defecto casi no detecta nada) = 108 candidatos, en una carpeta temporal fuera del repositorio (no se conservan).
2. **Selección**: revisión visual de los candidatos más prometedores (con la ayuda de dos "hojas de contacto" de descarte armadas también con `ffmpeg`, una por cada tanda) y elección manual de los 11 frames finales + un recorte ampliado de detalle.

No se usó Python/PIL/ImageMagick — no están instalados en este entorno (se verificó, no se asumió) — pero `ffmpeg` solo alcanzó para todo lo necesario (recortes, escalado, overlay de texto, montaje en grilla).

## Limitaciones honestas de esta referencia

- El video es **una sola sesión de edición continua**, no un recorrido feature-por-feature. Como resultado:
  - **"Simple" y "No" nunca se ven activos** — el selector se ve completo, pero "Doble" está presionado del primer al último frame revisado. No hay evidencia visual de esos dos estados.
  - **No hay frames intermedios de arrastre/resize/rotación en curso** — parece grabado en base a cortes/pantallazos discretos, así que solo hay estados de reposo antes y después, nunca el gesto animándose.
- Las medidas en `VISUAL-SPECS.md` se hicieron a mano con `ffmpeg` + lectura de píxeles crudos (sin Python/PIL) — son estimaciones con un margen de error reconocido (±10-15px por borde leído), nunca medidas de precisión de laboratorio. Están explícitamente marcadas como tales.
- Si en el futuro se agrega un video/captura que sí muestre "Simple", "No", o un gesto en curso, esta carpeta debería actualizarse (nuevos frames + actualizar los tres `.md`) — no descartar el análisis anterior, sumar a él.

## El video original

`zizou referencia.mp4` no se modificó, no se movió, no se recortó — sigue siendo la fuente primaria de respaldo. Todo lo de `analisis/` se puede regenerar desde él si hiciera falta, pero el objetivo de esta carpeta es precisamente NO tener que hacerlo para preguntas de referencia normales.
