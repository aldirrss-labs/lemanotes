import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { listFolder, findFolder, downloadFile } from "@/lib/gdrive";
import { getValidAccessToken } from "@/lib/gdrive-token";
import { markdownToNote } from "@/lib/markdown";
import type { Note, Notebook } from "@/lib/types";

const ROOT_NAME = "LemaNotes";

// Pulls notes/notebooks that exist in the "LemaNotes" Drive folder but not
// (yet) in the database — e.g. after reconnecting Drive on a fresh install,
// or after a period where the connection was broken and local sync lapsed.
// Matching is by Drive id (gdrive_folder_id / gdrive_file_id) so re-running
// this is safe: anything already linked locally is left untouched, and any
// local edits made since the last sync are never overwritten.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const userId = user.id;

  const service = createServiceClient();

  const { data: profile } = await service
    .from("profiles")
    .select("gdrive_connected, gdrive_root_folder_id")
    .eq("id", userId)
    .single();

  if (!profile?.gdrive_connected) {
    return NextResponse.json(
      { message: "Google Drive is not connected." },
      { status: 400 }
    );
  }

  const validToken = await getValidAccessToken(userId);
  if (!validToken) {
    return NextResponse.json(
      { message: "Google Drive session expired. Please reconnect." },
      { status: 400 }
    );
  }
  const accessToken: string = validToken;

  let rootFolderId = profile.gdrive_root_folder_id as string | null;
  if (!rootFolderId) {
    rootFolderId = await findFolder(accessToken, ROOT_NAME, null);
  }
  if (!rootFolderId) {
    return NextResponse.json({
      message: "No LemaNotes folder found in Google Drive.",
      restoredNotebooks: 0,
      restoredNotes: 0,
    });
  }

  const { data: notebooksData } = await service
    .from("notebooks")
    .select("*")
    .eq("user_id", userId);
  const { data: notesData } = await service
    .from("notes")
    .select("id, gdrive_file_id")
    .eq("user_id", userId);

  const notebooks = (notebooksData ?? []) as Notebook[];
  const notebookByDriveId = new Map(
    notebooks.filter((nb) => nb.gdrive_folder_id).map((nb) => [nb.gdrive_folder_id as string, nb])
  );
  const notebookByParentAndName = new Map(
    notebooks.map((nb) => [`${nb.parent_id ?? "root"}::${nb.name}`, nb])
  );
  const knownDriveFileIds = new Set(
    (notesData ?? [])
      .map((n) => (n as Pick<Note, "gdrive_file_id">).gdrive_file_id)
      .filter(Boolean)
  );

  let restoredNotebooks = 0;
  let restoredNotes = 0;
  let failed = 0;

  async function resolveNotebook(
    driveFolderId: string,
    name: string,
    localParentId: string | null
  ): Promise<string> {
    const existingByDriveId = notebookByDriveId.get(driveFolderId);
    if (existingByDriveId) return existingByDriveId.id;

    // Folder was never linked locally (e.g. created in Drive directly, or
    // linkage was lost) — fall back to matching by name under the same
    // parent before creating a new notebook, to avoid duplicates.
    const nameKey = `${localParentId ?? "root"}::${name}`;
    const existingByName = notebookByParentAndName.get(nameKey);
    if (existingByName) {
      if (!existingByName.gdrive_folder_id) {
        await service
          .from("notebooks")
          .update({ gdrive_folder_id: driveFolderId })
          .eq("id", existingByName.id);
      }
      notebookByDriveId.set(driveFolderId, existingByName);
      return existingByName.id;
    }

    const { data: created, error } = await service
      .from("notebooks")
      .insert({
        user_id: userId,
        parent_id: localParentId,
        name,
        gdrive_folder_id: driveFolderId,
      })
      .select()
      .single();
    if (error || !created) {
      throw new Error(error?.message ?? "Failed to create notebook");
    }
    const notebook = created as Notebook;
    notebookByDriveId.set(driveFolderId, notebook);
    notebookByParentAndName.set(nameKey, notebook);
    restoredNotebooks++;
    return notebook.id;
  }

  async function restoreFolder(
    driveFolderId: string,
    localNotebookId: string | null
  ) {
    const entries = await listFolder(accessToken, driveFolderId);
    for (const entry of entries) {
      if (entry.isFolder) {
        const nextNotebookId = await resolveNotebook(
          entry.id,
          entry.name,
          localNotebookId
        );
        await restoreFolder(entry.id, nextNotebookId);
        continue;
      }
      if (!entry.name.toLowerCase().endsWith(".md")) continue;
      if (knownDriveFileIds.has(entry.id)) continue; // already synced locally

      try {
        const raw = await downloadFile(accessToken, entry.id);
        const parsed = markdownToNote(raw, entry.name.replace(/\.md$/i, ""));
        const { error } = await service.from("notes").insert({
          user_id: userId,
          notebook_id: localNotebookId,
          title: parsed.title,
          content_markdown: parsed.body,
          tags: parsed.tags,
          created_at: parsed.created_at,
          updated_at: parsed.updated_at,
          gdrive_file_id: entry.id,
          last_synced_at: new Date().toISOString(),
        });
        if (error) throw new Error(error.message);
        knownDriveFileIds.add(entry.id);
        restoredNotes++;
      } catch (e) {
        console.error("Failed to restore note from Drive", entry.id, e);
        failed++;
      }
    }
  }

  await restoreFolder(rootFolderId, null);

  return NextResponse.json({
    message: `Restore complete: ${restoredNotes} note(s) and ${restoredNotebooks} notebook(s) pulled from Drive${failed ? `, ${failed} failed` : ""}.`,
    restoredNotebooks,
    restoredNotes,
    failed,
  });
}
