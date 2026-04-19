import { FormEvent, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { AuthShell } from '../components/auth-shell';
import { getAuthErrorMessage } from '../lib/auth-error-message';
import { useAuth } from '../providers/auth-provider';

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const redirectTo = useMemo(
    () => ((location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/'),
    [location.state],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      await signIn(email, password);
      setMessage('Login realizado com sucesso.');
      navigate(redirectTo, { replace: true });
    } catch (submitError) {
      setError(getAuthErrorMessage(submitError, 'Nao foi possivel concluir a autenticacao.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Acesse sua operacao"
      description="Entre com email e senha para abrir o painel da lanchonete."
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="voce@lanchonete.com"
            required
          />
        </label>

        <label>
          Senha
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Digite sua senha"
            required
          />
        </label>

        <button className="primary-button" disabled={submitting} type="submit">
          {submitting ? 'Entrando...' : 'Entrar na operacao'}
        </button>
      </form>

      <p className="auth-helper">
        Ainda nao tem conta? <Link to="/register">Criar cadastro</Link>
      </p>

      {message && <p className="feedback feedback--success">{message}</p>}
      {error && <p className="feedback feedback--error">{error}</p>}
    </AuthShell>
  );
}
