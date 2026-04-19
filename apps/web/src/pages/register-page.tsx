import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { AuthShell } from '../components/auth-shell';
import { getAuthErrorMessage } from '../lib/auth-error-message';
import { useAuth } from '../providers/auth-provider';

export function RegisterPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await signUp({
        fullName,
        email,
        phone: phone || undefined,
        password,
      });

      if (response.requiresEmailConfirmation) {
        setMessage('Cadastro criado. Confirme seu email para liberar o primeiro acesso.');
      } else {
        navigate('/', { replace: true });
      }
    } catch (submitError) {
      setError(getAuthErrorMessage(submitError, 'Nao foi possivel concluir o cadastro.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Crie o acesso da equipe"
      description="Cadastre um usuario para iniciar a operacao com perfis sincronizados no Supabase."
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <label>
          Nome completo
          <input value={fullName} onChange={(event) => setFullName(event.target.value)} required />
        </label>

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
          Telefone
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="(11) 99999-9999"
          />
        </label>

        <label>
          Senha
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Minimo de 6 caracteres"
            required
          />
        </label>

        <button className="primary-button" disabled={submitting} type="submit">
          {submitting ? 'Criando acesso...' : 'Cadastrar usuario'}
        </button>
      </form>

      <p className="auth-helper">
        Ja possui conta? <Link to="/login">Voltar para login</Link>
      </p>

      {message && <p className="feedback feedback--success">{message}</p>}
      {error && <p className="feedback feedback--error">{error}</p>}
    </AuthShell>
  );
}
