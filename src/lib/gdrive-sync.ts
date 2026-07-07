// Core "push local notes to Drive" logic, shared by the manual sync route
// and the nightly cron so both stay in lockstep.
import { createServiceClient } from "@/lib/supabase/server";
import { ensureFolder, uploadMarkdown } from "@/lib/gdrive";
import { getValidAccessToken } from "@/lib/gdrive-token";
import { noteToMarkdown, safeFileName } from "@/lib/markdown";
import type { Note, Notebook } from "@/lib/types";

const ROOT_NAME = "LemaNotes";

export type SyncResult = { ok: number; fail: number; message: string };

export async function syncUserNotesToDrive(userId: string): Promise<SyncResult> {
  const service = createServiceClient();

  const { data: profile } = await service
    .from("profiles")
    .select("gdrive_connected, gdrive_root_folder_id")
    .eq("id", userId)
    .single();

  if (!profile?.gdrive_connected) {
    throw new Error("Google Drive is not connected.");
  }

  const validToken = await getValidAccessToken(userId);
  if (!validToken) {
    throw new Error("Google Drive session expired. Please reconnect.");
  }
  const accessToken: string = validToken;

  let rootFolderId = profile.gdrive_root_folder_id as string | null;
  if (!rootFolderId) {
    rootFolderId = await ensureFolder(accessToken, ROOT_NAME, null);
    await service
      .from("profiles")
      .update({ gdrive_root_folder_id: rootFolderId })
      .eq("id", userId);
  }
  const root: string = rootFolderId;

  const { data: notesData } = await service
    .from("notes")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null);
  const { data: notebooksData } = await service
    .from("notebooks")
    .select("*")
    .eq("user_id", userId);
  const notes = (notesData ?? []) as Note[];
  const notebooks = (notebooksData ?? []) as Notebook[];
  const notebookById = new Map(notebooks.map((nb) => [nb.id, nb]));

  const folderCache = new Map<string, string>();
  async function resolveFolder(notebookId: string): Promise<string> {
    const cached = folderCache.get(notebookId);
    if (cached) return cached;
    const nb = notebookById.get(notebookId);
    if (!nb) return root;
    const parentFolder = nb.parent_id ? await resolveFolder(nb.parent_id) : root;
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
    (n) => !n.last_synced_at || new Date(n.updated_at) > new Date(n.last_synced_at)
  );

  let ok = 0;
  let fail = 0;
  for (const note of pending) {
    try {
      const parentId = note.notebook_id ? await resolveFolder(note.notebook_id) : root;
      const fileId = await uploadMarkdown(accessToken, {
        name: `${safeFileName(note.title)}.md`,
        parentId,
        content: noteToMarkdown(note),
        existingFileId: note.gdrive_file_id,
      });
      await service
        .from("notes")
        .update({ last_synced_at: new Date().toISOString(), gdrive_file_id: fileId })
        .eq("id", note.id);
      await service.from("sync_logs").insert({
        user_id: userId,
        note_id: note.id,
        status: "success",
        message: `Drive file ${fileId}`,
      });
      ok++;
    } catch (e) {
      await service.from("sync_logs").insert({
        user_id: userId,
        note_id: note.id,
        status: "failed",
        message: String(e),
      });
      fail++;
    }
  }

  return {
    ok,
    fail,
    message: `Backup complete: ${ok} completed, ${fail} failed, from ${pending.length} changed notes.`,
  };
}
