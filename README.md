# LemaNotes

**LemaNotes** — aplikasi catatan bergaya Joplin/OneNote: **notebook + sub-notebook bertingkat**, editor **markdown**, **import/export .md**, dan **backup satu arah ke Google Drive**. Multi-user, data di **Supabase**, siap deploy ke **Vercel**.

## Fitur

- Autentikasi email/password (Supabase Auth)
- Notebook & sub-notebook tak terbatas kedalaman (tree)
- Editor markdown live-preview (@uiw/react-md-editor)
- Tags per catatan
- Import satu/banyak `.md`; export per-catatan atau semua (`.zip`) dengan frontmatter (kompatibel Joplin/Obsidian)
- Backup satu arah ke Google Drive per-user (tiap user connect akun Drive sendiri)
- Struktur folder di Drive mengikuti hierarki notebook, di dalam folder `LemaNotes`
- Token Google disimpan terenkripsi AES-256-GCM; auto-refresh saat sync
- Row Level Security: tiap user hanya bisa akses datanya sendiri

## Prasyarat

- Node.js 18.18+ (disarankan 20+)
- Akun Supabase
- Akun Vercel (untuk deploy)
- Akun Google + project di Google Cloud Console (untuk backup)

## Setup

### 1. Install

```bash
npm install
```

### 2. Supabase

1. Buat project baru di https://supabase.com (region: Southeast Asia / Singapore).
2. Buka **SQL Editor**, jalankan seluruh isi `supabase/schema.sql`.
3. **Authentication → Sign In / Providers → Email**: untuk dev, matikan "Confirm email" agar bisa langsung login setelah daftar.
4. **Project Settings → API**, ambil:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role key → `SUPABASE_SERVICE_ROLE_KEY` (rahasia, server-only)

### 3. Environment variables

```bash
cp .env.example .env
```

Generate kunci enkripsi:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Tempel hasilnya ke `TOKEN_ENCRYPTION_KEY`. Kolom Google boleh dikosongkan dulu bila belum mau setup backup.

### 4. Jalankan

```bash
npm run dev
```

Buka http://localhost:3000 → Daftar → mulai membuat notebook & catatan. Semua fitur notes (termasuk import/export `.md`) berfungsi penuh tanpa Google Drive.

## Google Drive (backup) — bisa dites lokal tanpa approval

Backup memakai scope **`drive.file`** (non-sensitive): app hanya mengakses file/folder yang IA sendiri buat. Untuk testing lokal, OAuth app cukup dalam status **Testing** — tidak butuh verifikasi apa pun.

### Setup Google OAuth

1. Buka https://console.cloud.google.com → buat project baru (mis. "lemanotes").
2. **APIs & Services → Library** → cari **Google Drive API** → **Enable**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External** → Create
   - Isi app name, support email, developer email → Save
   - **Audience/Test users**: tambahkan alamat Gmail yang akan kamu pakai untuk tes. (Di mode Testing, hanya email ini yang boleh authorize.)
   - Publishing status biarkan **Testing**.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorized redirect URIs** → tambahkan: `http://localhost:3000/api/gdrive/callback`
   - Create → salin **Client ID** & **Client secret**.
5. Isi `.env`:
   ```
   GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=xxxx
   GOOGLE_REDIRECT_URI=http://localhost:3000/api/gdrive/callback
   ```
6. Restart `npm run dev` → di sidebar klik **Hubungkan Google Drive** → login pakai email test yang tadi didaftarkan → izinkan → kembali ke app.
7. Klik **Sync sekarang**. Cek Google Drive: akan muncul folder `LemaNotes` berisi struktur notebook & file `.md`.

> Catatan: di mode Testing, refresh token bisa kadaluarsa lebih cepat (±7 hari). Untuk pemakaian jangka panjang / publik, ubah publishing status ke **In production** — karena pakai `drive.file` (non-sensitive), ini hanya butuh **basic verification**, bukan security assessment.

## Deploy ke Vercel

1. Push repo ke GitHub, import di Vercel.
2. Tambahkan semua env dari `.env` ke **Vercel → Settings → Environment Variables**.
3. Set `GOOGLE_REDIRECT_URI` & `NEXT_PUBLIC_APP_URL` ke domain produksi, mis. `https://notes.lemacore.com/...` dan daftarkan redirect URI itu juga di Google Cloud Console (Authorized redirect URIs).
4. Custom domain: **Vercel → Settings → Domains** → tambah `notes.lemacore.com`, lalu buat record **CNAME** `notes` → `cname.vercel-dns.com` di DNS `lemacore.com`.
5. Cron di `vercel.json` (harian) otomatis aktif; Vercel mengirim `Authorization: Bearer <CRON_SECRET>` bila env `CRON_SECRET` diset.

## Struktur

```
src/
  app/
    login/ signup/              # auth pages
    workspace/                  # UI utama (server page)
    api/gdrive/connect|callback|sync/
    api/cron/refresh-gdrive-tokens/
  components/
    workspace.tsx               # state + CRUD + import/export
    notebook-tree.tsx           # tree rekursif
    note-editor.tsx             # editor markdown
  lib/
    supabase/                   # client, server, middleware
    crypto.ts                   # AES-256-GCM
    markdown.ts                 # frontmatter serialize/parse
    gdrive.ts                   # OAuth + upload Drive
    types.ts
supabase/schema.sql             # skema + RLS + trigger
vercel.json                     # cron
```

## Cara kerja backup (ringkas)

- Token Google (access + refresh) disimpan terenkripsi di tabel `profiles`.
- Saat **Sync sekarang**: bila access token (umur ~1 jam) hampir habis, di-refresh otomatis pakai refresh token.
- Folder `LemaNotes` dibuat di Drive; tiap notebook → subfolder (id disimpan di kolom `gdrive_folder_id`).
- Tiap catatan → file `.md` (id disimpan di `gdrive_file_id`); sync berikutnya meng-update file yang sama, bukan menduplikasi.
- Hanya catatan yang berubah sejak `last_synced_at` yang diunggah.

## Roadmap singkat

- Drag-and-drop pindah notebook/catatan
- Full-text search
- Trash view (memanfaatkan `deleted_at`)
- Riwayat sync di UI (tabel `sync_logs` sudah ada)
