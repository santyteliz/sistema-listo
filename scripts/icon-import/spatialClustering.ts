/**
 * Agrupamiento espacial de subpaths — Etapa 2 (criterio "un solo diseño").
 *
 * Pregunta que responde: dados los subpaths de relleno de un PDF (cada uno
 * con su propio bounding box), ¿cuántos GRUPOS espacialmente independientes
 * forman? Un ícono real legítimo puede tener decenas de subpaths (detalles,
 * agujeros, líneas de pelaje — ver `pdfToPaths.ts`, el pug de prueba tiene
 * 63) pero todos MUY cerca entre sí, formando una sola mancha coherente.
 * Un PDF mal preparado con dos íconos en la misma página tiene, en cambio,
 * dos grupos bien separados con un hueco real en el medio. La cantidad de
 * GRUPOS (no la cantidad de subpaths) es la señal que importa — exactamente
 * el pedido: "la pregunta principal debe ser: ¿estos elementos forman
 * claramente un único ícono coherente o parecen varios diseños
 * independientes?".
 *
 * MÉTODO (unión de conjuntos / componentes conexas sobre bounding boxes):
 * dos subpaths se consideran parte del MISMO grupo si sus bounding boxes se
 * tocan/superponen, o si la distancia entre ellos es chica EN RELACIÓN a su
 * propio tamaño (`PROXIMITY_RATIO` — ver abajo). Es deliberadamente
 * relativo al tamaño de las piezas, no un número fijo de píxeles/unidades:
 * así funciona igual para un ícono grande que para uno chico, sin necesitar
 * calibrar un umbral absoluto por archivo. Se itera hasta que no cambian
 * más los grupos (unión-find clásico), así el orden en que llegan los
 * subpaths no importa — mismo resultado sin importar el orden de entrada
 * (determinismo, igual que el resto del importador).
 *
 * No es Inteligencia Artificial ni heurística "inteligente" — es geometría
 * simple y explicable: cada decisión se puede auditar mirando las dos
 * mismas cifras (distancia entre cajas, tamaño de las cajas).
 */
import type { BoundingBox } from '../../src/editor/icons/normalizeIconPath.ts';

/**
 * Qué tan cerca (relativo al tamaño de las piezas) tienen que estar dos
 * bounding boxes para considerarse parte del mismo grupo geométrico.
 *
 * Calibrado empíricamente contra una muestra real etiquetada a mano (12+
 * archivos "buenos" de un solo ícono con muchos subpaths legítimos —
 * pelaje, garras, acentos — contra varios "malos" con más de un diseño en
 * la misma página) — un valor de `0.5` (el primer intento) agrupaba
 * CORRECTAMENTE los íconos con detalles, pero también fusionaba de más los
 * casos con varios diseños. `0.15` es el punto donde los subpaths quedan
 * en MUCHOS grupos chicos (incluso dentro de un solo ícono legítimo, ej. el
 * pelaje de un animal puede fragmentarse en docenas) — a propósito: acá NO
 * se decide todavía "cuántos diseños hay", eso lo hace
 * `countSignificantClusters` filtrando por TAMAÑO relativo (ver abajo), no
 * por cantidad de grupos crudos.
 */
const PROXIMITY_RATIO = 0.15;

/**
 * Un grupo geométrico (de los que arma `clusterBoundingBoxes`) cuenta como
 * un "diseño real" solo si su área es al menos esta fracción del área del
 * grupo más grande — así un puñado de mechones de pelaje sueltos (grupos
 * chicos, resultado normal de `PROXIMITY_RATIO` bajo) no cuenta como "otro
 * diseño", pero dos escudos de tamaño comparable en la misma página sí.
 * También calibrado contra la misma muestra real (ver el comentario de
 * `PROXIMITY_RATIO`): 20% separó correctamente los casos con múltiples
 * diseños de tamaño similar sin descartar por error íconos legítimos con
 * detalles/accesorios chicos (garras de un cangrejo ~17-18% del cuerpo,
 * mechones de pelaje bien por debajo del 20%).
 *
 * LÍMITE CONOCIDO (documentado, no resuelto — ver el informe de esta
 * etapa): cuando dos diseños realmente distintos están dibujados MUY cerca
 * o tocándose en la página (dos escudos pegados, por ejemplo), ningún
 * umbral de distancia entre bounding boxes los separa de forma confiable
 * sin también fragmentar íconos legítimos con detalles apretados — la
 * inspección visual de los contact sheets (Paso 9 del pedido) es la red de
 * seguridad para estos casos, no un ajuste numérico más fino acá.
 */
const SIGNIFICANCE_AREA_RATIO = 0.2;

export interface ClusterInfo {
  /** Índices (en el array de entrada) de los subpaths que forman este grupo. */
  memberIndices: number[];
  /** Bounding box combinado de todo el grupo. */
  boundingBox: BoundingBox;
  /** Área del bounding box combinado del grupo (unidades de página al cuadrado) — no es el área real de la tinta, es el área del rectángulo que lo encierra. */
  area: number;
}

function boxWidth(b: BoundingBox): number {
  return b.maxX - b.minX;
}
function boxHeight(b: BoundingBox): number {
  return b.maxY - b.minY;
}
function boxDiagonal(b: BoundingBox): number {
  return Math.hypot(boxWidth(b), boxHeight(b));
}
function boxArea(b: BoundingBox): number {
  return Math.max(0, boxWidth(b)) * Math.max(0, boxHeight(b));
}

/** Distancia entre dos bounding boxes alineados a los ejes: 0 si se tocan/superponen, si no la distancia real entre los bordes más cercanos (nunca la distancia entre centros, que subestima cajas grandes). */
function boxGap(a: BoundingBox, b: BoundingBox): number {
  const dx = Math.max(a.minX - b.maxX, b.minX - a.maxX, 0);
  const dy = Math.max(a.minY - b.maxY, b.minY - a.maxY, 0);
  return Math.hypot(dx, dy);
}

function mergeBoxes(a: BoundingBox, b: BoundingBox): BoundingBox {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/** Unión-find clásico (con compresión de camino) — estructura estándar para componentes conexas, no una invención propia. */
class UnionFind {
  private readonly parent: number[];
  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }
  find(x: number): number {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]);
    }
    return this.parent[x];
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) {
      this.parent[ra] = rb;
    }
  }
}

/**
 * Agrupa bounding boxes en componentes conexas por proximidad relativa. El
 * criterio de unión entre dos cajas A y B: `gap(A,B) <= PROXIMITY_RATIO *
 * max(diagonal(A), diagonal(B))` — el margen se escala con la caja más
 * grande de las dos, para que una caja chica cerca de una grande (ej. un
 * detalle chico junto al cuerpo principal) también se una correctamente.
 *
 * Devuelve los grupos ordenados de mayor a menor área (el grupo "principal"
 * primero) — orden determinístico, no depende de en qué orden llegaron los
 * subpaths.
 */
export function clusterBoundingBoxes(boxes: readonly BoundingBox[]): ClusterInfo[] {
  if (boxes.length === 0) {
    return [];
  }
  const uf = new UnionFind(boxes.length);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const threshold = PROXIMITY_RATIO * Math.max(boxDiagonal(boxes[i]), boxDiagonal(boxes[j]));
      if (boxGap(boxes[i], boxes[j]) <= threshold) {
        uf.union(i, j);
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < boxes.length; i++) {
    const root = uf.find(i);
    const list = groups.get(root);
    if (list) {
      list.push(i);
    } else {
      groups.set(root, [i]);
    }
  }

  const clusters: ClusterInfo[] = Array.from(groups.values()).map((memberIndices) => {
    const boundingBox = memberIndices.map((i) => boxes[i]).reduce(mergeBoxes);
    return { memberIndices, boundingBox, area: boxArea(boundingBox) };
  });

  clusters.sort((a, b) => b.area - a.area);
  return clusters;
}

/**
 * Cuenta cuántos de los grupos de `clusterBoundingBoxes` son lo bastante
 * grandes (ver `SIGNIFICANCE_AREA_RATIO`) como para contar como un "diseño
 * real" — la señal que de verdad usa el clasificador (`classifyIcon.ts`)
 * para decidir "¿un solo ícono o varios?", no la cantidad cruda de grupos
 * (que con `PROXIMITY_RATIO` bajo puede ser alta incluso en un ícono
 * legítimo con muchos detalles chicos — ver el comentario grande de
 * `SIGNIFICANCE_AREA_RATIO`).
 */
export function countSignificantClusters(clusters: readonly ClusterInfo[]): number {
  if (clusters.length === 0) {
    return 0;
  }
  const largestArea = clusters[0].area; // ya vienen ordenados de mayor a menor área
  return clusters.filter((c) => c.area >= SIGNIFICANCE_AREA_RATIO * largestArea).length;
}
