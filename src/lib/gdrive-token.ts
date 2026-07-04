import { decrypt, encrypt } from "./crypto";
import { refreshTokens } from "./gdrive";
import { createServiceClient } from "./supabase/server";

// Returns a valid (refreshing if needed) Drive access token for the user,
// or null if Drive isn't connected or the refresh token no longer works.
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const service = createServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select(
      "gdrive_connected, gdrive_access_token, gdrive_refresh_token, gdrive_token_expires_at"
    )
    .eq("id", userId)
    .single();

  if (!profile?.gdrive_connected || !profile.gdrive_access_token) return null;

  const expiresAt = profile.gdrive_token_expires_at
    ? new Date(profile.gdrive_token_expires_at).getTime()
    : 0;
  if (Date.now() <= expiresAt - 60_000) {
    return decrypt(profile.gdrive_access_token);
  }

  if (!profile.gdrive_refresh_token) return null;
  try {
    const t = await refreshTokens(decrypt(profile.gdrive_refresh_token));
    await service
      .from("profiles")
      .update({
        gdrive_access_token: encrypt(t.access_token),
        gdrive_token_expires_at: new Date(
          Date.now() + t.expires_in * 1000
        ).toISOString(),
      })
      .eq("id", userId);
    return t.access_token;
  } catch {
    await service
      .from("profiles")
      .update({ gdrive_connected: false })
      .eq("id", userId);
    return null;
  }
}
