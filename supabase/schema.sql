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
  is_senior      boolean not null default false,       -- past champion or veteran aged 50+ (Fossils category)
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
-- SEED DATA — 2025 Masters Field (95 invitees)
-- Region is geographic only. is_liv, is_longshot, is_senior are category flags.
-- Odds/rankings are placeholders — update from The Odds API before tournament.
-- =====================================================

-- American golfers (PGA Tour)
insert into public.golfers (name, country, region, is_liv, is_longshot, is_senior, odds, world_ranking, tour) values
  ('Scottie Scheffler',    'USA', 'usa', false, false, false, 450,  1, 'pga'),
  ('Xander Schauffele',    'USA', 'usa', false, false, false, 900,  2, 'pga'),
  ('Collin Morikawa',      'USA', 'usa', false, false, false, 1800, 5, 'pga'),
  ('Wyndham Clark',        'USA', 'usa', false, false, false, 3500, 12, 'pga'),
  ('Patrick Cantlay',      'USA', 'usa', false, false, false, 2500, 9, 'pga'),
  ('Max Homa',             'USA', 'usa', false, false, false, 5000, 20, 'pga'),
  ('Keegan Bradley',       'USA', 'usa', false, false, false, 5000, 22, 'pga'),
  ('Sam Burns',            'USA', 'usa', false, false, false, 4000, 15, 'pga'),
  ('Brian Harman',         'USA', 'usa', false, false, false, 8000, 35, 'pga'),
  ('Tony Finau',           'USA', 'usa', false, false, false, 5000, 18, 'pga'),
  ('Jordan Spieth',        'USA', 'usa', false, false, false, 4000, 30, 'pga'),
  ('Justin Thomas',        'USA', 'usa', false, false, false, 3000, 14, 'pga'),
  ('Harris English',       'USA', 'usa', false, false, false, 8000, 40, 'pga'),
  ('Russell Henley',       'USA', 'usa', false, false, false, 6000, 28, 'pga'),
  ('Sahith Theegala',      'USA', 'usa', false, false, false, 3000, 10, 'pga'),
  ('Will Zalatoris',       'USA', 'usa', false, false, false, 5000, 25, 'pga'),
  ('Denny McCarthy',       'USA', 'usa', false, true,  false, 15000, 45, 'pga'),
  ('Davis Riley',          'USA', 'usa', false, true,  false, 15000, 50, 'pga'),
  ('Davis Thompson',       'USA', 'usa', false, true,  false, 15000, 55, 'pga'),
  ('Akshay Bhatia',        'USA', 'usa', false, true,  false, 10000, 35, 'pga'),
  ('Chris Kirk',           'USA', 'usa', false, true,  false, 15000, 48, 'pga'),
  ('J.J. Spaun',           'USA', 'usa', false, true,  false, 25000, 60, 'pga'),
  ('J.T. Poston',          'USA', 'usa', false, true,  false, 15000, 52, 'pga'),
  ('Austin Eckroat',       'USA', 'usa', false, true,  false, 20000, 58, 'pga'),
  ('Cameron Young',        'USA', 'usa', false, true,  false, 10000, 42, 'pga'),
  ('Matt McCarty',         'USA', 'usa', false, true,  false, 25000, 70, 'pga'),
  ('Max Greyserman',       'USA', 'usa', false, true,  false, 15000, 55, 'pga'),
  ('Nick Dunlap',          'USA', 'usa', false, true,  false, 20000, 65, 'pga'),
  ('Patton Kizzire',       'USA', 'usa', false, true,  false, 25000, 80, 'pga'),
  ('Tom Hoge',             'USA', 'usa', false, true,  false, 10000, 40, 'pga'),
  ('Daniel Berger',        'USA', 'usa', false, true,  false, 15000, 55, 'pga'),
  ('Corey Conners',        'Canada', 'usa', false, false, false, 6000, 30, 'pga'),
  ('Nick Taylor',          'Canada', 'usa', false, true,  false, 15000, 50, 'pga'),
  ('Maverick McNealy',     'USA', 'usa', false, true,  false, 20000, 60, 'pga'),
  ('Billy Horschel',       'USA', 'usa', false, true,  false, 15000, 50, 'pga'),
  ('Lucas Glover',         'USA', 'usa', false, true,  false, 20000, 65, 'pga'),
  ('Matt Fitzpatrick',     'England', 'european', false, false, false, 5000, 20, 'pga'),
  ('Brian Campbell',       'USA', 'usa', false, true,  false, 50000, null, 'pga'),
  ('Joe Highsmith',        'USA', 'usa', false, true,  false, 50000, null, 'pga'),
  ('Rafael Campos',        'Puerto Rico', 'usa', false, true,  false, 50000, null, 'pga'),
  ('Michael Kim',          'USA', 'usa', false, true,  false, 25000, 70, 'pga'),
  ('Stephan Jaeger',       'Germany', 'european', false, true,  false, 15000, 50, 'pga'),
  ('Jake Knapp',           'USA', 'usa', false, true,  false, 25000, 75, 'pga')
on conflict (name) do update set
  country = excluded.country,
  region = excluded.region,
  is_liv = excluded.is_liv,
  is_longshot = excluded.is_longshot,
  is_senior = excluded.is_senior,
  odds = excluded.odds,
  world_ranking = excluded.world_ranking,
  tour = excluded.tour,
  updated_at = now();

-- European golfers
insert into public.golfers (name, country, region, is_liv, is_longshot, is_senior, odds, world_ranking, tour) values
  ('Rory McIlroy',         'Northern Ireland', 'european', false, false, false, 650,  3, 'pga'),
  ('Ludvig Åberg',         'Sweden', 'european', false, false, false, 2000, 4, 'pga'),
  ('Tommy Fleetwood',      'England', 'european', false, false, false, 2500, 8, 'pga'),
  ('Viktor Hovland',       'Norway', 'european', false, false, false, 2500, 11, 'pga'),
  ('Shane Lowry',          'Ireland', 'european', false, false, false, 4000, 19, 'pga'),
  ('Robert MacIntyre',     'Scotland', 'european', false, false, false, 5000, 16, 'pga'),
  ('Justin Rose',          'England', 'european', false, false, false, 8000, 45, 'pga'),
  ('Matthieu Pavon',       'France', 'european', false, true,  false, 10000, 35, 'pga'),
  ('Nicolai Højgaard',     'Denmark', 'european', false, true,  false, 10000, 30, 'pga'),
  ('Rasmus Højgaard',      'Denmark', 'european', false, true,  false, 10000, 32, 'pga'),
  ('Aaron Rai',            'England', 'european', false, true,  false, 15000, 40, 'pga'),
  ('Sepp Straka',          'Austria', 'european', false, true,  false, 10000, 28, 'pga'),
  ('Thomas Detry',         'Belgium', 'european', false, true,  false, 15000, 45, 'pga'),
  ('Laurie Canter',        'England', 'european', false, true,  false, 25000, 60, 'pga'),
  ('Thorbjørn Olesen',     'Denmark', 'european', false, true,  false, 20000, 55, 'pga'),
  ('Victor Perez',         'France', 'european', false, true,  false, 15000, 45, 'pga'),
  ('Nico Echavarria',      'Colombia', 'other', false, true,  false, 20000, 55, 'pga'),
  ('Josele Ballester',     'Spain', 'european', false, true,  false, 50000, null, 'pga'),
  ('Christiaan Bezuidenhout', 'South Africa', 'other', false, true, false, 15000, 40, 'pga'),
  ('Thriston Lawrence',    'South Africa', 'other', false, true,  false, 15000, 45, 'pga'),
  ('Noah Kent',            'USA', 'usa', false, true,  false, 50000, null, 'pga'),
  ('Hiroshi Tai',          'Japan', 'asian', false, true,  false, 50000, null, 'pga'),
  ('Justin Hastings',      'Cayman Islands', 'other', false, true,  false, 50000, null, 'pga'),
  ('Evan Beck',            'USA', 'usa', false, true,  false, 50000, null, 'pga'),
  ('Adam Schenk',          'USA', 'usa', false, true,  false, 25000, 65, 'pga'),
  ('Gary Woodland',        'USA', 'usa', false, true,  false, 25000, 80, 'pga'),
  ('Matt Wallace',         'England', 'european', false, true,  false, 20000, 50, 'pga'),
  ('Garrick Higgo',        'South Africa', 'other', false, true, false, 20000, 55, 'pga'),
  ('Taylor Pendrith',      'Canada', 'usa', false, true,  false, 20000, 55, 'pga'),
  ('Beau Hossler',         'USA', 'usa', false, true,  false, 20000, 55, 'pga'),
  ('Alex Smalley',         'USA', 'usa', false, true,  false, 25000, 65, 'pga'),
  ('Lee Hodges',           'USA', 'usa', false, true,  false, 25000, 60, 'pga'),
  ('Patrick Rodgers',      'USA', 'usa', false, true,  false, 25000, 70, 'pga'),
  ('Mackenzie Hughes',     'Canada', 'usa', false, true, false, 20000, 55, 'pga'),
  ('Keith Mitchell',       'USA', 'usa', false, true,  false, 20000, 60, 'pga'),
  ('Ben Griffin',          'USA', 'usa', false, true,  false, 20000, 55, 'pga'),
  ('Alex Noren',           'Sweden', 'european', false, true,  false, 25000, 65, 'pga'),
  ('Ryan Fox',             'New Zealand', 'other', false, true, false, 15000, 40, 'pga'),
  ('Séamus Power',         'Ireland', 'european', false, true,  false, 15000, 45, 'pga'),
  ('Adam Hadwin',          'Canada', 'usa', false, true,  false, 20000, 55, 'pga'),
  ('Jhonattan Vegas',      'Venezuela', 'other', false, true,  false, 25000, 70, 'pga'),
  ('Kevin Yu',             'Taiwan', 'asian', false, true,  false, 25000, 65, 'pga')
on conflict (name) do update set
  country = excluded.country,
  region = excluded.region,
  is_liv = excluded.is_liv,
  is_longshot = excluded.is_longshot,
  is_senior = excluded.is_senior,
  odds = excluded.odds,
  world_ranking = excluded.world_ranking,
  tour = excluded.tour,
  updated_at = now();

-- Asian golfers
insert into public.golfers (name, country, region, is_liv, is_longshot, is_senior, odds, world_ranking, tour) values
  ('Hideki Matsuyama',     'Japan', 'asian', false, false, false, 1400, 6, 'pga'),
  ('Tom Kim',              'South Korea', 'asian', false, false, false, 4000, 17, 'pga'),
  ('Sungjae Im',           'South Korea', 'asian', false, false, false, 5000, 25, 'pga'),
  ('Byeong Hun An',        'South Korea', 'asian', false, true,  false, 10000, 40, 'pga'),
  ('Min Woo Lee',          'Australia', 'asian', false, false, false, 5000, 20, 'pga'),
  ('Si Woo Kim',           'South Korea', 'asian', false, true,  false, 10000, 38, 'pga'),
  ('Takumi Kanaya',        'Japan', 'asian', false, true,  false, 20000, 55, 'pga'),
  ('Keita Nakajima',       'Japan', 'asian', false, true,  false, 25000, 70, 'pga'),
  ('Ryo Hisatsune',        'Japan', 'asian', false, true,  false, 15000, 45, 'pga'),
  ('Tom McKibbin',         'Northern Ireland', 'european', false, true, false, 10000, 35, 'pga'),
  ('Jason Day',            'Australia', 'other', false, false, false, 5000, 30, 'pga'),
  ('Adam Scott',           'Australia', 'other', false, false, false, 8000, 40, 'pga'),
  ('Cameron Young',        'USA', 'usa', false, true, false, 10000, 42, 'pga')
on conflict (name) do update set
  country = excluded.country,
  region = excluded.region,
  is_liv = excluded.is_liv,
  is_longshot = excluded.is_longshot,
  is_senior = excluded.is_senior,
  odds = excluded.odds,
  world_ranking = excluded.world_ranking,
  tour = excluded.tour,
  updated_at = now();

-- LIV golfers
insert into public.golfers (name, country, region, is_liv, is_longshot, is_senior, odds, world_ranking, tour) values
  ('Bryson DeChambeau',    'USA', 'usa', true, false, false, 2000, 7, 'liv'),
  ('Jon Rahm',             'Spain', 'european', true, false, false, 1600, 4, 'liv'),
  ('Brooks Koepka',        'USA', 'usa', true, false, false, 3000, 15, 'liv'),
  ('Dustin Johnson',       'USA', 'usa', true, false, false, 8000, 50, 'liv'),
  ('Cameron Smith',        'Australia', 'other', true, false, false, 3500, 13, 'liv'),
  ('Joaquín Niemann',      'Chile', 'other', true, false, false, 5000, 20, 'liv'),
  ('Tyrrell Hatton',       'England', 'european', true, false, false, 3000, 10, 'liv'),
  ('Patrick Reed',         'USA', 'usa', true, false, false, 10000, 55, 'liv'),
  ('Sergio Garcia',        'Spain', 'european', true, false, false, 15000, 60, 'liv'),
  ('Charl Schwartzel',     'South Africa', 'other', true, false, false, 25000, 80, 'liv'),
  ('Phil Mickelson',       'USA', 'usa', true, false, true,  25000, null, 'liv'),
  ('Bubba Watson',         'USA', 'usa', true, false, false, 20000, null, 'liv'),
  ('Danny Willett',        'England', 'european', true, false, false, 20000, 70, 'liv')
on conflict (name) do update set
  country = excluded.country,
  region = excluded.region,
  is_liv = excluded.is_liv,
  is_longshot = excluded.is_longshot,
  is_senior = excluded.is_senior,
  odds = excluded.odds,
  world_ranking = excluded.world_ranking,
  tour = excluded.tour,
  updated_at = now();

-- Senior / Fossils (past champions aged 50+)
insert into public.golfers (name, country, region, is_liv, is_longshot, is_senior, odds, world_ranking, tour) values
  ('Fred Couples',         'USA', 'usa', false, false, true, 50000, null, 'pga'),
  ('Bernhard Langer',      'Germany', 'european', false, false, true, 50000, null, 'pga'),
  ('José María Olazábal',  'Spain', 'european', false, false, true, 50000, null, 'pga'),
  ('Ángel Cabrera',        'Argentina', 'other', false, false, true, 50000, null, 'pga'),
  ('Vijay Singh',          'Fiji', 'other', false, false, true, 50000, null, 'pga'),
  ('Mike Weir',            'Canada', 'usa', false, false, true, 50000, null, 'pga'),
  ('Zach Johnson',         'USA', 'usa', false, false, true, 50000, null, 'pga'),
  ('Martin Kaymer',        'Germany', 'european', false, false, true, 50000, null, 'pga'),
  ('Shaun Micheel',        'USA', 'usa', false, false, true, 50000, null, 'pga'),
  ('Luke Donald',          'England', 'european', false, false, true, 50000, null, 'pga'),
  ('Richard Bland',        'England', 'european', false, false, true, 50000, null, 'pga'),
  ('Padraig Harrington',   'Ireland', 'european', false, false, true, 50000, null, 'pga')
on conflict (name) do update set
  country = excluded.country,
  region = excluded.region,
  is_liv = excluded.is_liv,
  is_longshot = excluded.is_longshot,
  is_senior = excluded.is_senior,
  odds = excluded.odds,
  world_ranking = excluded.world_ranking,
  tour = excluded.tour,
  updated_at = now();
