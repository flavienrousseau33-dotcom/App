import { useState, type FormEvent } from 'react';

type Props = {
  onSubmit: (email: string, password: string) => void;
  error: string | null;
  notAdmin: boolean;
};

export function Login({ onSubmit, error, notAdmin }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit(email.trim(), password);
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Traces — Back office</h1>
        <p className="auth-subtitle">Réservé aux comptes administrateurs.</p>

        <label>
          Email
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Mot de passe
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {notAdmin ? (
          <p className="auth-error">Ce compte n'a pas les droits administrateur.</p>
        ) : null}
        {error ? <p className="auth-error">{error}</p> : null}

        <button type="submit">Se connecter</button>
      </form>
    </div>
  );
}
