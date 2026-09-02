import { TopBar } from '../components/layout/TopBar';
import { Sidebar } from '../components/layout/Sidebar';
import { MateCanvas } from '../editor/canvas/MateCanvas';
import { EditorProvider } from '../editor/state/EditorContext';
import './EditorPage.css';

/**
 * Página del editor. Por ahora solo arma el layout base (header + panel
 * lateral + canvas) — la navegación entre pasos (Plantillas / Diseño /
 * Revisión) se agrega en una tarea futura.
 */
export function EditorPage() {
  return (
    <EditorProvider>
      <div className="editor-page">
        <TopBar />
        <div className="editor-page__body">
          <Sidebar />
          <MateCanvas />
        </div>
      </div>
    </EditorProvider>
  );
}
