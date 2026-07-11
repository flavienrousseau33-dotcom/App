export type AdminStats = {
  total_users: number;
  new_users_7d: number;
  new_users_30d: number;
  suspended_users: number;
  total_stays: number;
  stays_by_source: Record<string, number>;
  total_connections_accepted: number;
  total_connections_pending: number;
};

export type AdminUserRow = {
  id: string;
  username: string;
  display_name: string | null;
  email: string;
  is_admin: boolean;
  is_suspended: boolean;
  stay_count: number;
  friend_count: number;
  created_at: string;
};
