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
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists stays_user_idx on public.stays (user_id, start_date);
create index if not exists stays_city_idx on public.stays (lower(city));

alter table public.stays enable row level security;

create policy "Users can view their own stays or an accepted connection's"
  on public.stays for select
  using (auth.uid() = user_id or public.are_connected(auth.uid(), user_id));

create policy "Users can insert their own stays"
  on public.stays for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own stays"
  on public.stays for update
  using (auth.uid() = user_id);

create policy "Users can delete their own stays"
  on public.stays for delete
  using (auth.uid() = user_id);
