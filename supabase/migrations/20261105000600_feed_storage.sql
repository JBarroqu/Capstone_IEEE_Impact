-- Module 5: Opportunity & Event Return (owner JBarroqu). docs/modules/feed.md
create table feed.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null check (category in ('Social', 'Pro', 'Enablement', 'Impact', 'Events', 'Growth')),
  kind text not null,
  title text not null,
  body text not null default '',
  link text,
  source_module text not null,
  source_id uuid,
  dedupe_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on feed.notifications (user_id, created_at desc);
create index notifications_unread_idx on feed.notifications (user_id) where read_at is null;

alter table feed.notifications enable row level security;

-- Private storage buckets; only the API (service key) touches them (docs/SECURITY.md).
insert into storage.buckets (id, name, public, file_size_limit)
values ('resumes', 'resumes', false, 5242880), ('evidence', 'evidence', false, 10485760)
on conflict (id) do nothing;
