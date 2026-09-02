import './TopBar.css';

/**
 * Barra superior simple. Todavía no tiene navegación entre pasos
 * (Plantillas / Diseño / Revisión) — se agrega en una tarea futura.
 */
export function TopBar() {
  return (
    <header className="top-bar">
      <span className="top-bar__title">Personalizador de mates</span>
    </header>
  );
}
