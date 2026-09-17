# DEPLOYMENT-HANDOFF.md — instalación, build y despliegue en Hostinger

Guía práctica para instalar, correr, buildear y desplegar el personalizador. Ver
`docs/TEAM-HANDOFF.md` primero para las reglas de qué se puede/no se puede modificar.

## 0. Investigación previa (ya hecha, para que no la repitas)

- **Entrada de la app**: `index.html` → carga `/src/main.tsx`, que monta
  `<App />` (`src/App.tsx`), que renderiza directamente `<EditorPage />`
  (`src/pages/EditorPage.tsx`). Es una aplicación de **una sola página**.
- **Routing**: no existe ninguna librería de routing en el proyecto (se confirmó
  buscando "router" en `package.json`/`package-lock.json` — no hay resultados). No
  instalar React Router ni ningún router para esta integración: no hace falta, y
  agregarlo sería una dependencia nueva no pedida.
- **La landing/página de inicio del cliente NO está en este repositorio.** El
  personalizador es (y debe seguir siendo) una app independiente. La integración con
  la landing existente es, en su forma más simple, un **link normal** desde la
  landing hacia donde quede desplegado este build — no requiere fusionar ambos
  proyectos en un mismo codebase ni tocar el código del editor.
- **Build**: Vite 8, `npm run build` genera una carpeta `dist/` 100% estática (HTML +
  CSS + JS + un `.wasm` + assets). No requiere Node en el servidor — cualquier
  hosting de archivos estáticos alcanza.

## 1. Requisitos

- **Node.js**: se desarrolló y probó con Node v24 (`node --version`). Vite 8 requiere
  una versión moderna de Node — Node 20 LTS o más nuevo debería funcionar; si algo
  falla en un Node más viejo, actualizar Node antes de investigar otra causa.
- **npm** (viene con Node). No se usa pnpm/yarn en este proyecto (hay `package-lock.json`,
  no `pnpm-lock.yaml` ni `yarn.lock`).

## 2. Instalar dependencias

```bash
npm install
```

No hay variables de entorno requeridas (`.env`) — este proyecto no tiene backend ni
llama APIs propias. Sí depende de Google Fonts en tiempo de ejecución (ver
`index.html`, carga tipografías por `<link>` desde `fonts.googleapis.com`) — necesita
que el dominio final tenga salida a internet normal, sin configuración especial.

## 3. Ejecutar localmente

```bash
npm run dev
```

Levanta un servidor de desarrollo (Vite) — por defecto en `http://localhost:5173/`.
`vite.config.ts` ya tiene `server: { host: true }`, así que también queda accesible
desde otros dispositivos de la misma red (útil para probar en un celular real durante
el desarrollo — ver la URL "Network" que imprime la terminal al levantar el server).

## 4. Generar build de producción

```bash
npm run build
```

Corre `tsc -b && vite build` (falla si hay errores de TypeScript — es intencional, no
saltear este chequeo). Antes de un despliegue real, correr también:

```bash
npx tsx --test $(find src -name "*.test.ts" -o -name "*.test.tsx")
npm run lint
```

(No existe un script `npm test` en `package.json` — la suite se corre así, sobre
Node directamente vía `tsx`, sin dependencias nuevas.)

## 5. Carpeta de producción

El build genera **`dist/`** — confirmado con un build real:

```text
dist/
  index.html
  favicon.svg
  assets/            → JS/CSS con hash de contenido en el nombre, más
                        vectortracer_bg-*.wasm (el vectorizador de imágenes)
  brand/              → logo/isotipo
  fonts/              → tipografías propias de la UI (no las de Google Fonts,
                        esas se cargan por CDN)
  icons/              → el catálogo completo (manifest.json + thumbnails) — el
                        editor lo pide en tiempo de ejecución vía fetch('/icons/manifest.json')
  diagnostics/         → archivos de diagnóstico sin uso (no referenciados desde
                        ningún .tsx/.ts — ver nota abajo)
```

**`dist/` es 100% estático.** Subir el CONTENIDO de esta carpeta (no la carpeta en
sí) a la raíz del hosting/subcarpeta elegida.

**Nota sobre `dist/diagnostics/`**: son archivos HTML/SVG de diagnóstico de una etapa
anterior, sin ninguna referencia desde el código de la app — no le hacen nada al
funcionamiento, pero tampoco hacen falta en producción (~370KB de peso muerto,
incluye una copia completa de `fabric.min.js`). No los borré (no es mi decisión
unilateral tomarlo), pero es seguro excluirlos del despliegue si querés aligerar la
subida — ver la sección "Riesgos" del informe de esta etapa.

## 6. Configurar Hostinger

No tengo acceso a la cuenta de Hostinger del cliente, así que esto es una guía, no
una integración ya hecha.

1. **Tipo de hosting**: cualquier plan de Hostinger que sirva archivos estáticos
   (hosting web compartido con administrador de archivos/FTP alcanza — no hace falta
   Node.js en el servidor, esto NO es una app que necesite un proceso corriendo).
2. **Dónde vivirá el personalizador**: decidir esto ANTES de buildear si va a quedar
   en una subcarpeta (ej. `midominio.com/personalizador/`) en vez de la raíz de un
   dominio o subdominio propio (ej. `personalizador.midominio.com/`):
   - **Si va en la raíz de un dominio/subdominio propio**: no hace falta ningún
     cambio de configuración — `vite.config.ts` no define `base` hoy, lo que
     significa que asume raíz (`/`) por defecto. Solo `npm run build` y subir
     `dist/`.
   - **Si va a vivir en una subcarpeta** (ej. `/personalizador/`): hay que agregar
     `base: '/personalizador/'` a la config de `defineConfig` en `vite.config.ts`
     ANTES de buildear (si no, los assets se van a pedir desde la raíz del dominio y
     no van a cargar). Este es exactamente el tipo de "configuración necesaria
     exclusivamente para deployment" que `docs/TEAM-HANDOFF.md` autoriza a tocar —
     es una sola línea, no toca nada de `src/editor/`. **No lo agregué yo porque
     todavía no sabemos la ruta final real** (sección 11 del pedido: no inventar
     configuración).
3. **Rewrites/`.htaccess`**: **no hace falta ninguno.** Al no haber routing del lado
   del cliente (sección 0), no existe el problema típico de SPA de "recargar una
   ruta interna da 404" — cada request de verdad corresponde a un archivo real de
   `dist/`.
4. **El archivo `.wasm`** (`vectortracer_bg-*.wasm`, usado para vectorizar imágenes
   subidas): la mayoría de los hosts estáticos ya sirven `.wasm` con el
   `Content-Type` correcto por defecto, pero es el único tipo de archivo "no
   estándar" del build — si después de desplegar la función "subir imagen propia"
   falla en el navegador (revisar la consola), lo primero a chequear es el
   `Content-Type` que Hostinger le da a `.wasm` (debería ser `application/wasm`).
   Recomiendo probar específicamente esa función (subir una imagen) apenas esté
   desplegado, no asumir que funciona solo porque el resto del editor carga bien.

## 7. Conectar dominio

Estándar de Hostinger (apuntar el dominio/subdominio al hosting, activar HTTPS con su
SSL gratuito). No hay nada específico de este proyecto acá — es la misma configuración
que cualquier sitio estático.

## 8. Que la landing enlace al personalizador

Como no hay routing ni fusión de proyectos, la integración más simple y de menor
riesgo es un link/botón normal en la landing existente apuntando a la URL final del
personalizador (ej. `<a href="https://personalizador.midominio.com/">Personalizar mi
mate</a>`, o la ruta que corresponda según el punto 6.2). Si el equipo de la landing
quiere una integración más profunda (ej. dentro de un iframe, o compartiendo
header/footer visualmente), eso es trabajo de **diseño visual de la landing**, no del
editor — está permitido, siempre que no implique tocar `src/editor/`.

## 9. Comprobar que el personalizador carga correctamente

Checklist mínimo post-deploy (ver también `docs/HANDOFF-CHECKLIST.md`):

- La página carga sin pantalla en blanco ni errores en la consola del navegador.
- El catálogo de íconos aparece (confirma que `fetch('/icons/manifest.json')` está
  resolviendo bien la ruta — el primer síntoma de un problema de `base` mal
  configurado es que ESTO falle con 404).
- Las tipografías de Google Fonts se ven distintas entre sí (confirma que los
  `<link>` de `index.html` están cargando desde el dominio real).
- Subir una imagen propia funciona (confirma que el `.wasm` cargó bien).
- Exportar SVG/PDF descarga los dos archivos.
- Probar desde un celular real: selección por toque, pellizco, scroll de la página.
