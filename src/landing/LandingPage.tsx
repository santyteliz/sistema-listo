import { useState } from 'react';
import { Landing } from './Landing';

/**
 * Página wrapper de la landing. Maneja la transición breve antes de navegar
 * al personalizador. La animación de salida del Hero (~720ms) se dispara
 * primero, luego se muestra la pantalla de transición (~1s), y finalmente
 * se navega a /personalizar.
 */
export function LandingPage() {
  const [showTransition, setShowTransition] = useState(false);

  const handleCreateMate = () => {
    setShowTransition(true);
    // Transición breve (~1s) antes de navegar al editor
    window.setTimeout(() => {
      window.location.href = '/personalizar';
    }, 1000);
  };

  if (showTransition) {
    return (
      <div className="landing transition-screen">
        <span className="transition-screen__plane transition-screen__plane--one" aria-hidden="true" />
        <span className="transition-screen__plane transition-screen__plane--two" aria-hidden="true" />
        <div className="transition-content">
          <p className="transition-text">Preparando tu experiencia...</p>
          <div className="transition-loader" />
        </div>
      </div>
    );
  }

  return <Landing onCreateMate={handleCreateMate} />;
}
