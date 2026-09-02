import { useEditor } from '../state/EditorContext';
import { VIROLA_CONFIG } from '../../config/virola.config';
import './MateCanvas.css';

/**
 * Componente visual del canvas. No conoce Fabric.js: solo monta el
 * elemento <canvas> del DOM (el ref lo administra EditorProvider) y delega
 * toda la lógica gráfica a la capa de canvas (ver docs/ARCHITECTURE.md,
 * "Principios de arquitectura").
 */
export function MateCanvas() {
  const { canvasElRef } = useEditor();

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
