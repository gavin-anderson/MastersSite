-- =====================================================
-- Masters Pool — Supabase Schema
-- Run this in the Supabase SQL Editor
-- =====================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- =====================================================
-- PROFILES (extends auth.users)
-- =====================================================
create table if not exists public.profiles (
  id          uuid references auth.users on delete cascade primary key,
  display_name text,
  avatar_url  text,
  created_at  timestamptz default now() not null
);

alter table public.profiles enable row level security;

create policy "Users can view all profiles"
  on public.profiles for select using (true);

create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);

-- Auto-create profile on new user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================
-- GOLFERS
-- =====================================================
create table if not exists public.golfers (
  id             uuid default gen_random_uuid() primary key,
  name           text not null unique,
  country        text not null default 'USA',
  region         text not null check (region in ('usa', 'european', 'asian', 'other')), -- geographic only
  is_liv         boolean not null default false,       -- LIV tour member (can overlap with geographic)
  is_longshot    boolean not null default false,       -- 100-1 odds or greater (can overlap with geographic/LIV)
  odds           integer, -- e.g. 15000 = 150-1 odds (in cents/units)
  world_ranking  integer,
  tour           text default 'pga' check (tour in ('pga', 'liv')),
  image_url      text,
  updated_at     timestamptz default now() not null
);

alter table public.golfers enable row level security;

create policy "Everyone can view golfers"
  on public.golfers for select using (true);

create policy "Service role can manage golfers"
  on public.golfers for all using (auth.role() = 'service_role');

-- =====================================================
-- GOLFER STATS (live tournament data)
-- =====================================================
create table if not exists public.golfer_stats (
  id          uuid default gen_random_uuid() primary key,
  golfer_id   uuid references public.golfers on delete cascade not null,
  year        integer not null,
  round       integer,          -- current round (1-4)
  score       integer,          -- total score relative to par (negative = under)
  round_score integer,          -- current round score relative to par
  position    integer,          -- finishing position
  thru        integer,          -- holes completed this round (0-18)
  status      text default 'notstarted'
              check (status in ('active', 'cut', 'mc', 'wd', 'notstarted')),
  updated_at  timestamptz default now() not null,

  unique (golfer_id, year)
);

alter table public.golfer_stats enable row level security;

create policy "Everyone can view golfer stats"
  on public.golfer_stats for select using (true);

create policy "Service role can manage golfer stats"
  on public.golfer_stats for all using (auth.role() = 'service_role');

-- =====================================================
-- PICKS
-- =====================================================
create table if not exists public.picks (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid references auth.users on delete cascade not null,
  year            integer not null,
  usa_pick        uuid references public.golfers,
  european_pick   uuid references public.golfers,
  asian_pick      uuid references public.golfers,
  longshot_pick   uuid references public.golfers,
  liv_pick        uuid references public.golfers,
  submitted_at    timestamptz default now() not null,
  locked          boolean default false not null,

  unique (user_id, year)
);

alter table public.picks enable row level security;

create policy "Users can view all picks"
  on public.picks for select using (true);

create policy "Users can manage their own picks"
  on public.picks for insert with check (auth.uid() = user_id);

create policy "Users can update their unlocked picks"
  on public.picks for update using (auth.uid() = user_id and not locked);

-- =====================================================
-- SEED DATA — 2025 Masters Field
-- (Adjust odds and rankings to current values)
-- =====================================================

-- American golfers
insert into public.golfers (name, country, region, odds, world_ranking, tour) values
  ('Scottie Scheffler', 'USA', 'usa', 150, 1, 'pga'),
  ('Xander Schauffele', 'USA', 'usa', 1200, 3, 'pga'),
  ('Collin Morikawa', 'USA', 'usa', 1400, 5, 'pga'),
  ('Wyndham Clark', 'USA', 'usa', 3000, 9, 'pga'),
  ('Patrick Cantlay', 'USA', 'usa', 3000, 12, 'pga'),
  ('Max Homa', 'USA', 'usa', 4000, 16, 'pga'),
  ('Keegan Bradley', 'USA', 'usa', 5000, 22, 'pga'),
  ('Sam Burns', 'USA', 'usa', 5000, 24, 'pga'),
  ('Brian Harman', 'USA', 'usa', 6000, 28, 'pga'),
  ('Rickie Fowler', 'USA', 'usa', 8000, 35, 'pga')
on conflict (name) do update set
  region = excluded.region,
  odds = excluded.odds,
  world_ranking = excluded.world_ranking,
  tour = excluded.tour,
  updated_at = now();

-- European golfers
insert into public.golfers (name, country, region, odds, world_ranking, tour) values
  ('Rory McIlroy', 'Northern Ireland', 'european', 500, 2, 'pga'),
  ('Jon Rahm', 'Spain', 'european', 800, 4, 'liv'),
  ('Tommy Fleetwood', 'England', 'european', 2000, 8, 'pga'),
  ('Viktor Hovland', 'Norway', 'european', 2500, 10, 'pga'),
  ('Shane Lowry', 'Ireland', 'european', 4000, 19, 'pga'),
  ('Tyrrell Hatton', 'England', 'european', 5000, 23, 'liv'),
  ('Robert MacIntyre', 'Scotland', 'european', 6000, 26, 'pga'),
  ('Justin Rose', 'England', 'european', 8000, 42, 'pga')
on conflict (name) do update set
  region = excluded.region,
  odds = excluded.odds,
  world_ranking = excluded.world_ranking,
  tour = excluded.tour,
  updated_at = now();

-- Asian golfers
insert into public.golfers (name, country, region, odds, world_ranking, tour) values
  ('Hideki Matsuyama', 'Japan', 'asian', 2000, 7, 'pga'),
  ('Tom Kim', 'South Korea', 'asian', 4000, 17, 'pga'),
  ('Si Woo Kim', 'South Korea', 'asian', 8000, 36, 'pga'),
  ('Sungjae Im', 'South Korea', 'asian', 8000, 38, 'pga'),
  ('Byeong Hun An', 'South Korea', 'asian', 12000, 55, 'pga'),
  ('Haotong Li', 'China', 'asian', 25000, 110, 'pga')
on conflict (name) do update set
  region = excluded.region,
  odds = excluded.odds,
  world_ranking = excluded.world_ranking,
  tour = excluded.tour,
  updated_at = now();

-- Longshot golfers (100-1 or higher odds)
insert into public.golfers (name, country, region, odds, world_ranking, tour) values
  ('Taylor Montgomery', 'USA', 'longshot', 15000, 65, 'pga'),
  ('Denny McCarthy', 'USA', 'longshot', 20000, 75, 'pga'),
  ('Davis Thompson', 'USA', 'longshot', 25000, 90, 'pga'),
  ('Akshay Bhatia', 'USA', 'longshot', 20000, 72, 'pga'),
  ('Jake Knapp', 'USA', 'longshot', 30000, 105, 'pga'),
  ('Neal Shipley', 'USA', 'longshot', 50000, null, 'pga'),
  ('Jose Luis Ballester', 'Spain', 'longshot', 50000, null, 'pga')
on conflict (name) do update set
  region = excluded.region,
  odds = excluded.odds,
  world_ranking = excluded.world_ranking,
  tour = excluded.tour,
  updated_at = now();

-- LIV golfers (not already covered above)
insert into public.golfers (name, country, region, odds, world_ranking, tour) values
  ('Brooks Koepka', 'USA', 'liv', 1800, 6, 'liv'),
  ('Bryson DeChambeau', 'USA', 'liv', 2200, 11, 'liv'),
  ('Dustin Johnson', 'USA', 'liv', 5000, 28, 'liv'),
  ('Phil Mickelson', 'USA', 'liv', 25000, null, 'liv'),
  ('Cameron Smith', 'Australia', 'liv', 3000, 13, 'liv'),
  ('Joaquin Niemann', 'Chile', 'liv', 5000, 25, 'liv'),
  ('Talor Gooch', 'USA', 'liv', 8000, 40, 'liv'),
  ('Harold Varner III', 'USA', 'liv', 15000, 70, 'liv'),
  ('Patrick Reed', 'USA', 'liv', 12000, 60, 'liv'),
  ('Abraham Ancer', 'Mexico', 'liv', 12000, 58, 'liv')
on conflict (name) do update set
  region = excluded.region,
  odds = excluded.odds,
  world_ranking = excluded.world_ranking,
  tour = excluded.tour,
  updated_at = now();
