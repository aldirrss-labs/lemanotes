-- =============================================================
--  Notes App - Supabase schema
--  Jalankan di Supabase SQL Editor (satu kali saat setup)
-- =============================================================

-- ---------- PROFILES ----------
-- Menyimpan info user + kredensial Google Drive (terenkripsi di app layer).
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  gdrive_connected boolean not null default false,
  gdrive_access_token text,         -- ciphertext AES-256-GCM
  gdrive_refresh_token text,        -- ciphertext AES-256-GCM
  gdrive_token_expires_at timestamptz,
  gdrive_root_folder_id text,       -- id folder "LemaNotes" di Drive user
  created_at timestamptz not null default now()
);

-- ---------- NOTEBOOKS (nested / sub-notebook) ----------
create table if not exists public.notebooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.notebooks(id) on delete cascade, -- null = root
  name text not null,
  sort_order int not null default 0,
  gdrive_folder_id text,                  -- id folder padanan di Drive
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_notebooks_user on public.notebooks(user_id);
create index if not exists idx_notebooks_parent on public.notebooks(parent_id);

-- ---------- NOTES ----------
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  notebook_id uuid references public.notebooks(id) on delete set null,
  title text not null default 'Untitled',
  content_markdown text not null default '',
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,                 -- soft delete
  last_synced_at timestamptz,             -- terakhir backup ke Drive
  gdrive_file_id text                     -- id file .md padanan di Drive
);
create index if not exists idx_notes_user on public.notes(user_id);
create index if not exists idx_notes_notebook on public.notes(notebook_id);
create index if not exists idx_notes_updated on public.notes(updated_at);

-- ---------- SYNC LOGS ----------
create table if not exists public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  note_id uuid references public.notes(id) on delete cascade,
  status text not null check (status in ('success','failed')),
  message text,
  synced_at timestamptz not null default now()
);
create index if not exists idx_sync_logs_user on public.sync_logs(user_id);

-- =============================================================
--  updated_at trigger
-- =============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_notebooks_updated on public.notebooks;
create trigger trg_notebooks_updated before update on public.notebooks
  for each row execute function public.set_updated_at();

drop trigger if exists trg_notes_updated on public.notes;
create trigger trg_notes_updated before update on public.notes
  for each row execute function public.set_updated_at();

-- =============================================================
--  Auto-create profile saat user baru mendaftar
-- =============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================
--  Row Level Security
-- =============================================================
alter table public.profiles   enable row level security;
alter table public.notebooks  enable row level security;
alter table public.notes      enable row level security;
alter table public.sync_logs  enable row level security;

-- profiles: user hanya lihat/ubah miliknya
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- notebooks
drop policy if exists "notebooks_all_own" on public.notebooks;
create policy "notebooks_all_own" on public.notebooks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- notes
drop policy if exists "notes_all_own" on public.notes;
create policy "notes_all_own" on public.notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- sync_logs (biasanya ditulis service-role, dibaca user)
drop policy if exists "sync_logs_select_own" on public.sync_logs;
create policy "sync_logs_select_own" on public.sync_logs
  for select using (auth.uid() = user_id);

-- Catatan: kolom gdrive_* & operasi cron ditulis pakai service-role key
-- (bypass RLS) dari server. Client tidak pernah membaca kolom token.
