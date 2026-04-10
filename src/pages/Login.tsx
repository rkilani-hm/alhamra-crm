import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import AlhamraLogo from '@/components/AlhamraLogo';

const RED   = '#CD1719';
const BLACK = '#1D1D1B';
const LIGHT = '#EDEDED';

const schema = z.object({
  email:    z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});
type FormData = z.infer<typeof schema>;

const Login = () => {
  const navigate   = useNavigate();
  const { user, profile, loading } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  // Already authenticated → redirect
  useEffect(() => {
    if (!loading && user && profile) {
      const dest = profile.role === 'department' ? '/tasks'
                 : profile.role === 'manager'    ? '/admin'
                 : '/cases/new';
      navigate(dest, { replace: true });
    }
  }, [loading, user, profile, navigate]);

  const onSubmit = async ({ email, password }: FormData) => {
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error(error.message);
      setSubmitting(false);
    }
    // Navigation handled by useEffect above
  };

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center" style={{ background: LIGHT }}>
      <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-t-transparent" style={{ borderColor: `${RED} transparent ${RED} ${RED}` }} />
    </div>
  );

  return (
    <div className="flex min-h-screen" style={{ background: LIGHT, fontFamily: 'Nunito, Century Gothic, sans-serif' }}>

      {/* ── Left: Brand panel ────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[45%] flex-col justify-between relative overflow-hidden"
        style={{ background: BLACK }}
      >
        {/* Red accent bar at top */}
        <div className="absolute top-0 left-0 right-0 h-1" style={{ background: RED }} />

        {/* Decorative tower watermark */}
        <svg
          className="absolute right-[-8%] top-[8%] pointer-events-none select-none"
          width="460" height="820"
          viewBox="0 0 26 50" fill="white" opacity="0.03"
        >
          <path d="M13 0 L13.8 5 L12.2 5 Z" />
          <path d="M10 5 L16 5 L17 10 L17 48 L9 48 L9 10 Z" />
        </svg>

        {/* Diagonal red stripe accent */}
        <div className="absolute bottom-0 left-0 right-0 h-32 overflow-hidden" style={{ opacity: 0.06 }}>
          <div className="absolute inset-0" style={{ background: `repeating-linear-gradient(45deg, ${RED} 0, ${RED} 1px, transparent 0, transparent 50%)`, backgroundSize: '12px 12px' }} />
        </div>

        {/* Content */}
        <div className="relative z-10 p-12 pt-14">
          <AlhamraLogo size={42} variant="light" showText />
        </div>

        <div className="relative z-10 px-12 pb-4">
          <div className="w-8 h-1 mb-6 rounded" style={{ background: RED }} />
          <h2 style={{
            fontFamily: 'Nunito, Century Gothic, sans-serif',
            fontSize: '2.4rem',
            fontWeight: 800,
            color: 'rgba(255,255,255,0.92)',
            lineHeight: 1.15,
            marginBottom: '1.25rem',
            letterSpacing: '-0.01em',
          }}>
            Client Management<br />
            <span style={{ color: RED }}>Excellence.</span>
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.38)', lineHeight: 1.75 }}>
            Al Hamra Real Estate — Kuwait's most iconic business address. 
            Managing every client interaction with precision.
          </p>
        </div>

        <div className="relative z-10 flex gap-8 px-12 pb-12">
          {[['Front Desk','Instant capture'],['Leasing','SAP-synced'],['Operations','Task routing']].map(([l, d]) => (
            <div key={l}>
              <p className="text-xs font-bold mb-1 uppercase tracking-wider" style={{ color: RED }}>{l}</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{d}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right: Login form ─────────────────────────────── */}
      <div className="flex flex-1 items-center justify-center p-8" style={{ background: '#fff' }}>
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="mb-8 lg:hidden">
            <AlhamraLogo size={38} variant="dark" showText />
          </div>

          {/* Red accent line */}
          <div className="w-10 h-1 mb-6 rounded" style={{ background: RED }} />

          <div className="mb-8">
            <h1 style={{
              fontFamily: 'Nunito, Century Gothic, sans-serif',
              fontWeight: 800,
              fontSize: '1.875rem',
              color: BLACK,
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
            }}>
              Welcome back
            </h1>
            <p className="mt-2 text-sm" style={{ color: '#B2B2B2' }}>
              Sign in to Al Hamra CRM
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-1.5">
              <Label style={{ fontWeight: 600, fontSize: '0.8rem', color: BLACK, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Email Address
              </Label>
              <Input
                type="email"
                autoComplete="email"
                autoFocus
                placeholder="you@alhamra.com.kw"
                className="h-12 rounded-lg border-2 text-sm transition-colors"
                style={{ borderColor: '#EDEDED', background: '#FAFAFA' }}
                onFocus={e => (e.target.style.borderColor = RED)}
                onBlur={e => (e.target.style.borderColor = '#EDEDED')}
                {...register('email')}
              />
              {errors.email && <p className="text-xs" style={{ color: RED }}>{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label style={{ fontWeight: 600, fontSize: '0.8rem', color: BLACK, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Password
              </Label>
              <Input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                className="h-12 rounded-lg border-2 text-sm transition-colors"
                style={{ borderColor: '#EDEDED', background: '#FAFAFA' }}
                onFocus={e => (e.target.style.borderColor = RED)}
                onBlur={e => (e.target.style.borderColor = '#EDEDED')}
                {...register('password')}
              />
              {errors.password && <p className="text-xs" style={{ color: RED }}>{errors.password.message}</p>}
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-12 font-bold text-sm rounded-lg tracking-wide transition-all"
              style={{ background: submitting ? '#B2B2B2' : RED, color: '#fff', border: 'none', letterSpacing: '0.05em' }}
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  SIGNING IN…
                </span>
              ) : 'SIGN IN →'}
            </Button>
          </form>

          <p className="mt-8 text-center text-xs" style={{ color: '#B2B2B2' }}>
            Contact your administrator to create an account
          </p>

          {/* Brand footer */}
          <div className="mt-12 pt-6 border-t flex items-center justify-center gap-2" style={{ borderColor: '#EDEDED' }}>
            <div className="w-4 h-px" style={{ background: RED }} />
            <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: '#B2B2B2' }}>
              Al Hamra Real Estate
            </p>
            <div className="w-4 h-px" style={{ background: RED }} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
