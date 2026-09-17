# HANDOFF-CHECKLIST.md

Checklist práctico para el desarrollador que recibe el proyecto. Ver
`docs/TEAM-HANDOFF.md` (qué se puede/no se puede tocar) y
`docs/DEPLOYMENT-HANDOFF.md` (cómo instalar/buildear/desplegar) para el detalle de
cada paso.

## Local

- [ ] `git clone` funciona y el repositorio abre sin errores.
- [ ] `npm install` funciona sin errores.
- [ ] `npm run dev` levanta el editor en `http://localhost:5173/` sin errores de
      consola.
- [ ] `npm run build` termina sin errores (corre `tsc -b` primero — si falla ahí,
      es un error de TypeScript real, no ignorarlo).
- [ ] La suite de tests corre y pasa: `npx tsx --test $(find src -name "*.test.ts" -o -name "*.test.tsx")`.
- [ ] `npm run lint` corre sin errores nuevos (algunos warnings preexistentes son
      esperables — ver `docs/TEAM-HANDOFF.md` si aparece uno nuevo después de un
      cambio).

## Editor (smoke test funcional — no debería romperse con cambios visuales)

- [ ] Agregar texto, editarlo, cambiar fuente, invertirlo, moverlo, eliminarlo.
- [ ] Agregar un ícono del catálogo, moverlo, eliminarlo.
- [ ] Los límites bloquean correctamente al llegar a 4 textos / 16 íconos / 20 total.
- [ ] Líneas circulares: probar No / Simple / Doble.
- [ ] Undo y Redo funcionan sobre varias acciones seguidas.
- [ ] Reset ("Empezar desde cero") pide confirmación y es deshacible con Undo.
- [ ] Persistencia: hacer un diseño, refrescar la página, el diseño sigue ahí (y
      Deshacer aparece deshabilitado, no con un paso falso hacia "vacío").
- [ ] Exportar SVG y PDF descarga ambos archivos correctamente.

## Mobile (real o emulado)

- [ ] Seleccionar un texto o ícono tocándolo una vez.
- [ ] Tocar una zona vacía deselecciona.
- [ ] El scroll de la página funciona normalmente (no queda "atrapado" en el canvas).
- [ ] Pellizco de dos dedos sobre un texto seleccionado cambia su tamaño.
- [ ] Pellizco de dos dedos sobre un ícono seleccionado cambia su tamaño.
- [ ] Rotación de dos dedos sobre un ícono seleccionado lo rota.
- [ ] La toolbar contextual aparece cerca del elemento seleccionado, sin salirse de
      la pantalla.

## Deployment

- [ ] `npm run build` genera `dist/` sin errores.
- [ ] Los assets (`dist/assets/`, `dist/icons/`, `dist/fonts/`, `dist/brand/`) están
      presentes en el build.
- [ ] Decidido si el personalizador vive en la raíz de un (sub)dominio propio o en
      una subcarpeta — y si es subcarpeta, `base` configurado en `vite.config.ts`
      ANTES de ese build (ver `docs/DEPLOYMENT-HANDOFF.md`, punto 6.2).
- [ ] La landing (fuera de este repo) enlaza correctamente al personalizador
      desplegado.
- [ ] Dominio conectado y apuntando al hosting.
- [ ] HTTPS activo.
- [ ] Prueba real desde un celular (no solo el emulador del navegador): carga,
      selección táctil, pellizco, scroll.
