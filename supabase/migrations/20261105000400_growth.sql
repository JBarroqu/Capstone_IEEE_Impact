-- Module 3: Activity, Evidence & Growth (owner Christina Phan). docs/modules/growth.md, docs/SCORING.md
create table growth.evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  selected_move_id uuid not null references wish.selected_moves (id) on delete cascade,
  revision_of uuid references growth.evidence (id),
  skill_id text not null,
  activity_type text not null,
  difficulty text not null,
  difficulty_final text,
  artifact_type text not null check (artifact_type in ('link', 'file', 'text')),
  artifact_url text,
  storage_path text,
  file_name text,
  file_mime text,
  summary text not null check (char_length(summary) <= 4000),
  status text not null default 'scoring'
    check (status in ('scoring', 'ai_scored', 'awaiting_review', 'validated', 'needs_work', 'ai_error', 'withdrawn')),
  ai_score numeric,
  ai_confidence numeric,
  ai_feedback text,
  ai_criteria jsonb,
  ai_provider text,
  ai_model text,
  rubric_version text,
  final_quality numeric,
  peer_confirmed boolean,
  rules_version text,
  created_at timestamptz not null default now(),
  finalized_at timestamptz
);
create index evidence_user_idx on growth.evidence (user_id, created_at desc);
create index evidence_move_idx on growth.evidence (selected_move_id);
create index evidence_status_idx on growth.evidence (status);

-- Append-only points ledger. Each row keeps the rules version and the policies in force when it was written.
create table growth.score_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('effort', 'provisional', 'validated', 'reversal')),
  points numeric(8, 2) not null,
  evidence_id uuid references growth.evidence (id) on delete cascade,
  selected_move_id uuid,
  skill_id text,
  reason_code text not null,
  rules_version text not null,
  policy_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index score_events_user_idx on growth.score_events (user_id, created_at);
create unique index score_events_once on growth.score_events (evidence_id, kind) where kind in ('provisional', 'validated');
create unique index score_events_effort_once on growth.score_events (selected_move_id, kind) where kind = 'effort' and selected_move_id is not null;

create table growth.unlocks (
  user_id uuid not null references auth.users (id) on delete cascade,
  opportunity_id text not null,
  tier text not null,
  source_evidence_id uuid,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, opportunity_id)
);

create table growth.endorsements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  skill_id text not null,
  tier text not null default 'Verified',
  note text,
  created_by text not null default 'admin',
  created_at timestamptz not null default now()
);

alter table growth.evidence enable row level security;
alter table growth.score_events enable row level security;
alter table growth.unlocks enable row level security;
alter table growth.endorsements enable row level security;

alter table profile.contributions add constraint contributions_evidence_fk foreign key (evidence_id) references growth.evidence (id) on delete set null;
