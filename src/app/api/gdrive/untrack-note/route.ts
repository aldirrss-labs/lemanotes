import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/gdrive-token";
import { deleteFile } from "@/lib/gdrive";

// Removes a note's Drive file without deleting the note row itself — used
// when a note is moved to trash. The row stays (so it can be restored), but
// the cloud backup disappears immediately instead of waiting to be purged.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { noteId } = (await req.json()) as { noteId?: string };
  if (!noteId) {
    return NextResponse.json({ message: "noteId is required." }, { status: 400 });
  }

  // RLS scopes this to the caller's own note.
  const { data: note } = await supabase
    .from("notes")
    .select("id, gdrive_file_id")
    .eq("id", noteId)
    .single();

  if (note?.gdrive_file_id) {
    const accessToken = await getValidAccessToken(user.id);
    if (accessToken) {
      try {
        await deleteFile(accessToken, note.gdrive_file_id);
      } catch (e) {
        console.error("Failed to delete Drive file for note", noteId, e);
      }
    }
    await supabase
      .from("notes")
      .update({ gdrive_file_id: null, last_synced_at: null })
      .eq("id", noteId);
  }

  return NextResponse.json({ ok: true });
}
