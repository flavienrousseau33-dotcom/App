import { useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';
import type { AdminStats } from '../lib/types';

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manuel',
  photos: 'Photos',
  strava: 'Strava',
  instagram: 'Instagram',
};

export function Dashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data, error: rpcError } = await supabase.rpc('admin_stats');
      if (rpcError) {
        setError(rpcError.message);
      } else {
        setStats(data as AdminStats);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <p className="muted">Chargement…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!stats) return null;

  return (
    <div>
      <div className="stat-grid">
        <StatCard label="Utilisateurs" value={stats.total_users} />
        <StatCard label="Nouveaux (7 jours)" value={stats.new_users_7d} />
        <StatCard label="Nouveaux (30 jours)" value={stats.new_users_30d} />
        <StatCard label="Comptes suspendus" value={stats.suspended_users} warn={stats.suspended_users > 0} />
        <StatCard label="Séjours au total" value={stats.total_stays} />
        <StatCard label="Connexions acceptées" value={stats.total_connections_accepted} />
        <StatCard label="Demandes en attente" value={stats.total_connections_pending} />
      </div>

      <h2 className="section-title">Séjours par source</h2>
      <div className="stat-grid">
        {Object.keys(SOURCE_LABELS).map((source) => (
          <StatCard key={source} label={SOURCE_LABELS[source]} value={stats.stays_by_source[source] ?? 0} />
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`stat-card${warn ? ' stat-card--warn' : ''}`}>
      <span className="stat-value">{value.toLocaleString('fr-FR')}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
