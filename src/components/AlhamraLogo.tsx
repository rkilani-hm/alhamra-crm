interface AlhamraLogoProps {
  size?: number;
  variant?: 'light' | 'dark';
  showText?: boolean;
}

const AlhamraLogo = ({ size = 36, variant = 'light', showText = true }: AlhamraLogoProps) => {
  const towerColor = variant === 'light' ? '#ffffff' : 'hsl(213, 60%, 22%)';
  const textColor = variant === 'light' ? '#ffffff' : 'hsl(213, 60%, 22%)';
  const bronzeColor = 'hsl(38, 55%, 62%)';

  return (
    <div className="flex items-center gap-2.5">
      <svg
        width={size * 0.45}
        height={size}
        viewBox="0 0 24 56"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Bronze spire tip */}
        <path d="M12 0 L12.8 4 L11.2 4 Z" fill={bronzeColor} />
        {/* Tower body — tall narrow with carved void on left */}
        <path
          d="M9 4 L15 4 L16 8 L16 52 L15.5 54 L14 56 L10 56 L8.5 54 L8 52 L8 8 Z"
          fill={towerColor}
        />
        {/* Carved void on left side (iconic south-face removal) */}
        <path
          d="M8 14 L8 42 L11 42 L11 38 L10 36 L10 20 L11 18 L11 14 Z"
          fill={variant === 'light' ? 'hsl(213, 58%, 9%)' : 'hsl(40, 18%, 97%)'}
          opacity="0.85"
        />
        {/* Window details */}
        <rect x="13" y="12" width="1.5" height="2" rx="0.3" fill={bronzeColor} opacity="0.5" />
        <rect x="13" y="18" width="1.5" height="2" rx="0.3" fill={bronzeColor} opacity="0.5" />
        <rect x="13" y="24" width="1.5" height="2" rx="0.3" fill={bronzeColor} opacity="0.5" />
        <rect x="13" y="30" width="1.5" height="2" rx="0.3" fill={bronzeColor} opacity="0.5" />
        <rect x="13" y="36" width="1.5" height="2" rx="0.3" fill={bronzeColor} opacity="0.5" />
        <rect x="13" y="42" width="1.5" height="2" rx="0.3" fill={bronzeColor} opacity="0.5" />
      </svg>

      {showText && (
        <div className="flex flex-col leading-none">
          <span
            className="font-serif text-sm font-semibold uppercase tracking-[0.15em]"
            style={{ color: textColor }}
          >
            Al Hamra
          </span>
          <span
            className="text-[9px] font-sans tracking-[0.12em] uppercase mt-0.5"
            style={{ color: bronzeColor }}
          >
            Real Estate
          </span>
        </div>
      )}
    </div>
  );
};

export default AlhamraLogo;
