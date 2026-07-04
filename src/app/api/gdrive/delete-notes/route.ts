import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/gdrive-token";
import { deleteFile } from "@/lib/gdrive";

// Permanently deletes one or more notes: removes their Drive file (if any),
// then removes the note rows. Used for "delete forever" and "empty trash".
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { noteIds } = (await req.json()) as { noteIds?: string[] };
  if (!Array.isArray(noteIds) || noteIds.length === 0) {
    return NextResponse.json({ message: "noteIds is required." }, { status: 400 });
  }

  // RLS scopes this select/delete to the caller's own notes.
  const { data: notes } = await supabase
    .from("notes")
    .select("id, gdrive_file_id")
    .in("id", noteIds);

  const accessToken = await getValidAccessToken(user.id);
  if (accessToken) {
    for (const note of notes ?? []) {
      if (!note.gdrive_file_id) continue;
      try {
        await deleteFile(accessToken, note.gdrive_file_id);
      } catch (e) {
        console.error("Failed to delete Drive file for note", note.id, e);
      }
    }
  }

  await supabase.from("notes").delete().in("id", noteIds);
  return NextResponse.json({ ok: true });
}
