export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_admin: boolean;
  is_suspended: boolean;
  created_at: string;
};

export type StaySource = 'manual' | 'photos' | 'strava' | 'instagram';

export type Stay = {
  id: string;
  user_id: string;
  city: string;
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  start_date: string; // ISO date (YYYY-MM-DD)
  end_date: string; // ISO date (YYYY-MM-DD)
  source: StaySource;
  photo_count: number | null;
  is_hidden: boolean;
  created_at: string;
};

export type ConnectionStatus = 'pending' | 'accepted' | 'declined';

export type Connection = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: ConnectionStatus;
  created_at: string;
  responded_at: string | null;
};

export type ConnectionWithProfiles = Connection & {
  requester: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>;
  addressee: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>;
};

// Two stays (mine and a friend's) that happened in the same place, either at
// an overlapping time ("overlap") or at different times ("near-miss").
// `distanceKm` is null when neither stay has coordinates and the match was
// made on city name alone.
export type CrossingBase = {
  city: string;
  friendCity: string;
  country: string | null;
  distanceKm: number | null;
  myStay: Stay;
  friendStay: Stay;
};

export type OverlapCrossing = CrossingBase & { kind: 'overlap'; overlapStart: string; overlapEnd: string };
export type NearMissCrossing = CrossingBase & { kind: 'near-miss'; dayGap: number };
export type Crossing = OverlapCrossing | NearMissCrossing;

// Minimal typed schema for the Supabase client. Extend as new tables are added.
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string; username: string };
        Update: Partial<Profile>;
        Relationships: [];
      };
      stays: {
        Row: Stay;
        Insert: Partial<Stay> & {
          user_id: string;
          city: string;
          start_date: string;
          end_date: string;
        };
        Update: Partial<Stay>;
        Relationships: [
          {
            foreignKeyName: 'stays_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      connections: {
        Row: Connection;
        Insert: Partial<Connection> & { requester_id: string; addressee_id: string };
        Update: Partial<Connection>;
        Relationships: [
          {
            foreignKeyName: 'connections_requester_id_fkey';
            columns: ['requester_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'connections_addressee_id_fkey';
            columns: ['addressee_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {};
    Functions: {};
  };
};
