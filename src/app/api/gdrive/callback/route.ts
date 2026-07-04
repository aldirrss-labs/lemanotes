import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { exchangeCodeForTokens } from "@/lib/gdrive";
import { encrypt } from "@/lib/crypto";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/workspace?gdrive=error`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== state) {
    return NextResponse.redirect(`${appUrl}/workspace?gdrive=mismatch`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const expiresAt = new Date(
      Date.now() + tokens.expires_in * 1000
    ).toISOString();

    const service = createServiceClient();
    const update: Record<string, unknown> = {
      gdrive_connected: true,
      gdrive_access_token: encrypt(tokens.access_token),
      gdrive_token_expires_at: expiresAt,
    };
    // refresh_token hanya ada saat consent pertama — jangan timpa dengan kosong.
    if (tokens.refresh_token) {
      update.gdrive_refresh_token = encrypt(tokens.refresh_token);
    }

    await service.from("profiles").update(update).eq("id", user.id);
    return NextResponse.redirect(`${appUrl}/workspace?gdrive=connected`);
  } catch (e) {
    console.error("Google Drive callback error:", e);
    return NextResponse.redirect(`${appUrl}/workspace?gdrive=error`);
  }
}
