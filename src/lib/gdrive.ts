// Google Drive API helpers using the non-sensitive `drive.file` scope.
// The app can only access files/folders it created itself — enough for backup.
// Docs: https://developers.google.com/workspace/drive/api

const OAUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const SCOPE = "https://www.googleapis.com/auth/drive.file";

export type GoogleTokens = {
  access_token: string;
  refresh_token?: string; // only present on first consent
  expires_in: number; // seconds
};

// URL to redirect the user to Google's consent screen.
export function buildAuthorizeUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: process.env.GOOGLE_REDIRECT_URI ?? "",
    response_type: "code",
    scope: SCOPE,
    access_type: "offline", // so we get a refresh_token
    prompt: "consent", // force refresh_token to appear on every connect
    include_granted_scopes: "true",
    state,
  });
  return `${OAUTH}?${p.toString()}`;
}

// Exchange an authorization code -> tokens.
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
    throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as GoogleTokens;
}

// Refresh the access token. Google does NOT return a new refresh_token,
// so the old refresh_token keeps being used.
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
    throw new Error(`Google token refresh failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as GoogleTokens;
}

// Find a folder by name under a parent; create it if it doesn't exist.
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
  if (!created.id) throw new Error(`Failed to create folder: ${JSON.stringify(created)}`);
  return created.id as string;
}

// Create/update a .md file. Returns the fileId.
// If existingFileId is stale (404), a new file is created automatically.
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
    if (!json.id) throw new Error(`Failed to update file: ${JSON.stringify(json)}`);
    return json.id as string;
  }

  const res = await fetch(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: "POST",
    headers,
    body,
  });
  const json = await res.json();
  if (!json.id) throw new Error(`Failed to create file: ${JSON.stringify(json)}`);
  return json.id as string;
}

export type DriveEntry = { id: string; name: string; isFolder: boolean };

// List the immediate (non-trashed) children of a folder.
export async function listFolder(
  accessToken: string,
  parentId: string
): Promise<DriveEntry[]> {
  const entries: DriveEntry[] = [];
  let pageToken: string | undefined;
  do {
    const q = `'${parentId}' in parents and trashed=false`;
    const params = new URLSearchParams({
      q,
      fields: "nextPageToken, files(id,name,mimeType)",
      spaces: "drive",
      pageSize: "1000",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(`${DRIVE}/files?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(`Failed to list Drive folder: ${JSON.stringify(json)}`);
    }
    for (const f of json.files ?? []) {
      entries.push({
        id: f.id,
        name: f.name,
        isFolder: f.mimeType === FOLDER_MIME,
      });
    }
    pageToken = json.nextPageToken;
  } while (pageToken);
  return entries;
}

// Find a folder by name under a parent without creating it. Returns null if absent.
export async function findFolder(
  accessToken: string,
  name: string,
  parentId: string | null
): Promise<string | null> {
  const parentClause = parentId ? ` and '${parentId}' in parents` : "";
  const q = `mimeType='${FOLDER_MIME}' and name='${escapeQuery(name)}' and trashed=false${parentClause}`;
  const res = await fetch(
    `${DRIVE}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const json = await res.json();
  if (Array.isArray(json.files) && json.files.length > 0) {
    return json.files[0].id as string;
  }
  return null;
}

// Download a file's raw text content.
export async function downloadFile(
  accessToken: string,
  fileId: string
): Promise<string> {
  const res = await fetch(`${DRIVE}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to download file ${fileId}: ${res.status} ${await res.text()}`);
  }
  return res.text();
}

// Delete a file or folder from Drive. Deleting a folder also removes everything
// inside it. A 404 (already gone) is treated as success.
export async function deleteFile(accessToken: string, fileId: string): Promise<void> {
  const res = await fetch(`${DRIVE}/files/${fileId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete from Drive: ${res.status} ${await res.text()}`);
  }
}

// Escape quotes for a Drive query.
function escapeQuery(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
