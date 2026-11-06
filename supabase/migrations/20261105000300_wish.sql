-- Module 2: Wish & Next Move (owner Waleed). docs/modules/wish.md
create table wish.wishes (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  text text not null default '',
  from_chip boolean not null default false,
  type text,
  focus jsonb,
  domains jsonb,
  guessed_type text,
  guessed_focus jsonb,
  guessed_domains jsonb,
  archetype text,
  why text,
  prior_attempts jsonb,
  follow_ups jsonb,
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  current_step int not null default 1,
  profile_version int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index wishes_user_idx on wish.wishes (user_id, created_at desc);

-- Every option shown (replaces the Wish Engine's generated_moves). payload = the full move incl. its scoring tags.
create table wish.moves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  wish_id uuid not null references wish.wishes (id) on delete cascade,
  move_key text not null,
  step int not null,
  position int not null,
  reroll_index int not null default 0,
  payload jsonb not null,
  provider text,
  model text,
  prompt_version text,
  latency_ms int,
  created_at timestamptz not null default now()
);
create index moves_wish_idx on wish.moves (wish_id, step);

create table wish.selected_moves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  wish_id uuid not null references wish.wishes (id) on delete cascade,
  move_id uuid not null references wish.moves (id),
  step int not null,
  contract jsonb not null,
  skill_id text,
  activity_type text,
  difficulty text,
  status text not null default 'active'
    check (status in ('active', 'evidence_submitted', 'awaiting_review', 'validated', 'needs_work', 'abandoned')),
  selected_at timestamptz not null default now(),
  closed_at timestamptz
);
create index selected_moves_user_idx on wish.selected_moves (user_id, selected_at desc);
create index selected_moves_wish_idx on wish.selected_moves (wish_id, step);

alter table wish.wishes enable row level security;
alter table wish.moves enable row level security;
alter table wish.selected_moves enable row level security;
