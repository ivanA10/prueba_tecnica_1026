import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useLoginMutation } from '@/api/auth';
import { ErrorMessage } from '@/components/shared';
import { useAppDispatch } from '@/store/hooks';
import { setSession } from '@/store/session';
import { notify } from '@/store/notifications';

export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});
type LoginValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [login, { isLoading, error }] = useLoginMutation();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginValues) {
    try {
      const res = await login(values).unwrap();
      dispatch(setSession({ accessToken: res.accessToken }));
      dispatch(notify('success', 'Sesión iniciada'));
      navigate('/');
    } catch {
      /* el error se muestra via ErrorMessage */
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        padding: 'var(--space-6)',
        boxSizing: 'border-box',
        background: 'radial-gradient(ellipse 60% 50% at 20% 30%, var(--color-neutral-800), var(--color-bg))',
      }}
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        style={{
          width: '100%',
          maxWidth: 320,
          marginLeft: 'clamp(0px, 12vw, 200px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div style={{ width: 24, height: 2, background: 'var(--color-accent)' }} />
          <h1 style={{ margin: 0, fontWeight: 500, fontSize: 28, letterSpacing: '-0.01em' }}>Iniciar sesión</h1>
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            className="input"
            id="email"
            type="email"
            placeholder="tu@empresa.com"
            autoComplete="email"
            aria-invalid={!!errors.email}
            {...register('email')}
          />
          {errors.email && <span className="field-error">{errors.email.message}</span>}
        </div>
        <div className="field">
          <label htmlFor="password">Contraseña</label>
          <input
            className="input"
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            {...register('password')}
          />
          {errors.password && <span className="field-error">{errors.password.message}</span>}
        </div>
        {error && <ErrorMessage error={error} />}
        <button type="submit" className="btn btn-primary btn-block" disabled={isLoading}>
          {isLoading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
