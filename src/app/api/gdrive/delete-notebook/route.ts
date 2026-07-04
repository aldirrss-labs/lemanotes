import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/gdrive-token";
import { deleteFile } from "@/lib/gdrive";
import type { Notebook } from "@/lib/types";

// Permanently deletes a notebook, its sub-notebooks, and all notes inside them:
// removes the notebook's Drive folder (which takes its contents with it), then
// removes the note and notebook rows.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { notebookId } = (await req.json()) as { notebookId?: string };
  if (!notebookId) {
    return NextResponse.json({ message: "notebookId is required." }, { status: 400 });
  }

  // RLS scopes this to the caller's own notebooks.
  const { data: notebooksData } = await supabase
    .from("notebooks")
    .select("id, parent_id, gdrive_folder_id");
  const notebooks = (notebooksData ?? []) as Pick<
    Notebook,
    "id" | "parent_id" | "gdrive_folder_id"
  >[];

  const target = notebooks.find((nb) => nb.id === notebookId);
  if (!target) {
    return NextResponse.json({ message: "Notebook not found." }, { status: 404 });
  }

  // Collect this notebook and all its descendants.
  const removed = new Set<string>([notebookId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const nb of notebooks) {
      if (nb.parent_id && removed.has(nb.parent_id) && !removed.has(nb.id)) {
        removed.add(nb.id);
        changed = true;
      }
    }
  }
  const removedIds = Array.from(removed);

  // Drive removes a folder's contents automatically when the folder itself is
  // deleted, so only the top-level notebook's Drive folder needs deleting.
  const accessToken = await getValidAccessToken(user.id);
  if (accessToken && target.gdrive_folder_id) {
    try {
      await deleteFile(accessToken, target.gdrive_folder_id);
    } catch (e) {
      console.error("Failed to delete Drive folder for notebook", notebookId, e);
    }
  }

  await supabase.from("notes").delete().in("notebook_id", removedIds);
  await supabase.from("notebooks").delete().in("id", removedIds);

  return NextResponse.json({ ok: true, removedIds });
}
