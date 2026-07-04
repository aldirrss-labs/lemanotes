import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ensureFolder, uploadMarkdown } from "@/lib/gdrive";
import { getValidAccessToken } from "@/lib/gdrive-token";
import { noteToMarkdown, safeFileName } from "@/lib/markdown";
import type { Note, Notebook } from "@/lib/types";

const ROOT_NAME = "LemaNotes";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();

  const { data: profile } = await service
    .from("profiles")
    .select("gdrive_connected, gdrive_root_folder_id")
    .eq("id", user.id)
    .single();

  if (!profile?.gdrive_connected) {
    return NextResponse.json(
      { message: "Google Drive is not connected." },
      { status: 400 }
    );
  }

  const validToken = await getValidAccessToken(user.id);
  if (!validToken) {
    return NextResponse.json(
      { message: "Google Drive session expired. Please reconnect." },
      { status: 400 }
    );
  }
  const accessToken: string = validToken;

  // --- Make sure the "LemaNotes" root folder exists.
  let rootFolderId = profile.gdrive_root_folder_id as string | null;
  if (!rootFolderId) {
    rootFolderId = await ensureFolder(accessToken, ROOT_NAME, null);
    await service
      .from("profiles")
      .update({ gdrive_root_folder_id: rootFolderId })
      .eq("id", user.id);
  }
  const root: string = rootFolderId;

  const { data: notesData } = await supabase
    .from("notes")
    .select("*")
    .is("deleted_at", null);
  const { data: notebooksData } = await supabase.from("notebooks").select("*");
  const notes = (notesData ?? []) as Note[];
  const notebooks = (notebooksData ?? []) as Notebook[];
  const notebookById = new Map(notebooks.map((nb) => [nb.id, nb]));

  // --- Resolve the Drive folder for a notebook (creating the chain if needed).
  const folderCache = new Map<string, string>();
  async function resolveFolder(notebookId: string): Promise<string> {
    const cached = folderCache.get(notebookId);
    if (cached) return cached;
    const nb = notebookById.get(notebookId);
    if (!nb) return root;
    const parentFolder = nb.parent_id
      ? await resolveFolder(nb.parent_id)
      : root;
    let folderId = nb.gdrive_folder_id ?? "";
    if (!folderId) {
      folderId = await ensureFolder(accessToken, nb.name, parentFolder);
      await service
        .from("notebooks")
        .update({ gdrive_folder_id: folderId })
        .eq("id", nb.id);
      nb.gdrive_folder_id = folderId;
    }
    folderCache.set(notebookId, folderId);
    return folderId;
  }

  const pending = notes.filter(
    (n) =>
      !n.last_synced_at || new Date(n.updated_at) > new Date(n.last_synced_at)
  );

  let ok = 0;
  let fail = 0;
  for (const note of pending) {
    try {
      const parentId = note.notebook_id
        ? await resolveFolder(note.notebook_id)
        : root;
      const fileId = await uploadMarkdown(accessToken, {
        name: `${safeFileName(note.title)}.md`,
        parentId,
        content: noteToMarkdown(note),
        existingFileId: note.gdrive_file_id,
      });
      await service
        .from("notes")
        .update({
          last_synced_at: new Date().toISOString(),
          gdrive_file_id: fileId,
        })
        .eq("id", note.id);
      await service.from("sync_logs").insert({
        user_id: user.id,
        note_id: note.id,
        status: "success",
        message: `Drive file ${fileId}`,
      });
      ok++;
    } catch (e) {
      await service.from("sync_logs").insert({
        user_id: user.id,
        note_id: note.id,
        status: "failed",
        message: String(e),
      });
      fail++;
    }
  }

  return NextResponse.json({
    message: `Backup complete: ${ok} completed, ${fail} failed, from ${pending.length} changed notes.`,
    ok,
    fail,
  });
}
