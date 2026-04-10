import logoImg from '@/assets/alhamra-logo.jpg';

interface AlhamraLogoProps {
  size?: number;
  variant?: 'light' | 'dark';
  showText?: boolean;
}

const AlhamraLogo = ({ size = 36 }: AlhamraLogoProps) => {
  return (
    <div className="flex items-center">
      <img
        src={logoImg}
        alt="Al Hamra Logo"
        style={{ height: size }}
        className="object-contain"
      />
    </div>
  );
};

export default AlhamraLogo;
