import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import AlhamraLogo from '@/components/AlhamraLogo';
import { toast } from 'sonner';

/* Official Al Hamra colors */
const AH = {
  RED:   '#CD1719',
  DARK:  '#1D1D1B',
  GRAY:  '#B2B2B2',
  LIGHT: '#EDEDED',
};

const schema = z.object({
  email:    z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});
type FormData = z.infer<typeof schema>;

export default function Login() {
  const navigate  = useNavigate();
  const { user, profile, loading } = useAuth();
  const [submitting,  setSubmitting]  = useState(false);
  const [resetMode,   setResetMode]   = useState(false);
  const [resetEmail,  setResetEmail]  = useState('');
  const [resetSent,   setResetSent]   = useState(false);
  const [resetLoading,setResetLoading]= useState(false);

  const handleReset = async () => {
    if (!resetEmail) return;
    setResetLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: window.location.origin + '/login',
    });
    setResetLoading(false);
    if (error) { toast.error(error.message); return; }
    setResetSent(true);
  };

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  /* Redirect if already authenticated */
  useEffect(() => {
    if (!loading && user && profile) {
      navigate(
        profile.role === 'department' ? '/tasks'
        : profile.role === 'manager'  ? '/admin'
        : '/cases/new',
        { replace: true }
      );
    }
  }, [loading, user, profile, navigate]);

  const onSubmit = async ({ email, password }: FormData) => {
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { toast.error(error.message); setSubmitting(false); }
    // Redirect handled by useEffect above — no race condition
  };

  if (loading) return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: AH.DARK,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        border: `3px solid ${AH.RED}`, borderTopColor: 'transparent',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // ── Password reset modal ──────────────────────────────────
  if (resetMode) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F5F5' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 36, width: '100%', maxWidth: 400, boxShadow: '0 8px 40px rgba(0,0,0,0.08)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#CD1719', fontWeight: 700, marginBottom: 8 }}>
            Al Hamra Real Estate
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 300 }}>Reset password</h2>
          <p style={{ fontSize: 13, color: '#B2B2B2', marginTop: 6 }}>
            Enter your email and we'll send a reset link
          </p>
        </div>
        {resetSent ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✉️</div>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>Check your email</p>
            <p style={{ fontSize: 13, color: '#B2B2B2', lineHeight: 1.6 }}>
              A password reset link has been sent to <strong>{resetEmail}</strong>
            </p>
            <button onClick={() => { setResetMode(false); setResetSent(false); }}
              style={{ marginTop: 20, background: '#CD1719', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', cursor: 'pointer', fontWeight: 600 }}>
              Back to login
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Email address</label>
              <input type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)}
                placeholder="your@email.com" autoFocus
                style={{ width: '100%', border: '1.5px solid #E0E0E0', borderRadius: 8, padding: '10px 12px', fontSize: 14, outline: 'none' }} />
            </div>
            <button onClick={handleReset} disabled={resetLoading || !resetEmail}
              style={{ background: '#CD1719', color: '#fff', border: 'none', borderRadius: 8, padding: '12px', fontWeight: 600, cursor: resetLoading ? 'not-allowed' : 'pointer', opacity: resetLoading || !resetEmail ? 0.6 : 1 }}>
              {resetLoading ? 'Sending…' : 'Send reset link'}
            </button>
            <button onClick={() => setResetMode(false)} style={{ background: 'none', border: '1.5px solid #E0E0E0', borderRadius: 8, padding: '10px', cursor: 'pointer', fontSize: 13, color: '#555' }}>
              Back to login
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={{
      display: 'flex', minHeight: '100vh',
      fontFamily: "'Josefin Sans','Century Gothic','Gill Sans MT',sans-serif",
    }}>

      {/* ══════════════ LEFT — Brand Panel ══════════════════ */}
      <div style={{
        display: 'none',
        background: AH.DARK,
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '48px 52px',
        position: 'relative',
        overflow: 'hidden',
        flex: '0 0 44%',
      }}
        className="lg:flex"
      >
        {/* Red top accent strip */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          height: 4, background: AH.RED,
        }} />

        {/* Decorative tower watermark */}
        <svg
          style={{
            position: 'absolute', right: '-12%', bottom: '-4%',
            opacity: 0.05, pointerEvents: 'none', userSelect: 'none',
          }}
          width="460" height="720" viewBox="0 0 24 48" fill="white"
        >
          <polygon points="12,0 13,4 11,4" />
          <path d="M7.5 4 L16.5 4 L17.5 8 L17.5 47 L6.5 47 L6.5 8 Z" />
          <rect x="5" y="44" width="14" height="3" rx="1" />
        </svg>

        {/* Logo */}
        <AlhamraLogo size={44} variant="light" showText />

        {/* Headline */}
        <div>
          <p style={{
            fontSize: 38, fontWeight: 700, color: AH.LIGHT,
            letterSpacing: '0.04em', textTransform: 'uppercase',
            lineHeight: 1.15, margin: 0,
          }}>
            Elevating<br />
            Every{' '}
            <span style={{ color: AH.RED }}>Client</span><br />
            Interaction.
          </p>
          <p style={{
            fontSize: 13, color: `${AH.GRAY}99`, letterSpacing: '0.06em',
            lineHeight: 1.7, marginTop: 20, maxWidth: 340,
          }}>
            The Al Hamra CRM unifies front desk, leasing, and operations —
            built for Kuwait's most iconic business address.
          </p>

          {/* Feature pills */}
          <div style={{ display: 'flex', gap: 12, marginTop: 32, flexWrap: 'wrap' }}>
            {['Front Desk', 'Leasing', 'Operations', 'WhatsApp'].map(f => (
              <span key={f} style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.18em',
                textTransform: 'uppercase', color: AH.GRAY,
                border: `1px solid ${AH.GRAY}30`, borderRadius: 4, padding: '5px 10px',
              }}>
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* Bottom brand line */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 28, height: 1, background: AH.RED }} />
          <p style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.22em',
            textTransform: 'uppercase', color: `${AH.GRAY}70`, margin: 0,
          }}>
            Al Hamra Business Tower — Kuwait
          </p>
        </div>
      </div>

      {/* ══════════════ RIGHT — Login Form ══════════════════ */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 32px', background: AH.LIGHT,
      }}>
        <div style={{ width: '100%', maxWidth: 380 }}>

          {/* Mobile logo */}
          <div className="mb-8 lg:hidden">
            <AlhamraLogo size={38} variant="dark" showText />
          </div>

          {/* Form header */}
          <div style={{ marginBottom: 32 }}>
            <div style={{
              width: 32, height: 3, background: AH.RED,
              marginBottom: 20, borderRadius: 2,
            }} />
            <h1 style={{
              margin: 0, fontSize: 28, fontWeight: 700,
              color: AH.DARK, letterSpacing: '0.06em',
              textTransform: 'uppercase', lineHeight: 1.2,
            }}>
              Welcome Back
            </h1>
            <p style={{
              margin: '8px 0 0', fontSize: 12, color: AH.GRAY,
              letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
              Sign in to your workspace
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Email */}
            <div>
              <label style={{
                display: 'block', fontSize: 9, fontWeight: 700,
                letterSpacing: '0.18em', textTransform: 'uppercase',
                color: AH.DARK, marginBottom: 8,
              }}>
                Email Address
              </label>
              <input
                type="email" autoComplete="email" autoFocus
                placeholder="you@alhamra.com.kw"
                {...register('email')}
                style={{
                  width: '100%', height: 48, padding: '0 16px',
                  fontSize: 13, letterSpacing: '0.02em',
                  background: '#fff',
                  border: errors.email ? `2px solid ${AH.RED}` : `1.5px solid #D0D0D0`,
                  borderRadius: 4, outline: 'none',
                  fontFamily: 'inherit', color: AH.DARK,
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e  => (e.currentTarget.style.borderColor = AH.RED)}
                onBlur={e   => (e.currentTarget.style.borderColor = errors.email ? AH.RED : '#D0D0D0')}
              />
              {errors.email && (
                <p style={{ margin: '4px 0 0', fontSize: 10, color: AH.RED, letterSpacing: '0.06em' }}>
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label style={{
                display: 'block', fontSize: 9, fontWeight: 700,
                letterSpacing: '0.18em', textTransform: 'uppercase',
                color: AH.DARK, marginBottom: 8,
              }}>
                Password
              </label>
              <input
                type="password" autoComplete="current-password"
                placeholder="••••••••"
                {...register('password')}
                style={{
                  width: '100%', height: 48, padding: '0 16px',
                  fontSize: 18, letterSpacing: '0.08em',
                  background: '#fff',
                  border: errors.password ? `2px solid ${AH.RED}` : `1.5px solid #D0D0D0`,
                  borderRadius: 4, outline: 'none',
                  fontFamily: 'inherit', color: AH.DARK,
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e  => (e.currentTarget.style.borderColor = AH.RED)}
                onBlur={e   => (e.currentTarget.style.borderColor = errors.password ? AH.RED : '#D0D0D0')}
              />
              {errors.password && (
                <p style={{ margin: '4px 0 0', fontSize: 10, color: AH.RED, letterSpacing: '0.06em' }}>
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Submit */}
            {/* Forgot password link */}
            <div style={{ textAlign: 'right', marginTop: -8 }}>
              <button type="button" onClick={() => setResetMode(true)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#B2B2B2', textDecoration: 'underline' }}>
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={submitting}
              style={{
                height: 48, marginTop: 8,
                background: submitting ? '#999' : AH.RED,
                color: '#fff', border: 'none', borderRadius: 4,
                fontSize: 11, fontWeight: 700,
                letterSpacing: '0.2em', textTransform: 'uppercase',
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { if (!submitting) (e.currentTarget.style.background = '#b01214'); }}
              onMouseLeave={e => { if (!submitting) (e.currentTarget.style.background = AH.RED); }}
            >
              {submitting ? (
                <>
                  <span style={{
                    width: 14, height: 14, borderRadius: '50%',
                    border: '2px solid rgba(255,255,255,0.4)',
                    borderTopColor: '#fff',
                    animation: 'spin 0.7s linear infinite', display: 'inline-block',
                  }} />
                  Signing In…
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </>
              ) : 'Sign In →'}
            </button>
          </form>

          <p style={{
            marginTop: 24, textAlign: 'center',
            fontSize: 10, color: AH.GRAY, letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            Contact your administrator to create an account
          </p>
        </div>
      </div>
    </div>
  );
}
