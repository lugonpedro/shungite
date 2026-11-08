-- Row Level Security for tasks, notes and devices.
--
-- Run with `supabase test db`. Two users are created, then every query is
-- executed as the `authenticated` role with a JWT subject, exactly like
-- PostgREST does for a real request.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(15);

-- Two users, as GoTrue would have created them.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
  (
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'alice@example.com',
    now(),
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-0000000000b1',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'bob@example.com',
    now(),
    now(),
    now()
  );

insert into public.tasks (id, user_id, title, done, due, version, updated_at)
values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', 'Alice task', false, '2026-11-10', 1, '2000-01-01T00:00:00Z'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1', 'Bob task', true, null, 1, '2000-01-01T00:00:00Z');

insert into public.notes (id, user_id, path, content)
values
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', 'Notes/Alice.md', '# Alice'),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000b1', 'Notes/Bob.md', '# Bob');

insert into public.devices (id, user_id, name, kind)
values
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000a1', 'Mac', 'home'),
  ('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b1', 'iPhone', 'satellite');

-- Everything below runs as Alice.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select is(
  (select count(*)::int from public.tasks),
  1,
  'Alice only sees her own Task'
);

select is(
  (select count(*)::int from public.notes),
  1,
  'Alice only sees her own Note'
);

select is(
  (select count(*)::int from public.devices),
  1,
  'Alice only sees her own device'
);

select is(
  (select count(*)::int from public.tasks where id = '00000000-0000-0000-0000-0000000000b2'),
  0,
  'Bob Task is invisible to Alice'
);

select throws_ok(
  $$ insert into public.tasks (user_id, title) values ('00000000-0000-0000-0000-0000000000b1', 'stolen') $$,
  '42501',
  null,
  'Alice cannot insert a Task owned by Bob'
);

select lives_ok(
  $$ insert into public.tasks (user_id, title) values ('00000000-0000-0000-0000-0000000000a1', 'New task') $$,
  'Alice can insert her own Task'
);

-- These three statements must touch nothing: RLS filters Bob's rows out.
update public.tasks set title = 'hacked' where id = '00000000-0000-0000-0000-0000000000b2';
delete from public.tasks where id = '00000000-0000-0000-0000-0000000000b2';
update public.notes set content = 'hijacked' where id = '00000000-0000-0000-0000-0000000000b3';

select lives_ok(
  $$ update public.tasks set title = 'Alice task edited' where id = '00000000-0000-0000-0000-0000000000a2' $$,
  'Alice can update her own Task'
);

select is(
  (select updated_at > '2001-01-01T00:00:00Z' from public.tasks where id = '00000000-0000-0000-0000-0000000000a2'),
  true,
  'updated_at trigger overwrites an old timestamp on update'
);

select throws_ok(
  $$ update public.tasks set user_id = '00000000-0000-0000-0000-0000000000b1' where id = '00000000-0000-0000-0000-0000000000a2' $$,
  '42501',
  null,
  'Alice cannot give her Task to Bob'
);

-- Everything below runs as Bob, who can see whether Alice's attempts changed
-- anything.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

select is(
  (select title from public.tasks where id = '00000000-0000-0000-0000-0000000000b2'),
  'Bob task',
  'Alice update did not change Bob Task'
);

select is(
  (select count(*)::int from public.tasks where id = '00000000-0000-0000-0000-0000000000b2'),
  1,
  'Alice delete did not remove Bob Task'
);

select is(
  (select content from public.notes where id = '00000000-0000-0000-0000-0000000000b3'),
  '# Bob',
  'Alice update did not change Bob Note'
);

select is(
  (select count(*)::int from public.tasks),
  1,
  'Bob only sees his own Task'
);

select is(
  (select count(*)::int from public.notes where id = '00000000-0000-0000-0000-0000000000a3'),
  0,
  'Alice Note is invisible to Bob'
);

-- Without an account there is no grant at all on these tables.
reset role;
set local role anon;
select throws_ok(
  $$ select * from public.tasks $$,
  '42501',
  null,
  'anonymous requests cannot read Tasks'
);

reset role;
select * from finish();

rollback;
