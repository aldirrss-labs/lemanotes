import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { syncUserNotesToDrive } from "@/lib/gdrive-sync";

// Called nightly by Vercel Cron (see vercel.json). Protected by CRON_SECRET.
// Backs up every connected user's changed notes to Drive, so a forgotten
// manual "Sync now" doesn't leave the Drive backup stale for a whole day —
// Supabase is always up to date regardless, this only affects the Drive copy.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const { data: profiles } = await service
    .from("profiles")
    .select("id")
    .eq("gdrive_connected", true);

  let usersSynced = 0;
  let usersFailed = 0;
  let notesSynced = 0;
  for (const p of profiles ?? []) {
    try {
      const result = await syncUserNotesToDrive(p.id);
      notesSynced += result.ok;
      usersSynced++;
    } catch (e) {
      console.error("Nightly sync failed for", p.id, e);
      usersFailed++;
    }
  }

  return NextResponse.json({ usersSynced, usersFailed, notesSynced });
}
