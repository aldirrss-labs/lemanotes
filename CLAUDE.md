# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

LemaNotes — aplikasi catatan bergaya Joplin/OneNote (notebook + sub-notebook bertingkat, editor markdown, import/export .md, backup satu arah ke Google Drive). Next.js 15 (App Router) + React 19 + TypeScript, data di Supabase (Postgres + Auth), deploy ke Vercel.

## Commands

```bash
npm run dev      # dev server (http://localhost:3000)
npm run build    # production build
npm run start    # run production build
npm run lint     # next lint
```

There is no test suite configured in this repo.

Database schema lives in `supabase/schema.sql` — it must be run manually in the Supabase SQL Editor (it's not applied via migrations/CLI). Any schema change should be added to this file (it uses `create table if not exists` / `drop policy if exists` so it's safe to re-run).

## Architecture

### Auth & session
- `src/middleware.ts` delegates to `src/lib/supabase/middleware.ts`'s `updateSession`, which refreshes the Supabase session cookie on every request and gate-keeps `/workspace` (redirects to `/login` if unauthenticated) and `/login`/`/signup` (redirects to `/workspace` if already authenticated).
- Auth errors classified as retryable network errors (`isAuthRetryableFetchError`) do NOT force a logout — only a confirmed "no session" from Supabase does. Keep this distinction when touching the middleware.
- `src/lib/supabase/client.ts` / `server.ts` provide the browser vs. server Supabase clients respectively. The service-role client (used for Google token columns and cron jobs) bypasses RLS and must only ever run server-side.

### Data model (`supabase/schema.sql`)
- `profiles` — one row per user (auto-created via `handle_new_user` trigger on signup), holds encrypted Google Drive tokens (`gdrive_access_token`, `gdrive_refresh_token`, both AES-256-GCM ciphertext) and Drive sync metadata (`gdrive_root_folder_id`, `gdrive_connected`).
- `notebooks` — self-referencing tree via `parent_id` (arbitrary nesting depth), each mapped to a Drive folder via `gdrive_folder_id`.
- `notes` — belongs to a notebook (nullable, `on delete set null`), soft-deleted via `deleted_at`, tracks Drive sync state via `last_synced_at` / `gdrive_file_id`.
- `sync_logs` — audit trail of per-note sync attempts, written with the service-role key (bypasses RLS), readable by the owning user.
- RLS is enabled on every table; policies scope all access to `auth.uid() = user_id` (or `= id` for `profiles`). Any new table needs equivalent policies.

### Google Drive backup (one-way, per-user)
- `src/lib/crypto.ts` — AES-256-GCM encrypt/decrypt for tokens at rest, keyed by `TOKEN_ENCRYPTION_KEY`.
- `src/lib/gdrive.ts` — OAuth flow + Drive API calls (create/update folders and files).
- `src/lib/gdrive-token.ts` — token refresh logic (access tokens live ~1h; refreshed via the stored refresh token).
- API routes: `src/app/api/gdrive/connect` (start OAuth), `.../callback` (exchange code, store encrypted tokens), `.../sync` (main sync: mirrors the notebook tree as Drive folders, uploads/updates changed notes as `.md` files under a `LemaNotes` root folder, only notes updated since `last_synced_at` are pushed), `.../delete-notebook` and `.../delete-notes` (mirror deletions to Drive), `.../untrack-note` (drop the Drive linkage without deleting the Drive file).
- `src/app/api/cron/refresh-gdrive-tokens/route.ts` — daily Vercel Cron (`vercel.json`, `0 3 * * *`) that proactively refreshes tokens nearing expiry; protected by `CRON_SECRET` (Vercel sends it as `Authorization: Bearer <CRON_SECRET>`), and is excluded from the auth middleware matcher.
- Auto-sync also runs client-side on an interval (every 5 minutes) from the workspace UI, in addition to the manual "Sync sekarang" action and the daily cron (cron only refreshes tokens, it does not push notes).
- Drive scope used is `drive.file` (non-sensitive) — the app can only see files/folders it created itself.

### Frontend
- `src/components/workspace.tsx` is the core client component: owns all notebook/note state, CRUD, drag/move, import/export (`.md` single or `.zip` via `jszip`), tags, and triggers Drive sync. This is the largest and most central file — read it before making UI/state changes.
- `src/components/notebook-tree.tsx` — recursive tree rendering for nested notebooks.
- `src/components/note-editor.tsx` — markdown editor (Toast UI Editor) with live preview.
- `src/lib/markdown.ts` — frontmatter serialize/parse for import/export, compatible with Joplin/Obsidian `.md` frontmatter conventions.
- `src/lib/types.ts` — shared TypeScript types for notebooks/notes/profile.

## Conventions

- All code (identifiers, comments, commit messages) is written in English; communicate with the user in Indonesian.
- Path alias `@/*` maps to `src/*` (see `tsconfig.json`).
- Server-only secrets (`SUPABASE_SERVICE_ROLE_KEY`, `TOKEN_ENCRYPTION_KEY`, `GOOGLE_CLIENT_SECRET`, `CRON_SECRET`) must never be exposed to the client or prefixed with `NEXT_PUBLIC_`.
