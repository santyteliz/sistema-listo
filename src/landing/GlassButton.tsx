interface GlassButtonProps {
  label: string
  onClick: () => void
  disabled?: boolean
}

export function GlassButton({ label, onClick, disabled = false }: GlassButtonProps) {
  return (
    <button type="button" className="glass-btn" onClick={onClick} disabled={disabled}>
      <span className="glass-btn__label">{label}</span>
      <svg className="glass-btn__arrow" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M3 9H14M10 4L15 9L10 14" /></svg>
    </button>
  )
}
