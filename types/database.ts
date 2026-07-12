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

export type SavedPlaceKind = 'home' | 'work' | 'frequent';

export type SavedPlace = {
  id: string;
  user_id: string;
  kind: SavedPlaceKind;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  is_hidden: boolean;
  created_at: string;
};

export type NotificationType = 'crossing_overlap' | 'crossing_near_miss' | 'friend_request' | 'friend_accepted';

export type AppNotification = {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  is_read: boolean;
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

export type CrossingThreadKind = 'overlap' | 'near_miss';

// One row per real-world crossing, possibly shared by more than two people.
// Returned as JSON by the get_thread_overview() RPC (see supabase/schema.sql),
// not read directly from the table — see ThreadParticipant for why.
export type ThreadOverview = {
  id: string;
  city: string;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  period_start: string;
  period_end: string;
  kind: CrossingThreadKind;
  created_at: string;
  like_count: number;
  liked_by_me: boolean;
  participants: ThreadParticipant[];
};

// display_name/username/avatar_url are already anonymized server-side
// ('Un autre voyageur', null, null) when `is_friend` is false and `is_you`
// is false — never re-derive identity from user_id on the client.
export type ThreadParticipant = {
  user_id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  is_you: boolean;
  is_friend: boolean;
  city: string;
};

export type ThreadComment = {
  id: string;
  user_id: string;
  author_name: string;
  is_you: boolean;
  is_friend: boolean;
  body: string;
  created_at: string;
};

export type ThreadPhoto = {
  id: string;
  user_id: string;
  author_name: string;
  is_you: boolean;
  is_friend: boolean;
  storage_path: string;
  created_at: string;
};

// Raw table rows, used only for the insert/delete calls the client makes
// directly (posting/removing your own comment, like, or photo) — reads go
// through the RPCs above instead.
export type CrossingThreadComment = {
  id: string;
  thread_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

export type CrossingThreadLike = {
  id: string;
  thread_id: string;
  user_id: string;
  created_at: string;
};

export type CrossingThreadPhoto = {
  id: string;
  thread_id: string;
  user_id: string;
  storage_path: string;
  created_at: string;
};

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
      saved_places: {
        Row: SavedPlace;
        Insert: Partial<SavedPlace> & { user_id: string; kind: SavedPlaceKind };
        Update: Partial<SavedPlace>;
        Relationships: [
          {
            foreignKeyName: 'saved_places_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      notifications: {
        Row: AppNotification;
        Insert: Partial<AppNotification> & { user_id: string; type: NotificationType; title: string; body: string };
        Update: Partial<AppNotification>;
        Relationships: [
          {
            foreignKeyName: 'notifications_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      crossing_thread_comments: {
        Row: CrossingThreadComment;
        Insert: Partial<CrossingThreadComment> & { thread_id: string; user_id: string; body: string };
        Update: Partial<CrossingThreadComment>;
        Relationships: [];
      };
      crossing_thread_likes: {
        Row: CrossingThreadLike;
        Insert: Partial<CrossingThreadLike> & { thread_id: string; user_id: string };
        Update: Partial<CrossingThreadLike>;
        Relationships: [];
      };
      crossing_thread_photos: {
        Row: CrossingThreadPhoto;
        Insert: Partial<CrossingThreadPhoto> & { thread_id: string; user_id: string; storage_path: string };
        Update: Partial<CrossingThreadPhoto>;
        Relationships: [];
      };
    };
    Views: {};
    Functions: {
      get_or_create_crossing_thread: {
        Args: { p_my_stay_id: string; p_friend_stay_id: string };
        Returns: string;
      };
      get_thread_overview: {
        Args: { p_thread_id: string };
        Returns: ThreadOverview;
      };
      get_thread_comments: {
        Args: { p_thread_id: string };
        Returns: ThreadComment[];
      };
      get_thread_photos: {
        Args: { p_thread_id: string };
        Returns: ThreadPhoto[];
      };
    };
  };
};
