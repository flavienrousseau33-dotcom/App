export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
};

export type Post = {
  id: string;
  author_id: string;
  content: string;
  image_url: string | null;
  created_at: string;
};

export type PostWithAuthorAndLikes = Post & {
  author: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>;
  like_count: number;
  liked_by_me: boolean;
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
      posts: {
        Row: Post;
        Insert: Partial<Post> & { author_id: string; content: string };
        Update: Partial<Post>;
        Relationships: [
          {
            foreignKeyName: 'posts_author_id_fkey';
            columns: ['author_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      likes: {
        Row: { post_id: string; user_id: string; created_at: string };
        Insert: { post_id: string; user_id: string };
        Update: Partial<{ post_id: string; user_id: string }>;
        Relationships: [];
      };
      follows: {
        Row: { follower_id: string; following_id: string; created_at: string };
        Insert: { follower_id: string; following_id: string };
        Update: Partial<{ follower_id: string; following_id: string }>;
        Relationships: [];
      };
    };
    Views: {};
    Functions: {};
  };
};
