import { useState } from 'react';

import { useAdminAuth } from './hooks/useAdminAuth';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { Users } from './pages/Users';
import './index.css';

type Tab = 'dashboard' | 'users';

function App() {
  const { status, error, email, signIn, signOut } = useAdminAuth();
  const [tab, setTab] = useState<Tab>('dashboard');

  if (status === 'loading') {
    return (
      <div className="auth-screen">
        <p className="muted">Chargement…</p>
      </div>
    );
  }

  if (status !== 'admin') {
    return <Login onSubmit={signIn} error={error} notAdmin={status === 'not-admin'} />;
  }

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">Traces — Back office</span>
        <nav className="tabs">
          <button className={tab === 'dashboard' ? 'tab active' : 'tab'} onClick={() => setTab('dashboard')}>
            Statistiques
          </button>
          <button className={tab === 'users' ? 'tab active' : 'tab'} onClick={() => setTab('users')}>
            Utilisateurs
          </button>
        </nav>
        {email ? <span className="muted">{email}</span> : null}
        <button className="signout" onClick={signOut}>
          Se déconnecter
        </button>
      </header>

      <main className="content">{tab === 'dashboard' ? <Dashboard /> : <Users />}</main>
    </div>
  );
}

export default App;
