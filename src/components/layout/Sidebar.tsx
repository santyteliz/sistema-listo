import './Sidebar.css';

/**
 * Panel lateral izquierdo. Todavía sin controles funcionales — esta tarea
 * solo arma la estructura visual base; los paneles de plantillas/texto/
 * íconos se agregan en tareas futuras.
 */
export function Sidebar() {
  return (
    <aside className="sidebar">
      <p className="sidebar__placeholder">
        Acá van a ir los controles del editor (plantillas, texto, íconos).
      </p>
    </aside>
  );
}
