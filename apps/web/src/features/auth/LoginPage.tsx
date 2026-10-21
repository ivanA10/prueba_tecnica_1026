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
  email: z.string().email('Email invalido'),
  password: z.string().min(1, 'La contrasena es obligatoria'),
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
      dispatch(notify('success', 'Sesion iniciada'));
      navigate('/users');
    } catch {
      /* el error se muestra via ErrorMessage */
    }
  }

  return (
    <main>
      <h1>Iniciar sesion</h1>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <label>
          Email
          <input type="email" {...register('email')} aria-invalid={!!errors.email} />
        </label>
        {errors.email && <span className="field-error">{errors.email.message}</span>}
        <label>
          Contrasena
          <input type="password" {...register('password')} aria-invalid={!!errors.password} />
        </label>
        {errors.password && <span className="field-error">{errors.password.message}</span>}
        {error && <ErrorMessage error={error} />}
        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
