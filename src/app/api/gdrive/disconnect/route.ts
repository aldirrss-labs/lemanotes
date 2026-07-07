import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

// Disconnects Google Drive: clears stored tokens and connection state.
// Notebook/note rows keep their `gdrive_folder_id`/`gdrive_file_id` links so
// that reconnecting resumes syncing to the same Drive files instead of
// creating duplicates.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { error } = await service
    .from("profiles")
    .update({
      gdrive_connected: false,
      gdrive_access_token: null,
      gdrive_refresh_token: null,
      gdrive_token_expires_at: null,
    })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
