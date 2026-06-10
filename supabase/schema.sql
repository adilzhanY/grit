-- grit cloud sync schema.
-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
--
-- Every table is a generic mirror of a local Dexie table:
--   user_id    the owner (auth.users); rows are private per user via RLS
--   id         the original row id from the app (text)
--   data       the full row as JSON (keeps nested fields: subtasks, recurrence…)
--   updated_at last change time, for last-write-wins delta sync
--   deleted    a tombstone flag so deletes propagate across devices
--
-- Re-running is safe (IF NOT EXISTS / OR REPLACE).

create extension if not exists "pgcrypto";

do $$
declare
  t text;
  tables text[] := array[
    'tasks', 'completions', 'ledger', 'settings',
    'lists', 'foods', 'day_logs', 'focus'
  ];
begin
  foreach t in array tables loop
    execute format($f$
      create table if not exists public.%I (
        user_id    uuid        not null references auth.users(id) on delete cascade,
        id         text        not null,
        data       jsonb       not null default '{}'::jsonb,
        updated_at timestamptz not null default now(),
        deleted    boolean     not null default false,
        primary key (user_id, id)
      );
    $f$, t);

    -- Fast "what changed for me since X" queries.
    execute format(
      'create index if not exists %I on public.%I (user_id, updated_at);',
      t || '_user_updated_idx', t
    );

    -- Lock every table to its owner.
    execute format('alter table public.%I enable row level security;', t);

    -- (Re)create the owner-only policy.
    execute format('drop policy if exists "own rows" on public.%I;', t);
    execute format($p$
      create policy "own rows" on public.%I
        for all
        using (auth.uid() = user_id)
        with check (auth.uid() = user_id);
    $p$, t);
  end loop;
end $$;
