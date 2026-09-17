import { useState } from 'react';
import { BRAND_LOGO } from '../../config/brand';
import { useEditor } from '../../editor/state/EditorContext';
import { VIROLA_CONFIG } from '../../config/virola.config';
import { exportDesignToSvgAndPdf } from '../../editor/export/designCombinedExporter';
import { downloadTextFile, downloadBlob, buildExportFileName } from '../../editor/export/downloadFile';
import './TopBar.css';

/**
 * Barra superior simple. Todavía no tiene navegación entre pasos
 * (Plantillas / Diseño / Revisión) — se agrega en una tarea futura.
 *
 * Deshacer/Rehacer viven acá (no en el Sidebar): son acciones globales del
 * editor, no controles de un elemento o panel puntual — mismo criterio que
 * cualquier editor gráfico (la barra superior, no el panel lateral). Íconos
 * en SVG inline, mismo patrón que ya usa el resto del editor para dibujar
 * íconos (ver IconPickerModal.tsx) — no se agregó ninguna librería de
 * íconos nueva.
 *
 * "Confirmar diseño" (Etapa 10; Etapa 13 — descarga SVG+PDF juntos): genera
 * los dos formatos de producción reales (`designCombinedExporter.ts`,
 * geometría vectorial — nunca una captura del canvas ni un screenshot) y
 * los descarga automáticamente, los dos, con un solo click. Vive acá (no en
 * el Sidebar) por el mismo criterio que Deshacer/Rehacer: es una acción
 * global sobre el diseño completo, siempre visible, no un control de un
 * elemento puntual. NO borra ni bloquea el diseño actual — el usuario puede
 * seguir editando y volver a confirmar cuantas veces quiera (pedido
 * explícito de la Etapa 10).
 *
 * "Todo o nada" (decisión explícita de la Etapa 13): `exportDesignToSvgAndPdf`
 * arma los dos archivos COMPLETOS en memoria antes de descargar cualquiera
 * de los dos — si el PDF no puede generarse (texto dependiente de fuente, o
 * un error real de conversión), no se descarga tampoco el SVG. Nunca deja
 * al usuario con una entrega a medias sin que quede claro qué faltó.
 *
 * El estado `'exporting'` deshabilita el botón mientras tanto — evita una
 * segunda exportación superpuesta con un solo click accidental doble (la
 * generación del PDF usa `import('jspdf')` dinámico y puede tardar un
 * momento apreciable).
 */
export function TopBar() {
  const { actions, canUndo, canRedo, undo, redo, elementCounts, circularLineStyle } = useEditor();
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'done' | 'error' | 'error-font-dependent'>('idle');
  const isDesignEmpty = elementCounts.total === 0 && circularLineStyle === 'none';

  async function handleConfirmDesign(): Promise<void> {
    if (!actions) return;
    setExportStatus('exporting');
    try {
      const result = await exportDesignToSvgAndPdf(actions.getCanvas(), VIROLA_CONFIG);
      if (result.status === 'empty') {
        setExportStatus('idle');
        return; // el botón ya está deshabilitado en este caso — defensivo, igual que el resto del editor
      }
      if (result.status === 'font-dependent-text') {
        setExportStatus('error-font-dependent');
        return;
      }
      if (result.status === 'pdf-error') {
        setExportStatus('error');
        return;
      }
      // 'success' — misma fecha para los dos nombres de archivo (pedido
      // explícito: que coincidan en el mismo día, nunca con hora).
      const date = new Date();
      downloadTextFile(result.svg, buildExportFileName('svg', date), 'image/svg+xml');
      downloadBlob(result.pdfBlob, buildExportFileName('pdf', date));
      setExportStatus('done');
    } catch {
      // Nunca se le muestra al usuario un error técnico (mismo criterio que
      // el resto del proyecto, ver `rasterIconExtractor.ts`) — el detalle
      // real queda en la consola para diagnóstico.
      setExportStatus('error');
    } finally {
      setTimeout(() => setExportStatus('idle'), 5000);
    }
  }

  return (
    <header className="top-bar">
      <img className="top-bar__logo" src={BRAND_LOGO.logotipo} alt="Mate Shop" />
      <span className="top-bar__title">Personalizador de mates</span>
      <div className="top-bar__history">
        <button
          type="button"
          className="top-bar__history-button"
          disabled={!canUndo}
          onClick={undo}
          aria-label="Deshacer"
          title="Deshacer"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 10h10a6 6 0 0 1 0 12h-3" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 10l5-5M3 10l5 5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Deshacer</span>
        </button>
        <button
          type="button"
          className="top-bar__history-button"
          disabled={!canRedo}
          onClick={redo}
          aria-label="Rehacer"
          title="Rehacer"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M21 10H11a6 6 0 0 0 0 12h3" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            <path d="M21 10l-5-5M21 10l-5 5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Rehacer</span>
        </button>
      </div>
      <div className="top-bar__confirm">
        {exportStatus === 'exporting' && (
          <span className="top-bar__confirm-status" role="status">Generando SVG y PDF…</span>
        )}
        {exportStatus === 'done' && (
          <span className="top-bar__confirm-status" role="status">✓ Diseño confirmado. Se descargaron los archivos SVG y PDF.</span>
        )}
        {exportStatus === 'error-font-dependent' && (
          <span className="top-bar__confirm-status top-bar__confirm-status--error" role="alert">
            No pudimos completar la exportación — un texto no se pudo convertir a curvas. Probá cambiar la tipografía o el contenido.
          </span>
        )}
        {exportStatus === 'error' && (
          <span className="top-bar__confirm-status top-bar__confirm-status--error" role="alert">
            No pudimos generar los archivos. Probá de nuevo.
          </span>
        )}
        <button
          type="button"
          className="top-bar__confirm-button"
          disabled={!actions || isDesignEmpty || exportStatus === 'exporting'}
          onClick={handleConfirmDesign}
        >
          Confirmar diseño
        </button>
      </div>
    </header>
  );
}
