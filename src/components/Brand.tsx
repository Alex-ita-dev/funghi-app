export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <svg
        className="brand-icon"
        viewBox="0 0 48 48"
        fill="none"
        aria-hidden="true"
      >
        <rect width="48" height="48" rx="15" fill="currentColor" />
        <path d="M11 26c0-9 6-15 13-15s13 6 13 15H11Z" fill="#f6f1e5" />
        <path
          d="m21 26-2 11h10l-2-11"
          stroke="#f6f1e5"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <circle cx="20" cy="19" r="2" fill="#cc753e" />
        <circle cx="28" cy="22" r="2.5" fill="#cc753e" />
      </svg>
      {!compact && (
        <span>
          Myco<span className="brand-light">Trail</span>
          <small>IL BOSCO, A MODO TUO.</small>
        </span>
      )}
    </div>
  );
}
