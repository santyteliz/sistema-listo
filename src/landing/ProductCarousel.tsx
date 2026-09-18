import { useEffect, useRef, useState } from 'react'

const referenceSlides = [
  {
    src: 'https://acdn-us.mitiendanube.com/stores/002/333/201/products/fotos-para-la-web-2025-02-12t035450-985-8ca3a6d0f7ac3ab0bd17393432994623-1024-1024.webp',
    alt: 'Referencia temporal de mate imperial personalizable',
  },
  {
    src: 'https://acdn-us.mitiendanube.com/stores/006/451/524/products/torpedo-imperial-lacre-c7452658022d278f0f17524646767919-1024-1024.webp',
    alt: 'Referencia temporal de mate torpedo imperial personalizado',
  },
  {
    src: 'https://d22fxaf9t8d39k.cloudfront.net/207484e0045e8f245f6ec99e02aa53feefd2a990485d546a662efeb4e7fb31f7164746.jpg',
    alt: 'Referencia temporal de mate grabado personalizado',
  },
]

const positionFor = (index: number, active: number, length: number) => {
  const forward = (index - active + length) % length
  if (forward === 0) return 0
  if (forward === 1) return 1
  return -1
}

export function ProductCarousel() {
  const [active, setActive] = useState(0)
  const touchStartX = useRef<number | null>(null)

  useEffect(() => {
    const interval = window.setInterval(() => setActive((current) => (current + 1) % referenceSlides.length), 4600)
    return () => window.clearInterval(interval)
  }, [])

  const change = (direction: number) => setActive((current) => (current + direction + referenceSlides.length) % referenceSlides.length)

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    touchStartX.current = event.clientX
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (touchStartX.current === null) return

    const distance = event.clientX - touchStartX.current
    touchStartX.current = null

    if (Math.abs(distance) < 36) return
    change(distance > 0 ? -1 : 1)
  }

  return (
    <section className="product-carousel" aria-label="Ejemplos de mates personalizados">
      <div className="product-carousel__viewport" onPointerDown={handlePointerDown} onPointerUp={handlePointerUp}>
        {referenceSlides.map((slide, index) => {
          const position = positionFor(index, active, referenceSlides.length)
          return (
            <figure
              className={`product-carousel__slide product-carousel__slide--${position === 0 ? 'active' : position > 0 ? 'next' : 'previous'}`}
              key={slide.src}
              aria-hidden={position !== 0}
            >
              <img src={slide.src} alt={slide.alt} referrerPolicy="no-referrer" />
            </figure>
          )
        })}
      </div>
      <div className="product-carousel__controls">
        <button type="button" onClick={() => change(-1)} aria-label="Ver ejemplo anterior">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5-7 7 7 7M8 12h9" /></svg>
        </button>
        <div className="product-carousel__progress" aria-hidden="true">
          {referenceSlides.map((slide, index) => <span key={slide.src} className={index === active ? 'is-active' : ''} />)}
        </div>
        <button type="button" onClick={() => change(1)} aria-label="Ver ejemplo siguiente">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 5 7 7-7 7M16 12H7" /></svg>
        </button>
      </div>
    </section>
  )
}
