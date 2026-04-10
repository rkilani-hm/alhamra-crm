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

const AH = { red: '#CD1719', dark: '#1D1D1B', gray: '#B2B2B2', light: '#EDEDED' };

const schema = z.object({
  email:    z.string().email('Invalid email'),
  password: z.string().min(1, 'Password required'),
});
type FormData = z.infer<typeof schema>;

const Login = () => {
  const navigate  = useNavigate();
  const { user, profile, loading } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  // Already logged in — redirect by role
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
    if (error) { toast.error(error.message); setSubmitting(false); }
    // Navigation handled by useEffect above
  };

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center" style={{ background: AH.light }}>
      <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-t-transparent" style={{ borderColor: AH.red }} />
    </div>
  );

  return (
    <div className="flex min-h-screen" style={{ background: AH.light }}>

      {/* ── Left — brand panel ─────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[45%] flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: AH.dark }}
      >
        {/* Large decorative tower watermark */}
        <svg
          className="absolute right-[-8%] bottom-[-5%] pointer-events-none select-none"
          width="440" height="700" viewBox="0 0 28 50" fill="none" opacity="0.06"
        >
          <path d="M14 0 L14.8 4 L13.2 4 Z" fill="white" />
          <path d="M9 4 L19 4 L20 9 L20 48 L8 48 L8 9 Z" fill="white" />
          <rect x="6" y="45" width="16" height="3" rx="1" fill="white" />
        </svg>

        {/* Red top accent bar */}
        <div className="absolute top-0 left-0 right-0 h-1" style={{ background: AH.red }} />

        <AlhamraLogo size={42} variant="light" showText />

        <div>
          {/* Large headline in official style */}
          <div style={{ marginBottom: '1.5rem' }}>
            <p style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
              color: AH.red,
              marginBottom: '0.75rem',
            }}>
              Client Management System
            </p>
            <h2 style={{
              fontSize: '2.4rem',
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: '#FFFFFF',
              lineHeight: 1.15,
            }}>
              Al Hamra<br />
              <span style={{ color: AH.red }}>Business Tower</span>
            </h2>
          </div>
          <p style={{
            fontSize: '0.85rem',
            color: AH.gray,
            lineHeight: 1.75,
            maxWidth: '340px',
            fontWeight: 300,
            letterSpacing: '0.02em',
          }}>
            The Al Hamra CRM connects your front desk, leasing team, and operations — Kuwait's most iconic business address, managed seamlessly.
          </p>
        </div>

        {/* Bottom feature labels */}
        <div className="flex gap-8">
          {[['Front Desk','Instant inquiry capture'],['Leasing','SAP-synced data'],['Operations','Task routing']].map(([lbl, desc]) => (
            <div key={lbl}>
              <p style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: AH.red, marginBottom: 4 }}>
                {lbl}
              </p>
              <p style={{ fontSize: '0.7rem', color: AH.gray, letterSpacing: '0.04em' }}>{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right — login form ─────────────────────────────── */}
      <div className="flex flex-1 items-center justify-center p-8" style={{ background: AH.light }}>
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="mb-8 lg:hidden">
            <AlhamraLogo size={38} variant="dark" showText />
          </div>

          {/* Red top accent */}
          <div className="mb-6 h-1 w-12 rounded" style={{ background: AH.red }} />

          <div className="mb-8">
            <p style={{
              fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.22em',
              textTransform: 'uppercase', color: AH.red, marginBottom: 6,
            }}>
              Welcome Back
            </p>
            <h1 style={{
              fontSize: '1.8rem', fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase', color: AH.dark, lineHeight: 1.1,
            }}>
              Sign In
            </h1>
            <p style={{ fontSize: '0.8rem', color: AH.gray, marginTop: 6, letterSpacing: '0.03em' }}>
              Enter your credentials to access the system
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-1.5">
              <Label style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: AH.dark }}>
                Email Address
              </Label>
              <Input
                type="email" autoComplete="email" autoFocus
                placeholder="you@alhamra.com.kw"
                className="h-11 text-sm"
                style={{ background: '#fff', borderColor: '#D5D5D5' }}
                {...register('email')}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: AH.dark }}>
                Password
              </Label>
              <Input
                type="password" autoComplete="current-password"
                placeholder="••••••••"
                className="h-11 text-sm"
                style={{ background: '#fff', borderColor: '#D5D5D5' }}
                {...register('password')}
              />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-12 font-bold uppercase tracking-widest text-white transition-all hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: AH.red, letterSpacing: '0.18em', fontSize: '0.72rem', borderRadius: 6 }}
            >
              {submitting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Signing in…
                </>
              ) : 'Sign In →'}
            </button>
          </form>

          <p className="mt-6 text-center text-[11px] tracking-wide" style={{ color: AH.gray }}>
            Contact your system administrator to create an account
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
