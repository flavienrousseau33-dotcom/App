-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query)
-- for your project before running the app.

-- 1. Profiles -----------------------------------------------------------
-- Public by design: usernames/display names must be searchable so people can
-- send connection requests. No location data lives here.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  display_name text,
  avatar_url text,
  bio text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on public.profiles for select
  using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'display_name'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. Connections --------------------------------------------------------
-- A "friend request" model. Two users only see each other's stays (see
-- below) once a request has been sent and accepted by the addressee.
create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id),
  unique (requester_id, addressee_id)
);

create index if not exists connections_addressee_idx on public.connections (addressee_id, status);
create index if not exists connections_requester_idx on public.connections (requester_id, status);

alter table public.connections enable row level security;

create policy "Users can view their own connections"
  on public.connections for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "Users can send connection requests"
  on public.connections for insert
  with check (auth.uid() = requester_id);

create policy "Addressee can accept or decline, requester can cancel"
  on public.connections for update
  using (auth.uid() = requester_id or auth.uid() = addressee_id)
  with check (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "Either side can remove a connection"
  on public.connections for delete
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Helper used by the stays policy below: true if the two users have an
-- accepted connection (in either direction).
create or replace function public.are_connected(user_a uuid, user_b uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.connections
    where status = 'accepted'
      and ((requester_id = user_a and addressee_id = user_b)
        or (requester_id = user_b and addressee_id = user_a))
  );
$$;

-- 3. Stays ----------------------------------------------------------------
-- A "stay" is a period of time a person spent in one city, derived either
-- from geotagged photos (processed on-device, only the city/date summary is
-- synced — never raw GPS points or the photos themselves), entered manually,
-- or (later) imported from Strava/Instagram.
create table if not exists public.stays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  city text not null,
  region text,
  country text,
  latitude double precision,
  longitude double precision,
  start_date date not null,
  end_date date not null,
  source text not null default 'manual' check (source in ('manual', 'photos', 'strava', 'instagram')),
  photo_count integer,
  -- Hidden from connections entirely, regardless of proximity. Set manually
  -- by the owner (the app suggests hiding places visited 3+ times — likely
  -- home/work/family — but never sets this on its own). Never affects the
  -- owner's own view of their own stays.
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

alter table public.stays add column if not exists is_hidden boolean not null default false;

create index if not exists stays_user_idx on public.stays (user_id, start_date);
create index if not exists stays_city_idx on public.stays (lower(city));

alter table public.stays enable row level security;

-- Same proximity rule as lib/crossings.ts's PROXIMITY_KM_THRESHOLD: within
-- 20km when both stays have coordinates, otherwise same city name. Keep
-- the two in sync if you ever change one.
create or replace function public.stays_are_close(
  lat1 double precision, lng1 double precision, city1 text,
  lat2 double precision, lng2 double precision, city2 text
)
returns boolean
language sql
immutable
as $$
  select case
    when lat1 is not null and lng1 is not null and lat2 is not null and lng2 is not null then
      (
        2 * 6371 * asin(least(1, sqrt(
          sin(radians(lat2 - lat1) / 2) ^ 2 +
          cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lng2 - lng1) / 2) ^ 2
        )))
      ) <= 20
    else
      lower(trim(city1)) = lower(trim(city2))
  end;
$$;

-- A connection only ever sees a stay of yours that is (a) not hidden and
-- (b) close to one of *their own* non-hidden stays — never your full
-- location history. This is the same restriction the app applies when
-- computing "Croisements", enforced here so it can't be bypassed by
-- querying the table directly.
-- (Superseded a broader "any accepted connection sees all your stays"
-- policy of the same table — drop it first since Postgres has no
-- `create or replace policy`.)
drop policy if exists "Users can view their own stays or an accepted connection's" on public.stays;
drop policy if exists "Users can view their own stays or a nearby one from a connection" on public.stays;

create policy "Users can view their own stays or a nearby non-hidden one from a connection"
  on public.stays for select
  using (
    auth.uid() = user_id
    or (
      not is_hidden
      and public.are_connected(auth.uid(), user_id)
      and exists (
        select 1
        from public.stays viewer_stay
        where viewer_stay.user_id = auth.uid()
          and not viewer_stay.is_hidden
          and public.stays_are_close(
            viewer_stay.latitude, viewer_stay.longitude, viewer_stay.city,
            stays.latitude, stays.longitude, stays.city
          )
      )
    )
  );

create policy "Users can insert their own stays"
  on public.stays for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own stays"
  on public.stays for update
  using (auth.uid() = user_id);

create policy "Users can delete their own stays"
  on public.stays for delete
  using (auth.uid() = user_id);

-- 3b. Saved places (Maison / Travail / Lieux fréquents) ----------------------
-- Reference points managed from the "Paramètres > Lieux cachés" screen.
-- 'home' and 'work' are single, user-declared addresses; 'frequent' entries
-- are auto-populated from lib/homeDetection.ts (places visited 3+ times).
-- Entirely private — never exposed to connections, only used server-side
-- (via lib/savedPlaces.ts) to decide which of the owner's *stays* get
-- is_hidden = true.
create table if not exists public.saved_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('home', 'work', 'frequent')),
  address text,
  latitude double precision,
  longitude double precision,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);

-- At most one "home" and one "work" entry per user; any number of "frequent".
create unique index if not exists saved_places_home_work_uniq
  on public.saved_places (user_id, kind)
  where kind in ('home', 'work');

create index if not exists saved_places_user_idx on public.saved_places (user_id);

alter table public.saved_places enable row level security;

create policy "Users can view their own saved places"
  on public.saved_places for select
  using (auth.uid() = user_id);

create policy "Users can insert their own saved places"
  on public.saved_places for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own saved places"
  on public.saved_places for update
  using (auth.uid() = user_id);

create policy "Users can delete their own saved places"
  on public.saved_places for delete
  using (auth.uid() = user_id);

-- 4. Admin / back office -----------------------------------------------------
-- Bootstrap the first admin manually from the SQL editor, e.g.:
--   update public.profiles set is_admin = true where username = 'yourusername';
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists is_suspended boolean not null default false;

create or replace function public.is_admin_user()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- Belt-and-suspenders: even though the app never sends these columns, this
-- stops a crafted request from the normal "update own profile" policy above
-- from ever being able to self-grant admin or lift a suspension.
create or replace function public.protect_admin_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin_user() then
    new.is_admin := old.is_admin;
    new.is_suspended := old.is_suspended;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_admin_columns_trigger on public.profiles;
create trigger protect_admin_columns_trigger
  before update on public.profiles
  for each row execute procedure public.protect_admin_columns();

-- Every function below is security definer (so it can see across all users,
-- bypassing the normal per-user RLS above) and starts by checking
-- is_admin_user(), which reads the *caller's* session — so only an admin's
-- own JWT can ever make these do anything. No service-role key is needed
-- anywhere in the admin web app.

create or replace function public.admin_stats()
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  result json;
begin
  if not public.is_admin_user() then
    raise exception 'not authorized';
  end if;

  select json_build_object(
    'total_users', (select count(*) from public.profiles),
    'new_users_7d', (select count(*) from public.profiles where created_at >= now() - interval '7 days'),
    'new_users_30d', (select count(*) from public.profiles where created_at >= now() - interval '30 days'),
    'suspended_users', (select count(*) from public.profiles where is_suspended),
    'total_stays', (select count(*) from public.stays),
    'stays_by_source', (
      select coalesce(json_object_agg(source, cnt), '{}'::json) from (
        select source, count(*) as cnt from public.stays group by source
      ) s
    ),
    'total_connections_accepted', (select count(*) from public.connections where status = 'accepted'),
    'total_connections_pending', (select count(*) from public.connections where status = 'pending')
  ) into result;

  return result;
end;
$$;

create or replace function public.admin_list_users(search text default '', limit_count int default 50, offset_count int default 0)
returns table (
  id uuid,
  username text,
  display_name text,
  email text,
  is_admin boolean,
  is_suspended boolean,
  stay_count bigint,
  friend_count bigint,
  created_at timestamptz
)
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin_user() then
    raise exception 'not authorized';
  end if;

  return query
    select
      p.id,
      p.username,
      p.display_name,
      u.email,
      p.is_admin,
      p.is_suspended,
      (select count(*) from public.stays s where s.user_id = p.id),
      (select count(*) from public.connections c where c.status = 'accepted' and (c.requester_id = p.id or c.addressee_id = p.id)),
      p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    where search = '' or p.username ilike '%' || search || '%' or u.email ilike '%' || search || '%'
    order by p.created_at desc
    limit limit_count offset offset_count;
end;
$$;

create or replace function public.admin_set_suspended(target_id uuid, suspended boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin_user() then
    raise exception 'not authorized';
  end if;
  if target_id = auth.uid() then
    raise exception 'cannot suspend yourself';
  end if;

  update public.profiles set is_suspended = suspended where id = target_id;
end;
$$;

create or replace function public.admin_delete_user(target_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin_user() then
    raise exception 'not authorized';
  end if;
  if target_id = auth.uid() then
    raise exception 'cannot delete yourself';
  end if;

  delete from auth.users where id = target_id;
end;
$$;

create or replace function public.admin_delete_stay(target_stay_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin_user() then
    raise exception 'not authorized';
  end if;

  delete from public.stays where id = target_stay_id;
end;
$$;

-- 5. Notifications ------------------------------------------------------------
-- The in-app notification center. Rows are only ever created server-side
-- (the trigger and function below) — never directly by a client — so their
-- content can't be spoofed.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('crossing_overlap', 'crossing_near_miss', 'friend_request', 'friend_accepted')),
  title text not null,
  body text not null,
  data jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "Users can view their own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "Users can mark their own notifications as read"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 5a. Friend request / acceptance notifications --------------------------
create or replace function public.notify_connection_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  requester_name text;
  addressee_name text;
begin
  if (tg_op = 'INSERT') then
    select coalesce(display_name, username) into requester_name from public.profiles where id = new.requester_id;
    insert into public.notifications (user_id, type, title, body, data)
    values (
      new.addressee_id,
      'friend_request',
      'Nouvelle demande de connexion',
      requester_name || ' souhaite se connecter avec toi.',
      jsonb_build_object('connection_id', new.id, 'requester_id', new.requester_id)
    );
  elsif (tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted') then
    select coalesce(display_name, username) into addressee_name from public.profiles where id = new.addressee_id;
    insert into public.notifications (user_id, type, title, body, data)
    values (
      new.requester_id,
      'friend_accepted',
      'Demande acceptée',
      addressee_name || ' a accepté ta demande de connexion.',
      jsonb_build_object('connection_id', new.id, 'addressee_id', new.addressee_id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_connection_change on public.connections;
create trigger on_connection_change
  after insert or update on public.connections
  for each row execute procedure public.notify_connection_change();

-- 5b. Daily crossing notifications ----------------------------------------
-- A running ledger of every (user, friend, stay pair) crossing ever
-- detected, so the daily check only notifies about genuinely *new* ones —
-- this is what gives "Croisements" a continuous thread over time instead
-- of only surfacing whatever the current snapshot happens to show. Once
-- notified, an entry is never removed, even if the underlying stay is
-- later hidden — it's a historical record, not a live view.
create table if not exists public.notified_crossings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  friend_id uuid not null references public.profiles (id) on delete cascade,
  my_stay_id uuid not null references public.stays (id) on delete cascade,
  friend_stay_id uuid not null references public.stays (id) on delete cascade,
  kind text not null check (kind in ('overlap', 'near_miss')),
  created_at timestamptz not null default now(),
  unique (user_id, friend_id, my_stay_id, friend_stay_id, kind)
);

create index if not exists notified_crossings_user_idx on public.notified_crossings (user_id);

alter table public.notified_crossings enable row level security;

create policy "Users can view their own notified crossings"
  on public.notified_crossings for select
  using (auth.uid() = user_id);

-- Recomputes every current overlap/near-miss between accepted connections
-- (mirroring lib/crossings.ts's matching rules via stays_are_close()) and
-- notifies both sides about any pair not already in notified_crossings.
-- Meant to run once a day (see the cron schedule below) — safe to run
-- more often too, since it's naturally idempotent.
create or replace function public.check_daily_crossings()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  new_count integer := 0;
  rec record;
  inserted_id uuid;
begin
  for rec in
    select
      p.user_id,
      p.friend_id,
      s1.id as my_stay_id,
      s2.id as friend_stay_id,
      s2.city as friend_city,
      coalesce(pr.display_name, pr.username) as friend_name,
      case when s1.start_date <= s2.end_date and s2.start_date <= s1.end_date then 'overlap' else 'near_miss' end as kind
    from (
      select requester_id as user_id, addressee_id as friend_id from public.connections where status = 'accepted'
      union all
      select addressee_id as user_id, requester_id as friend_id from public.connections where status = 'accepted'
    ) p
    join public.stays s1 on s1.user_id = p.user_id and not s1.is_hidden
    join public.stays s2 on s2.user_id = p.friend_id and not s2.is_hidden
    join public.profiles pr on pr.id = p.friend_id
    where public.stays_are_close(s1.latitude, s1.longitude, s1.city, s2.latitude, s2.longitude, s2.city)
      -- Near-misses more than 7 days apart aren't worth surfacing (mirrors
      -- NEAR_MISS_MAX_DAY_GAP in lib/crossings.ts) — overlaps are always kept.
      and (
        s1.start_date <= s2.end_date and s2.start_date <= s1.end_date
        or greatest(s1.start_date, s2.start_date) - least(s1.end_date, s2.end_date) <= 7
      )
  loop
    insert into public.notified_crossings (user_id, friend_id, my_stay_id, friend_stay_id, kind)
    values (rec.user_id, rec.friend_id, rec.my_stay_id, rec.friend_stay_id, rec.kind)
    on conflict (user_id, friend_id, my_stay_id, friend_stay_id, kind) do nothing
    returning id into inserted_id;

    if inserted_id is not null then
      insert into public.notifications (user_id, type, title, body, data)
      values (
        rec.user_id,
        case when rec.kind = 'overlap' then 'crossing_overlap' else 'crossing_near_miss' end,
        case when rec.kind = 'overlap' then 'Nouveau croisement !' else 'Vous êtes presque croisés' end,
        case
          when rec.kind = 'overlap' then 'Toi et ' || rec.friend_name || ' étiez à ' || rec.friend_city || ' en même temps.'
          else 'Toi et ' || rec.friend_name || ' êtes passés par ' || rec.friend_city || ', à des dates différentes.'
        end,
        jsonb_build_object('friend_id', rec.friend_id, 'friend_stay_id', rec.friend_stay_id, 'kind', rec.kind)
      );
      new_count := new_count + 1;
    end if;
    inserted_id := null;
  end loop;

  return new_count;
end;
$$;

-- Schedules check_daily_crossings() to run every day at midnight (UTC,
-- server time). Requires the pg_cron extension — enable it first via
-- Dashboard > Database > Extensions (search "pg_cron"), or via:
--   create extension if not exists pg_cron;
-- if your project allows it directly from the SQL editor. If pg_cron
-- isn't available on your plan, use Dashboard > Integrations > Cron Jobs
-- instead to schedule the same `select public.check_daily_crossings();`
-- SQL snippet on a "0 0 * * *" schedule.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'daily-crossing-check') then
      perform cron.unschedule('daily-crossing-check');
    end if;
    perform cron.schedule('daily-crossing-check', '0 0 * * *', $cron$select public.check_daily_crossings();$cron$);
  end if;
end;
$$;

-- 6. Crossing threads (likes, comments, shared photos) --------------------
-- One thread per real-world crossing. A thread starts with two people (an
-- overlap or near-miss between you and a friend) but naturally grows to more
-- than two if a third person's stay also matches one already in the thread
-- (see upsert_crossing_thread_pair below) — e.g. three friends who were all
-- in Lisbon that same week.
--
-- Group threads need care: two members of the same thread aren't
-- necessarily connected to *each other* (you might both be connected to the
-- third person without knowing one another). Every read path below
-- therefore anonymizes a participant's identity (name, username, avatar)
-- and their comments/photos unless the viewer is that person or is
-- mutually connected with them — mirroring the rest of this schema's rule
-- that connection status, not thread membership, gates who you can identify.
create table if not exists public.crossing_threads (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  country text,
  latitude double precision,
  longitude double precision,
  period_start date not null,
  period_end date not null,
  kind text not null check (kind in ('overlap', 'near_miss')),
  created_at timestamptz not null default now()
);

create table if not exists public.crossing_thread_members (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.crossing_threads (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  stay_id uuid not null references public.stays (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (thread_id, user_id)
);

create index if not exists crossing_thread_members_stay_idx on public.crossing_thread_members (stay_id);

create table if not exists public.crossing_thread_likes (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.crossing_threads (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (thread_id, user_id)
);

create table if not exists public.crossing_thread_comments (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.crossing_threads (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists crossing_thread_comments_thread_idx on public.crossing_thread_comments (thread_id, created_at);

create table if not exists public.crossing_thread_photos (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.crossing_threads (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists crossing_thread_photos_thread_idx on public.crossing_thread_photos (thread_id, created_at);

alter table public.crossing_threads enable row level security;
alter table public.crossing_thread_members enable row level security;
alter table public.crossing_thread_likes enable row level security;
alter table public.crossing_thread_comments enable row level security;
alter table public.crossing_thread_photos enable row level security;

-- Security-definer so it can check membership without itself being blocked
-- by the (deliberately policy-less) crossing_thread_members table below.
create or replace function public.is_thread_member(p_thread_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.crossing_thread_members m
    where m.thread_id = p_thread_id and m.user_id = auth.uid()
  );
$$;

drop policy if exists "Members can view their threads" on public.crossing_threads;
create policy "Members can view their threads"
  on public.crossing_threads for select
  using (public.is_thread_member(id));

-- crossing_thread_members has no select/insert/delete policy at all: the raw
-- user_id/stay_id mapping is only ever exposed through get_thread_overview()
-- below, which is what applies the anonymization rule. Direct table access
-- would let a member bypass it by joining profiles themselves.

drop policy if exists "Members can view likes" on public.crossing_thread_likes;
create policy "Members can view likes"
  on public.crossing_thread_likes for select
  using (public.is_thread_member(thread_id));

drop policy if exists "Members can like" on public.crossing_thread_likes;
create policy "Members can like"
  on public.crossing_thread_likes for insert
  with check (public.is_thread_member(thread_id) and user_id = auth.uid());

drop policy if exists "Members can unlike their own like" on public.crossing_thread_likes;
create policy "Members can unlike their own like"
  on public.crossing_thread_likes for delete
  using (user_id = auth.uid());

-- Comments and photos are readable only through get_thread_comments() /
-- get_thread_photos() (anonymized) — no select policy here either. Posting
-- and deleting your own row is a plain policy since that never reveals
-- anyone else's identity.
drop policy if exists "Members can comment" on public.crossing_thread_comments;
create policy "Members can comment"
  on public.crossing_thread_comments for insert
  with check (public.is_thread_member(thread_id) and user_id = auth.uid());

drop policy if exists "Members can delete their own comment" on public.crossing_thread_comments;
create policy "Members can delete their own comment"
  on public.crossing_thread_comments for delete
  using (user_id = auth.uid());

drop policy if exists "Members can add photos" on public.crossing_thread_photos;
create policy "Members can add photos"
  on public.crossing_thread_photos for insert
  with check (public.is_thread_member(thread_id) and user_id = auth.uid());

drop policy if exists "Members can delete their own photo" on public.crossing_thread_photos;
create policy "Members can delete their own photo"
  on public.crossing_thread_photos for delete
  using (user_id = auth.uid());

-- Internal engine behind both get_or_create_crossing_thread() (below) and
-- check_daily_crossings(): finds an existing thread that already contains
-- either stay and adds the missing member to it, or creates a new thread.
-- This is what lets a thread grow past two people over time.
--
-- Deliberately takes explicit user/stay ids instead of relying on auth.uid(),
-- because check_daily_crossings() calls it for pairs that have nothing to do
-- with the current request's caller. That means it must NOT be reachable
-- directly by clients (it does no ownership/connection check of its own) —
-- revoked from anon/authenticated right after creation; only callable from
-- other security-definer functions owned by the same role.
create or replace function public.upsert_crossing_thread_pair(
  p_user_id uuid,
  p_stay_id uuid,
  p_friend_user_id uuid,
  p_friend_stay_id uuid
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_stay record;
  v_friend_stay record;
  v_thread_id uuid;
  v_kind text;
begin
  select * into v_stay from public.stays where id = p_stay_id;
  select * into v_friend_stay from public.stays where id = p_friend_stay_id;

  v_kind := case
    when v_stay.start_date <= v_friend_stay.end_date and v_friend_stay.start_date <= v_stay.end_date then 'overlap'
    else 'near_miss'
  end;

  -- Known limitation: if both stays already independently belong to two
  -- different existing threads, this just picks one arbitrarily rather than
  -- merging the two threads — an edge case left unhandled for now.
  select m.thread_id into v_thread_id
  from public.crossing_thread_members m
  where m.stay_id in (p_stay_id, p_friend_stay_id)
  limit 1;

  if v_thread_id is null then
    insert into public.crossing_threads (city, country, latitude, longitude, period_start, period_end, kind)
    values (
      v_stay.city,
      coalesce(v_stay.country, v_friend_stay.country),
      v_stay.latitude,
      v_stay.longitude,
      least(v_stay.start_date, v_friend_stay.start_date),
      greatest(v_stay.end_date, v_friend_stay.end_date),
      v_kind
    )
    returning id into v_thread_id;
  else
    update public.crossing_threads
    set
      kind = case when v_kind = 'overlap' then 'overlap' else kind end,
      period_start = least(period_start, v_stay.start_date, v_friend_stay.start_date),
      period_end = greatest(period_end, v_stay.end_date, v_friend_stay.end_date)
    where id = v_thread_id;
  end if;

  insert into public.crossing_thread_members (thread_id, user_id, stay_id)
  values (v_thread_id, p_user_id, p_stay_id)
  on conflict (thread_id, user_id) do nothing;

  insert into public.crossing_thread_members (thread_id, user_id, stay_id)
  values (v_thread_id, p_friend_user_id, p_friend_stay_id)
  on conflict (thread_id, user_id) do nothing;

  return v_thread_id;
end;
$$;

revoke execute on function public.upsert_crossing_thread_pair(uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- Client-facing entry point: "open (or start) the thread for this
-- crossing." Called when someone taps "Voir le thread" on a crossing in
-- the app. Re-validates everything the client claims (the stay is really
-- theirs, the two are really connected, the stays are really close) before
-- delegating to upsert_crossing_thread_pair.
create or replace function public.get_or_create_crossing_thread(p_my_stay_id uuid, p_friend_stay_id uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_my_stay record;
  v_friend_stay record;
begin
  select * into v_my_stay from public.stays where id = p_my_stay_id and user_id = auth.uid();
  if not found then
    raise exception 'not your stay';
  end if;

  select * into v_friend_stay from public.stays where id = p_friend_stay_id;
  if not found then
    raise exception 'stay not found';
  end if;

  if not public.are_connected(auth.uid(), v_friend_stay.user_id) then
    raise exception 'not connected to this user';
  end if;

  if not public.stays_are_close(v_my_stay.latitude, v_my_stay.longitude, v_my_stay.city, v_friend_stay.latitude, v_friend_stay.longitude, v_friend_stay.city) then
    raise exception 'stays are not close';
  end if;

  return public.upsert_crossing_thread_pair(auth.uid(), p_my_stay_id, v_friend_stay.user_id, p_friend_stay_id);
end;
$$;

-- Single call the thread screen uses to render everything except the
-- comment/photo lists: thread metadata, like count/state, and the
-- (anonymized) participant list.
create or replace function public.get_thread_overview(p_thread_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
stable
as $$
declare
  v_result jsonb;
begin
  if not public.is_thread_member(p_thread_id) then
    raise exception 'not a member of this thread';
  end if;

  select jsonb_build_object(
    'id', t.id,
    'city', t.city,
    'country', t.country,
    'latitude', t.latitude,
    'longitude', t.longitude,
    'period_start', t.period_start,
    'period_end', t.period_end,
    'kind', t.kind,
    'created_at', t.created_at,
    'like_count', (select count(*) from public.crossing_thread_likes l where l.thread_id = t.id),
    'liked_by_me', exists (select 1 from public.crossing_thread_likes l where l.thread_id = t.id and l.user_id = auth.uid()),
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', m.user_id,
        'display_name', case
          when m.user_id = auth.uid() or public.are_connected(auth.uid(), m.user_id) then coalesce(p.display_name, p.username)
          else 'Un autre voyageur'
        end,
        'username', case when m.user_id = auth.uid() or public.are_connected(auth.uid(), m.user_id) then p.username else null end,
        'avatar_url', case when m.user_id = auth.uid() or public.are_connected(auth.uid(), m.user_id) then p.avatar_url else null end,
        'is_you', m.user_id = auth.uid(),
        'is_friend', public.are_connected(auth.uid(), m.user_id),
        'city', s.city
      ) order by m.created_at)
      from public.crossing_thread_members m
      join public.profiles p on p.id = m.user_id
      join public.stays s on s.id = m.stay_id
      where m.thread_id = t.id
    ), '[]'::jsonb)
  )
  into v_result
  from public.crossing_threads t
  where t.id = p_thread_id;

  return v_result;
end;
$$;

create or replace function public.get_thread_comments(p_thread_id uuid)
returns table (
  id uuid,
  user_id uuid,
  author_name text,
  is_you boolean,
  is_friend boolean,
  body text,
  created_at timestamptz
)
language plpgsql
security definer set search_path = public
stable
as $$
begin
  if not public.is_thread_member(p_thread_id) then
    raise exception 'not a member of this thread';
  end if;

  return query
  select
    c.id,
    c.user_id,
    case when c.user_id = auth.uid() or public.are_connected(auth.uid(), c.user_id) then coalesce(p.display_name, p.username) else 'Un autre voyageur' end,
    c.user_id = auth.uid(),
    public.are_connected(auth.uid(), c.user_id),
    c.body,
    c.created_at
  from public.crossing_thread_comments c
  join public.profiles p on p.id = c.user_id
  where c.thread_id = p_thread_id
  order by c.created_at asc;
end;
$$;

create or replace function public.get_thread_photos(p_thread_id uuid)
returns table (
  id uuid,
  user_id uuid,
  author_name text,
  is_you boolean,
  is_friend boolean,
  storage_path text,
  created_at timestamptz
)
language plpgsql
security definer set search_path = public
stable
as $$
begin
  if not public.is_thread_member(p_thread_id) then
    raise exception 'not a member of this thread';
  end if;

  return query
  select
    ph.id,
    ph.user_id,
    case when ph.user_id = auth.uid() or public.are_connected(auth.uid(), ph.user_id) then coalesce(p.display_name, p.username) else 'Un autre voyageur' end,
    ph.user_id = auth.uid(),
    public.are_connected(auth.uid(), ph.user_id),
    ph.storage_path,
    ph.created_at
  from public.crossing_thread_photos ph
  join public.profiles p on p.id = ph.user_id
  where ph.thread_id = p_thread_id
  order by ph.created_at desc;
end;
$$;

-- Update check_daily_crossings() to also open/extend a thread for every
-- crossing it detects, and to hand the thread id to the notification so
-- tapping it can deep-link straight into the thread instead of the tab.
create or replace function public.check_daily_crossings()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  new_count integer := 0;
  rec record;
  inserted_id uuid;
  v_thread_id uuid;
begin
  for rec in
    select
      p.user_id,
      p.friend_id,
      s1.id as my_stay_id,
      s2.id as friend_stay_id,
      s2.city as friend_city,
      coalesce(pr.display_name, pr.username) as friend_name,
      case when s1.start_date <= s2.end_date and s2.start_date <= s1.end_date then 'overlap' else 'near_miss' end as kind
    from (
      select requester_id as user_id, addressee_id as friend_id from public.connections where status = 'accepted'
      union all
      select addressee_id as user_id, requester_id as friend_id from public.connections where status = 'accepted'
    ) p
    join public.stays s1 on s1.user_id = p.user_id and not s1.is_hidden
    join public.stays s2 on s2.user_id = p.friend_id and not s2.is_hidden
    join public.profiles pr on pr.id = p.friend_id
    where public.stays_are_close(s1.latitude, s1.longitude, s1.city, s2.latitude, s2.longitude, s2.city)
      -- Near-misses more than 7 days apart aren't worth surfacing (mirrors
      -- NEAR_MISS_MAX_DAY_GAP in lib/crossings.ts) — overlaps are always kept.
      and (
        s1.start_date <= s2.end_date and s2.start_date <= s1.end_date
        or greatest(s1.start_date, s2.start_date) - least(s1.end_date, s2.end_date) <= 7
      )
  loop
    v_thread_id := public.upsert_crossing_thread_pair(rec.user_id, rec.my_stay_id, rec.friend_id, rec.friend_stay_id);

    insert into public.notified_crossings (user_id, friend_id, my_stay_id, friend_stay_id, kind)
    values (rec.user_id, rec.friend_id, rec.my_stay_id, rec.friend_stay_id, rec.kind)
    on conflict (user_id, friend_id, my_stay_id, friend_stay_id, kind) do nothing
    returning id into inserted_id;

    if inserted_id is not null then
      insert into public.notifications (user_id, type, title, body, data)
      values (
        rec.user_id,
        case when rec.kind = 'overlap' then 'crossing_overlap' else 'crossing_near_miss' end,
        case when rec.kind = 'overlap' then 'Nouveau croisement !' else 'Vous êtes presque croisés' end,
        case
          when rec.kind = 'overlap' then 'Toi et ' || rec.friend_name || ' étiez à ' || rec.friend_city || ' en même temps.'
          else 'Toi et ' || rec.friend_name || ' êtes passés par ' || rec.friend_city || ', à des dates différentes.'
        end,
        jsonb_build_object('friend_id', rec.friend_id, 'friend_stay_id', rec.friend_stay_id, 'kind', rec.kind, 'thread_id', v_thread_id)
      );
      new_count := new_count + 1;
    end if;
    inserted_id := null;
  end loop;

  return new_count;
end;
$$;

-- Private storage bucket for thread photos. Objects are stored under
-- `{thread_id}/{filename}` so RLS can gate access by thread membership
-- without needing to know who uploaded which photo (upload authorship is
-- itself only exposed, anonymized, through get_thread_photos() above).
insert into storage.buckets (id, name, public)
values ('thread-photos', 'thread-photos', false)
on conflict (id) do nothing;

drop policy if exists "Thread members can view thread photos" on storage.objects;
create policy "Thread members can view thread photos"
  on storage.objects for select
  using (bucket_id = 'thread-photos' and public.is_thread_member(((storage.foldername(name))[1])::uuid));

drop policy if exists "Thread members can upload thread photos" on storage.objects;
create policy "Thread members can upload thread photos"
  on storage.objects for insert
  with check (bucket_id = 'thread-photos' and public.is_thread_member(((storage.foldername(name))[1])::uuid));

drop policy if exists "Uploader can delete their thread photo" on storage.objects;
create policy "Uploader can delete their thread photo"
  on storage.objects for delete
  using (bucket_id = 'thread-photos' and owner = auth.uid());

-- 7. Profile pictures -------------------------------------------------------
-- Public bucket: profiles.avatar_url is already public by design (see
-- section 1 — usernames/avatars must be visible to anyone for search and
-- connection requests), so unlike thread photos this needs no membership
-- check, only "you can only write to your own folder."
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "Avatars are publicly readable" on storage.objects;
create policy "Avatars are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can replace their own avatar" on storage.objects;
create policy "Users can replace their own avatar"
  on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar"
  on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
