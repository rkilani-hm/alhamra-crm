/**
 * Al Hamra Real Estate — Logo Mark
 * Official brand: #CD1719 red · #1D1D1B dark · Century Gothic / Josefin Sans
 */
interface Props {
  size?:     number;
  variant?:  'light' | 'dark';
  showText?: boolean;
  className?: string;
}

const AlhamraLogo = ({ size = 40, variant = 'light', showText = true, className = '' }: Props) => {
  const isLight = variant === 'light';
  const bodyFill = isLight ? '#FFFFFF' : '#1D1D1B';
  const voidFill = isLight ? '#1D1D1B' : '#EDEDED';
  const textCol  = isLight ? '#FFFFFF' : '#1D1D1B';
  const subCol   = isLight ? 'rgba(255,255,255,0.52)' : '#B2B2B2';
  const RED      = '#CD1719';

  return (
    <div
      className={`flex items-center gap-2.5 select-none ${className}`}
      style={{ fontFamily: "'Josefin Sans','Century Gothic','Gill Sans MT',sans-serif" }}
    >
      {/* Tower mark */}
      <svg width={Math.round(size * 0.5)} height={size} viewBox="0 0 24 48" fill="none">
        {/* Spire */}
        <polygon points="12,0 13,4 11,4" fill={RED} />
        {/* Body */}
        <path d="M7.5 4 L16.5 4 L17.5 8 L17.5 47 L6.5 47 L6.5 8 Z" fill={bodyFill} />
        {/* Signature carved void — south face */}
        <path d="M6.5 13 L6.5 41 L10.5 41 L10.5 36 L9.5 33 L9.5 20 L10.5 17 L10.5 13 Z"
          fill={voidFill} opacity={0.72} />
        {/* Base bar */}
        <rect x="5" y="44" width="14" height="3" rx="1" fill={RED} opacity={0.95} />
        {/* Window accents */}
        {[12, 18, 24, 30, 36].map(y => (
          <rect key={y} x="13.5" y={y} width="2" height="1.5" rx="0.4" fill={RED} opacity={0.45} />
        ))}
      </svg>

      {showText && (
        <div style={{ lineHeight: 1.15 }}>
          <p style={{
            margin: 0, fontSize: size * 0.275, fontWeight: 700,
            letterSpacing: '0.15em', textTransform: 'uppercase', color: textCol,
          }}>
            Al Hamra
          </p>
          <p style={{
            margin: 0, fontSize: size * 0.13, fontWeight: 300,
            letterSpacing: '0.25em', textTransform: 'uppercase', color: subCol, marginTop: 2,
          }}>
            Real Estate
          </p>
        </div>
      )}
    </div>
  );
};

export default AlhamraLogo;
