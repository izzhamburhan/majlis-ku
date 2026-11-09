/** Bunga cengkih: the eight-point clove flower. The venue Photobook's ornament; the eye is the Stori ground. */
export function Bunga({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <g fill="currentColor">
        <path d="M32 2 38 26 62 32 38 38 32 62 26 38 2 32 26 26Z" opacity=".9" />
        <path d="M32 12 35.5 28.5 52 32 35.5 35.5 32 52 28.5 35.5 12 32 28.5 28.5Z" transform="rotate(45 32 32)" opacity=".55" />
      </g>
      <circle cx="32" cy="32" r="4.5" fill="var(--color-cream)" />
    </svg>
  );
}