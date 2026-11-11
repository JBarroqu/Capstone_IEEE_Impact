-- Module 1: Professional State (owner Cfoley5). docs/modules/profile.md
create table profile.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  handle citext unique check (handle ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null default '' check (char_length(display_name) <= 80),
  headline text not null default '' check (char_length(headline) <= 120),
  bio text not null default '' check (char_length(bio) <= 1000),
  education jsonb not null default '{}'::jsonb,
  position text not null default '' check (char_length(position) <= 80),
  target_career_id text,
  skills text[] not null default '{}',
  interests text[] not null default '{}',
  strengths text[] not null default '{}',
  growth_areas text[] not null default '{}',
  onboarding_completed_at timestamptz,
  last_seen_at timestamptz,
  previous_seen_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table profile.contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  type text not null default 'project' check (type in ('project', 'coursework', 'professional', 'other')),
  description text not null default '' check (char_length(description) <= 1000),
  verification_status text not null default 'self_reported' check (verification_status in ('self_reported', 'verified')),
  evidence_id uuid,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index contributions_user_idx on profile.contributions (user_id, position);

create table profile.resume_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text,
  mime text,
  size_bytes int,
  status text not null default 'uploaded' check (status in ('uploaded', 'parsed', 'failed', 'applied', 'discarded')),
  text_chars int,
  draft jsonb,
  provider text,
  model text,
  prompt_version text,
  error text,
  created_at timestamptz not null default now()
);

-- Every new auth user gets an (empty) profile row, so the API never creates one on a GET.
create or replace function profile.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into profile.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function profile.handle_new_user();

alter table profile.profiles enable row level security;
alter table profile.contributions enable row level security;
alter table profile.resume_imports enable row level security;
