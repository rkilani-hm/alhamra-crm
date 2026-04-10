/**
 * Al Hamra Real Estate — Official Logo Component
 * Colors: #CD1719 (red), #1D1D1B (dark), #EDEDED (light)
 * Font:   Josefin Sans / Century Gothic
 */
interface Props {
  size?: number;
  variant?: 'light' | 'dark';
  showText?: boolean;
  className?: string;
}

const AlhamraLogo = ({ size = 40, variant = 'light', showText = true, className = '' }: Props) => {
  const towerFill  = variant === 'light' ? '#FFFFFF' : '#1D1D1B';
  const voidFill   = variant === 'light' ? '#1D1D1B' : '#EDEDED';
  const textColor  = variant === 'light' ? '#FFFFFF' : '#1D1D1B';
  const red        = '#CD1719';

  return (
    <div className={`flex items-center gap-2.5 ${className}`} style={{ fontFamily: "'Josefin Sans', 'Century Gothic', sans-serif" }}>
      {/* Al Hamra Tower silhouette */}
      <svg width={Math.round(size * 0.55)} height={size} viewBox="0 0 28 50" fill="none">
        {/* Red spire tip */}
        <path d="M14 0 L14.8 4 L13.2 4 Z" fill={red} />
        {/* Tower body — carved skyscraper form */}
        <path d="M9 4 L19 4 L20 9 L20 48 L8 48 L8 9 Z" fill={towerFill} />
        {/* Carved void — south-face removal (the iconic Al Hamra design) */}
        <path d="M8 15 L8 42 L12.5 42 L12.5 36 L11.5 33 L11.5 20 L12.5 17 L12.5 15 Z" fill={voidFill} opacity="0.7" />
        {/* Red accent band at base */}
        <rect x="6" y="45" width="16" height="3" rx="1" fill={red} opacity="0.9" />
        {/* Subtle window details */}
        <rect x="15" y="12" width="2" height="1.5" rx="0.3" fill={red} opacity="0.6" />
        <rect x="15" y="18" width="2" height="1.5" rx="0.3" fill={red} opacity="0.6" />
        <rect x="15" y="24" width="2" height="1.5" rx="0.3" fill={red} opacity="0.6" />
        <rect x="15" y="30" width="2" height="1.5" rx="0.3" fill={red} opacity="0.6" />
        <rect x="15" y="36" width="2" height="1.5" rx="0.3" fill={red} opacity="0.6" />
      </svg>

      {showText && (
        <div style={{ lineHeight: 1.1 }}>
          <p style={{
            fontSize: size * 0.28,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: textColor,
          }}>
            Al Hamra
          </p>
          <p style={{
            fontSize: size * 0.14,
            fontWeight: 300,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: variant === 'light' ? 'rgba(255,255,255,0.65)' : '#B2B2B2',
            marginTop: 2,
          }}>
            Real Estate
          </p>
        </div>
      )}
    </div>
  );
};

export default AlhamraLogo;
