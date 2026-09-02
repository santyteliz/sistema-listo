import { useRef } from 'react';
import { useFabricCanvas } from './useFabricCanvas';
import { VIROLA_CONFIG } from '../../config/virola.config';
import './MateCanvas.css';

/**
 * Componente visual del canvas. No conoce Fabric.js: solo monta el
 * elemento <canvas> del DOM y delega toda la lógica gráfica al hook
 * useFabricCanvas (ver docs/ARCHITECTURE.md, "Principios de arquitectura").
 */
export function MateCanvas() {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  useFabricCanvas(canvasElRef);

  return (
    <div className="mate-canvas">
      <canvas
        ref={canvasElRef}
        width={VIROLA_CONFIG.width}
        height={VIROLA_CONFIG.height}
      />
    </div>
  );
}
