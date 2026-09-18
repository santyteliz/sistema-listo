import { Navbar } from './Navbar'
import { Hero } from './Hero'
import './Landing.css'

interface LandingProps {
  onCreateMate: () => void
}

export function Landing({ onCreateMate }: LandingProps) {
  return (
    <div className="landing">
      <Navbar />
      <Hero onCreateMate={onCreateMate} />
    </div>
  )
}
