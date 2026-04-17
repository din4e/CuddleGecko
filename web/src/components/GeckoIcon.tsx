export default function GeckoIcon({ className = '', size = 32 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Body */}
      <ellipse cx="32" cy="36" rx="16" ry="18" fill="#4ade80" />
      {/* Head */}
      <ellipse cx="32" cy="18" rx="12" ry="10" fill="#4ade80" />
      {/* Eyes */}
      <circle cx="27" cy="16" r="3" fill="white" />
      <circle cx="37" cy="16" r="3" fill="white" />
      <circle cx="28" cy="15.5" r="1.5" fill="#1e293b" />
      <circle cx="38" cy="15.5" r="1.5" fill="#1e293b" />
      {/* Smile */}
      <path d="M28 21 Q32 24 36 21" stroke="#166534" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      {/* Belly spots */}
      <ellipse cx="30" cy="34" rx="4" ry="5" fill="#86efac" opacity="0.6" />
      <ellipse cx="36" cy="40" rx="3" ry="4" fill="#86efac" opacity="0.6" />
      {/* Front left leg */}
      <path d="M18 30 L10 28 L8 24" stroke="#4ade80" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="8" cy="24" r="2" fill="#4ade80" />
      {/* Front right leg */}
      <path d="M18 38 L10 40 L8 44" stroke="#4ade80" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="8" cy="44" r="2" fill="#4ade80" />
      {/* Back right leg */}
      <path d="M46 30 L54 28 L56 24" stroke="#4ade80" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="56" cy="24" r="2" fill="#4ade80" />
      {/* Back left leg */}
      <path d="M46 38 L54 40 L56 44" stroke="#4ade80" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="56" cy="44" r="2" fill="#4ade80" />
      {/* Tail */}
      <path d="M32 54 Q28 60 22 58 Q16 56 14 50" stroke="#4ade80" strokeWidth="4" strokeLinecap="round" fill="none" />
    </svg>
  )
}
