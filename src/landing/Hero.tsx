import { useEffect, useState } from 'react'
import { ProductCarousel } from './ProductCarousel'
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
      <div className="hero-product"><ProductCarousel /></div>
      <footer className="hero-footer" aria-label="Origen y calidad de MateShop">
        <div className="hero-footer__pattern" aria-hidden="true" />
        <div className="hero-footer__content">
          <p>CALABAZA DE MISIONES <span>·</span> CUERO DE ENTRE RÍOS <span>·</span> TERMINADO A MANO EN MIRAMAR</p>
          <p className="hero-footer__question">¿Estás para unos <strong>mates?</strong></p>
        </div>
      </footer>
      <div data-banner-slot="future" hidden />
    </main>
  )
}
