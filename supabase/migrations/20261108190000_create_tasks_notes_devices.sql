-- Tasks, Notes and devices for Sync.
--
-- A Note is the Markdown file that lives in the user's Vault; this table only
-- carries its synced metadata and content. A device is either the Home (where
-- the Vault lives) or a Satellite (any other device holding a synced copy).
--
-- Timestamps are for display and ordering only. Sync conflicts are decided by
-- `version`, never by `updated_at`.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- The trigger function is an implementation detail, not an RPC endpoint.
revoke all on function public.set_updated_at() from public;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  done boolean not null default false,
  due date,
  version integer not null default 1 check (version > 0),
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_user_id_idx on public.tasks (user_id);
create index tasks_user_id_updated_at_idx on public.tasks (user_id, updated_at);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  path text not null check (length(trim(path)) > 0),
  content text not null default '',
  version integer not null default 1 check (version > 0),
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notes_user_id_path_key unique (user_id, path)
);

create index notes_user_id_idx on public.notes (user_id);
create index notes_user_id_updated_at_idx on public.notes (user_id, updated_at);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  kind text not null check (kind in ('home', 'satellite')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index devices_user_id_idx on public.devices (user_id);

-- The Home is fixed in v1: at most one per user.
create unique index devices_user_id_home_key on public.devices (user_id) where kind = 'home';

create trigger set_updated_at before update on public.tasks
for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.notes
for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.devices
for each row execute function public.set_updated_at();

alter table public.tasks enable row level security;
alter table public.notes enable row level security;
alter table public.devices enable row level security;

-- Every table is private to its owner. Unauthenticated requests have no
-- business with these tables, so they get no grants at all.
revoke all on public.tasks from anon;
revoke all on public.notes from anon;
revoke all on public.devices from anon;

grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.notes to authenticated;
grant select, insert, update, delete on public.devices to authenticated;

create policy "Users can read their own tasks"
on public.tasks for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own tasks"
on public.tasks for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own tasks"
on public.tasks for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own tasks"
on public.tasks for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own notes"
on public.notes for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own notes"
on public.notes for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own notes"
on public.notes for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own notes"
on public.notes for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own devices"
on public.devices for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own devices"
on public.devices for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own devices"
on public.devices for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own devices"
on public.devices for delete
to authenticated
using ((select auth.uid()) = user_id);
