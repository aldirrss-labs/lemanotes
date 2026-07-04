import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { refreshTokens } from "@/lib/gdrive";
import { encrypt, decrypt } from "@/lib/crypto";

// Called by Vercel Cron (see vercel.json). Protected by CRON_SECRET.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();

  // Tokens are mainly refreshed on-demand by the sync route. This daily cron
  // just tidies up: refresh ones close to expiry & flag ones that were revoked.
  const threshold = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { data: profiles } = await service
    .from("profiles")
    .select("id, gdrive_refresh_token, gdrive_token_expires_at")
    .eq("gdrive_connected", true)
    .lt("gdrive_token_expires_at", threshold);

  let refreshed = 0;
  let failed = 0;
  for (const p of profiles ?? []) {
    if (!p.gdrive_refresh_token) continue;
    try {
      const t = await refreshTokens(decrypt(p.gdrive_refresh_token));
      await service
        .from("profiles")
        .update({
          gdrive_access_token: encrypt(t.access_token),
          gdrive_token_expires_at: new Date(
            Date.now() + t.expires_in * 1000
          ).toISOString(),
        })
        .eq("id", p.id);
      refreshed++;
    } catch (e) {
      console.error("Refresh failed for", p.id, e);
      // Refresh token revoked/expired -> flag as needing reconnect.
      await service
        .from("profiles")
        .update({ gdrive_connected: false })
        .eq("id", p.id);
      failed++;
    }
  }

  return NextResponse.json({ refreshed, failed });
}
