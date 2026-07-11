import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';
import type { AdminUserRow } from '../lib/types';

const PAGE_SIZE = 25;

export function Users() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('admin_list_users', {
      search,
      limit_count: PAGE_SIZE,
      offset_count: page * PAGE_SIZE,
    });
    if (rpcError) {
      setError(rpcError.message);
    } else {
      setUsers((data as AdminUserRow[]) ?? []);
    }
    setLoading(false);
  }, [search, page]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleSuspended(u: AdminUserRow) {
    setBusyId(u.id);
    const { error: rpcError } = await supabase.rpc('admin_set_suspended', {
      target_id: u.id,
      suspended: !u.is_suspended,
    });
    setBusyId(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    await load();
  }

  async function deleteUser(u: AdminUserRow) {
    const confirmed = window.confirm(
      `Supprimer définitivement le compte "${u.username}" ? Cette action est irréversible et supprime aussi ses séjours et connexions.`
    );
    if (!confirmed) return;

    setBusyId(u.id);
    const { error: rpcError } = await supabase.rpc('admin_delete_user', { target_id: u.id });
    setBusyId(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    await load();
  }

  return (
    <div>
      <div className="toolbar">
        <input
          className="search-input"
          placeholder="Rechercher par pseudo ou email…"
          value={search}
          onChange={(e) => {
            setPage(0);
            setSearch(e.target.value);
          }}
        />
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Utilisateur</th>
              <th>Email</th>
              <th>Séjours</th>
              <th>Amis</th>
              <th>Inscrit le</th>
              <th>Statut</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="user-cell">
                    <strong>{u.display_name || u.username}</strong>
                    <span className="muted">@{u.username}</span>
                  </div>
                </td>
                <td>{u.email}</td>
                <td>{u.stay_count}</td>
                <td>{u.friend_count}</td>
                <td>{new Date(u.created_at).toLocaleDateString('fr-FR')}</td>
                <td>
                  {u.is_admin ? <span className="badge badge--admin">Admin</span> : null}
                  {u.is_suspended ? <span className="badge badge--warn">Suspendu</span> : null}
                </td>
                <td className="actions-cell">
                  <button disabled={busyId === u.id || u.is_admin} onClick={() => toggleSuspended(u)}>
                    {u.is_suspended ? 'Réactiver' : 'Suspendre'}
                  </button>
                  <button className="danger" disabled={busyId === u.id || u.is_admin} onClick={() => deleteUser(u)}>
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
            {!loading && users.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  Aucun utilisateur trouvé.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
          Précédent
        </button>
        <span className="muted">Page {page + 1}</span>
        <button disabled={users.length < PAGE_SIZE} onClick={() => setPage((p) => p + 1)}>
          Suivant
        </button>
      </div>
    </div>
  );
}
