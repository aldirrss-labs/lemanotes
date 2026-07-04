// Helper Google Drive API dengan scope non-sensitive `drive.file`.
// App hanya bisa mengakses file/folder yang IA sendiri buat — cukup untuk backup.
// Docs: https://developers.google.com/workspace/drive/api

const OAUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const SCOPE = "https://www.googleapis.com/auth/drive.file";

export type GoogleTokens = {
  access_token: string;
  refresh_token?: string; // hanya muncul saat consent pertama
  expires_in: number; // detik
};

// URL untuk mengarahkan user ke consent screen Google.
export function buildAuthorizeUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: process.env.GOOGLE_REDIRECT_URI ?? "",
    response_type: "code",
    scope: SCOPE,
    access_type: "offline", // agar dapat refresh_token
    prompt: "consent", // paksa refresh_token muncul tiap connect
    include_granted_scopes: "true",
    state,
  });
  return `${OAUTH}?${p.toString()}`;
}

// Tukar authorization code -> tokens.
export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirect_uri: process.env.GOOGLE_REDIRECT_URI ?? "",
    grant_type: "authorization_code",
  });
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Google token exchange gagal: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as GoogleTokens;
}

// Refresh access token. Google TIDAK mengembalikan refresh_token baru,
// jadi refresh_token lama tetap dipakai.
export async function refreshTokens(refreshToken: string): Promise<GoogleTokens> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Google token refresh gagal: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as GoogleTokens;
}

// Cari folder berdasarkan nama di bawah parent; buat bila belum ada.
export async function ensureFolder(
  accessToken: string,
  name: string,
  parentId: string | null
): Promise<string> {
  const parentClause = parentId ? ` and '${parentId}' in parents` : "";
  const q = `mimeType='${FOLDER_MIME}' and name='${escapeQuery(name)}' and trashed=false${parentClause}`;
  const listRes = await fetch(
    `${DRIVE}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const listJson = await listRes.json();
  if (Array.isArray(listJson.files) && listJson.files.length > 0) {
    return listJson.files[0].id as string;
  }

  const meta: Record<string, unknown> = { name, mimeType: FOLDER_MIME };
  if (parentId) meta.parents = [parentId];
  const createRes = await fetch(`${DRIVE}/files?fields=id`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(meta),
  });
  const created = await createRes.json();
  if (!created.id) throw new Error(`Gagal buat folder: ${JSON.stringify(created)}`);
  return created.id as string;
}

// Buat/perbarui file .md. Mengembalikan fileId.
// Bila existingFileId basi (404), otomatis membuat file baru.
export async function uploadMarkdown(
  accessToken: string,
  opts: {
    name: string;
    parentId: string;
    content: string;
    existingFileId?: string | null;
  }
): Promise<string> {
  const { name, parentId, content, existingFileId } = opts;
  const boundary = "lemanotes" + Math.random().toString(16).slice(2);

  const metadata: Record<string, unknown> = { name };
  if (!existingFileId) metadata.parents = [parentId];

  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: text/markdown; charset=UTF-8\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--`;

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": `multipart/related; boundary=${boundary}`,
  };

  if (existingFileId) {
    const res = await fetch(
      `${UPLOAD}/files/${existingFileId}?uploadType=multipart&fields=id`,
      { method: "PATCH", headers, body }
    );
    if (res.status === 404) {
      return uploadMarkdown(accessToken, { ...opts, existingFileId: null });
    }
    const json = await res.json();
    if (!json.id) throw new Error(`Update file gagal: ${JSON.stringify(json)}`);
    return json.id as string;
  }

  const res = await fetch(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: "POST",
    headers,
    body,
  });
  const json = await res.json();
  if (!json.id) throw new Error(`Create file gagal: ${JSON.stringify(json)}`);
  return json.id as string;
}

// Escape tanda kutip untuk query Drive.
function escapeQuery(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
