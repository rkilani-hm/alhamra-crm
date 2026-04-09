import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import AlhamraLogo from '@/components/AlhamraLogo';

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});
type FormData = z.infer<typeof schema>;

const Login = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async ({ email, password }: FormData) => {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single();

    navigate(profile?.role === 'department' ? '/tasks' : '/cases/new');
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-[45%] flex-col justify-between sidebar-texture bg-[hsl(var(--brand-navy))] p-10 relative overflow-hidden">
        {/* Decorative tower SVG background */}
        <svg
          className="absolute right-[-20%] top-[10%] opacity-[0.04]"
          width="500"
          height="900"
          viewBox="0 0 24 56"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M12 0 L12.8 4 L11.2 4 Z" fill="white" />
          <path d="M9 4 L15 4 L16 8 L16 52 L15.5 54 L14 56 L10 56 L8.5 54 L8 52 L8 8 Z" fill="white" />
          <path d="M8 14 L8 42 L11 42 L11 38 L10 36 L10 20 L11 18 L11 14 Z" fill="hsl(213, 58%, 9%)" opacity="0.85" />
        </svg>

        <div className="relative z-10">
          <AlhamraLogo size={44} variant="light" showText />
        </div>

        <div className="relative z-10 max-w-md">
          <h2 className="font-serif text-3xl font-light text-white leading-tight mb-4">
            Elevating every{' '}
            <em className="text-brand-bronze font-medium not-italic" style={{ fontStyle: 'italic' }}>
              client interaction.
            </em>
          </h2>
          <p className="text-sm text-[hsl(213_20%_65%)] leading-relaxed">
            A unified platform for front desk operations, leasing management, and cross-department task routing — purpose-built for Al Hamra Business Tower.
          </p>
        </div>

        <div className="relative z-10 grid grid-cols-3 gap-4 text-[11px]">
          {[
            { title: 'Front Desk', desc: 'Instant inquiry capture' },
            { title: 'Leasing', desc: 'SAP-synced client data' },
            { title: 'Operations', desc: 'Task routing & follow-up' },
          ].map(item => (
            <div key={item.title}>
              <p className="text-brand-bronze font-semibold mb-0.5">{item.title}</p>
              <p className="text-[hsl(213_20%_55%)]">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right login panel */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-4">
            <AlhamraLogo size={40} variant="dark" showText />
          </div>

          <div className="text-center lg:text-left">
            <h1 className="font-serif text-[2rem] font-semibold tracking-tight">Welcome back</h1>
            <p className="mt-1 text-sm text-muted-foreground">Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" autoFocus className="h-11" {...register('email')} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" className="h-11" {...register('password')} />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>

            <Button type="submit" className="w-full h-11 bg-primary text-primary-foreground" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground">
            Contact your system administrator to create an account
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
