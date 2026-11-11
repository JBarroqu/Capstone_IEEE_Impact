-- Module 4: Human Roles & Social Support (owner Michael Hawes). docs/modules/social.md
-- mike-branch's invite rules: one invite per person per move, one accepted buddy (per role), no self-invite.
create table social.invitations (
  id uuid primary key default gen_random_uuid(),
  selected_move_id uuid not null references wish.selected_moves (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  buddy_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('reviewer', 'tester')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'revoked', 'expired')),
  message text check (char_length(message) <= 500),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (owner_id <> buddy_id),
  unique (selected_move_id, buddy_id)
);
create index invitations_buddy_idx on social.invitations (buddy_id, status);
create index invitations_owner_idx on social.invitations (owner_id, status);

create table social.feedback (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references social.invitations (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  evidence_id uuid references growth.evidence (id) on delete cascade,
  rating smallint check (rating between 1 and 5),
  confirms boolean,
  body text not null default '' check (char_length(body) <= 1000),
  created_at timestamptz not null default now()
);

-- Immutable record handed to growth (SocialEvidence v0.1).
create table social.social_evidence (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null unique references social.feedback (id) on delete cascade,
  evidence_id uuid not null references growth.evidence (id) on delete cascade,
  reviewer_id uuid not null references auth.users (id) on delete cascade,
  reviewer_role text not null,
  reviewer_tier text not null,
  rating smallint,
  confirmed boolean,
  counts_toward_points boolean not null,
  contract jsonb not null,
  created_at timestamptz not null default now()
);

alter table social.invitations enable row level security;
alter table social.feedback enable row level security;
alter table social.social_evidence enable row level security;
