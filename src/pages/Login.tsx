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

const schema = z.object({
  email:    z.string().email('Invalid email'),
  password: z.string().min(1, 'Password required'),
});
type FormData = z.infer<typeof schema>;

const Login = () => {
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  // If already authenticated, redirect immediately — no login screen shown
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
      return;
    }
    // Safety: reset submitting after 5s if redirect hasn't happened
    setTimeout(() => setSubmitting(false), 5000);
    // The useEffect above will fire once profile loads via onAuthStateChange
  };

  // Don't render login form while auth is still initialising
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">

      {/* ── Left brand panel ─────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[45%] flex-col justify-between p-12 sidebar-texture relative overflow-hidden"
        style={{ background: 'hsl(var(--brand-navy))' }}
      >
        {/* Decorative tower watermark */}
        <svg className="absolute right-[-10%] top-[5%] opacity-[0.04] pointer-events-none"
          width="480" height="860" viewBox="0 0 24 56" fill="white">
          <path d="M12 0 L12.8 4 L11.2 4 Z" />
          <path d="M9 4 L15 4 L16 8 L16 52 L15.5 54 L14 56 L10 56 L8.5 54 L8 52 L8 8 Z" />
        </svg>

        <AlhamraLogo size={40} variant="light" showText />

        <div>
          <h2 style={{
            fontFamily: 'Cormorant Garamond, serif',
            fontSize: '2.6rem', fontWeight: 400,
            color: 'rgba(255,255,255,0.92)', lineHeight: 1.2, marginBottom: '1rem',
          }}>
            Elevating every<br />
            <em style={{ color: 'hsl(var(--brand-bronze))' }}>client interaction.</em>
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.42)', lineHeight: 1.7 }}>
            The Al Hamra CRM unifies your front desk, leasing, and operations — built for Kuwait's most iconic business address.
          </p>
        </div>

        <div className="flex gap-8">
          {[['Front Desk','Instant inquiry capture'],['Leasing','SAP-synced tenant data'],['Operations','Task routing & follow-up']].map(([label, desc]) => (
            <div key={label}>
              <p className="text-xs font-semibold mb-1" style={{ color: 'hsl(var(--brand-bronze))' }}>{label}</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right form panel ─────────────────────────────────── */}
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="mb-8 lg:hidden">
            <AlhamraLogo size={36} variant="dark" showText />
          </div>

          <div className="mb-8">
            <h1 style={{ fontFamily: 'Cormorant Garamond, serif', fontWeight: 500, fontSize: '2rem' }}
              className="text-foreground leading-tight">
              Welcome back
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">Sign in to your workspace</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Email address</Label>
              <Input type="email" autoComplete="email" autoFocus
                placeholder="you@alhamra.com.kw" className="h-11"
                {...register('email')} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Password</Label>
              <Input type="password" autoComplete="current-password"
                placeholder="••••••••" className="h-11"
                {...register('password')} />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>

            <Button
              type="submit"
              className="w-full h-11 font-medium text-white"
              style={{ background: 'hsl(var(--brand-navy))' }}
              disabled={submitting}
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Signing in…
                </span>
              ) : 'Sign in →'}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Contact your administrator to create an account
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
