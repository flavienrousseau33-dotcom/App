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

-- Same proximity rule as lib/crossings.ts's PROXIMITY_KM_THRESHOLD: within
-- 150km when both stays have coordinates, otherwise same city name. Keep
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
      ) <= 150
    else
      lower(trim(city1)) = lower(trim(city2))
  end;
$$;

-- A connection only ever sees a stay of yours that is close to one of
-- *their own* stays — never your full location history. This is the same
-- restriction the app applies when computing "Croisements", enforced here
-- so it can't be bypassed by querying the table directly.
-- (Superseded a broader "any accepted connection sees all your stays"
-- policy of the same table — drop it first since Postgres has no
-- `create or replace policy`.)
drop policy if exists "Users can view their own stays or an accepted connection's" on public.stays;

create policy "Users can view their own stays or a nearby one from a connection"
  on public.stays for select
  using (
    auth.uid() = user_id
    or (
      public.are_connected(auth.uid(), user_id)
      and exists (
        select 1
        from public.stays viewer_stay
        where viewer_stay.user_id = auth.uid()
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
