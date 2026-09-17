/**
 * Convierte una línea circular real del canvas (Fabric `Path`, solo trazo —
 * ver `circularLines.ts`) a geometría exportable, en coordenadas absolutas
 * del canvas — Etapa 10. Mismo patrón que un ícono simple
 * (`iconExportGeometry.ts`), pero de trazo (`stroke`), nunca relleno.
 */
import type { Path } from 'fabric';
import { transformFabricPathCommands, serializeFabricPathCommands, type FabricPathCommand } from './exportPathGeometry';

export interface StrokeExportShape {
  d: string;
  strokeWidth: number;
}

export function extractCircularLineExportShape(line: Path): StrokeExportShape | null {
  const raw = (line.path ?? []) as unknown as FabricPathCommand[];
  if (raw.length === 0) return null;
  const matrix = line.calcTransformMatrix();
  const transformed = transformFabricPathCommands(raw, line.pathOffset, matrix);
  return { d: serializeFabricPathCommands(transformed), strokeWidth: line.strokeWidth ?? 1 };
}
