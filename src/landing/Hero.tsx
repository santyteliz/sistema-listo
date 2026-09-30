import { useEffect, useState } from 'react'
import { GlassButton } from './GlassButton'

interface HeroProps {
  onCreateMate: () => void
}

export function Hero({ onCreateMate }: HeroProps) {
  const [ready, setReady] = useState(false)
  const [exiting, setExiting] = useState(false)
  useEffect(() => { const id = window.setTimeout(() => setReady(true), 80); return () => window.clearTimeout(id) }, [])

  const handleCreateMate = () => {
    if (exiting) return
    setExiting(true)
    window.setTimeout(onCreateMate, 720)
  }

  return (
    <main className={`hero ${ready ? 'hero--ready' : ''} ${exiting ? 'hero--exiting' : ''}`}>
      <div className="hero-copy">
        <h1>
          <span className="hero-title__lead">CREÁ TU</span><br />
          <span className="hero-title__accent">MATE</span><br />
          <em>PERSONALIZADO</em>
        </h1>
        <p>Elegí los detalles y hacelo tuyo.</p>
        <GlassButton label={exiting ? 'ABRIENDO…' : 'EMPEZAR A PERSONALIZAR'} onClick={handleCreateMate} disabled={exiting} />
      </div>
      <footer className="hero-footer hero-footer--question" aria-label="MateShop">
        <p className="hero-footer__question">¿Estás para unos <strong>mates?</strong></p>
      </footer>
      <div data-banner-slot="future" hidden />
    </main>
  )
}
