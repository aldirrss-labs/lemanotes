"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Plus,
  LogOut,
  Trash2,
  Upload,
  Download,
  Cloud,
  CloudOff,
  RefreshCw,
  Search,
  Trash,
  History,
  Sun,
  Moon,
  RotateCcw,
  X,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  Menu,
  Pin,
  PinOff,
  ArrowUpDown,
  Settings,
  CloudDownload,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Note, Notebook, NotebookNode, SyncLog } from "@/lib/types";
import { noteToMarkdown, markdownToNote, safeFileName } from "@/lib/markdown";
import NotebookTree from "./notebook-tree";
import NoteEditor from "./note-editor";
import { useDialogs } from "./dialogs";

type Props = {
  initialNotebooks: Notebook[];
  initialNotes: Note[];
  displayName: string;
  gdriveConnected: boolean;
};

type View = "notes" | "trash";
type Viewport = "mobile" | "tablet" | "desktop";
type MobileScreen = "sidebar" | "list" | "editor";
type SortBy = "updated_desc" | "created_desc" | "title_asc" | "title_desc";

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "updated_desc", label: "Recently updated" },
  { value: "created_desc", label: "Recently created" },
  { value: "title_asc", label: "Title A-Z" },
  { value: "title_desc", label: "Title Z-A" },
];

function sortNotes(list: Note[], sortBy: SortBy): Note[] {
  const sorted = [...list].sort((a, b) => {
    switch (sortBy) {
      case "created_desc":
        return b.created_at.localeCompare(a.created_at);
      case "title_asc":
        return a.title.localeCompare(b.title);
      case "title_desc":
        return b.title.localeCompare(a.title);
      case "updated_desc":
      default:
        return b.updated_at.localeCompare(a.updated_at);
    }
  });
  // Pinned notes always float to the top, regardless of sort order.
  sorted.sort((a, b) => Number(b.pinned) - Number(a.pinned));
  return sorted;
}

// Detect screen size: mobile (<768px), tablet (768-1023px), desktop (>=1024px).
function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>("desktop");
  useEffect(() => {
    const mdQuery = window.matchMedia("(min-width: 768px)");
    const lgQuery = window.matchMedia("(min-width: 1024px)");
    const update = () => {
      setVp(lgQuery.matches ? "desktop" : mdQuery.matches ? "tablet" : "mobile");
    };
    update();
    mdQuery.addEventListener("change", update);
    lgQuery.addEventListener("change", update);
    return () => {
      mdQuery.removeEventListener("change", update);
      lgQuery.removeEventListener("change", update);
    };
  }, []);
  return vp;
}

export default function Workspace({
  initialNotebooks,
  initialNotes,
  displayName,
  gdriveConnected,
}: Props) {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { askConfirm, askPrompt, showAlert, DialogHost } = useDialogs();

  const [notebooks, setNotebooks] = useState<Notebook[]>(initialNotebooks);
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(
    null
  );
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const syncingRef = useRef(false);

  // New features
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("updated_desc");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [view, setView] = useState<View>("notes");
  const [trashedNotes, setTrashedNotes] = useState<Note[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [localDisplayName, setLocalDisplayName] = useState(displayName);
  const [localGdriveConnected, setLocalGdriveConnected] =
    useState(gdriveConnected);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
      ? "dark"
      : "light"
  );

  // Responsive layout
  const viewport = useViewport();
  const [mobileScreen, setMobileScreen] = useState<MobileScreen>("sidebar");
  const [sidebarOpen, setSidebarOpen] = useState(false); // drawer overlay (tablet)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("sidebarCollapsed") === "1";
    } catch {
      return false;
    }
  });

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebarCollapsed", next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  // ---- tree built from the flat list ----
  const tree = useMemo<NotebookNode[]>(() => buildTree(notebooks), [notebooks]);

  const noteCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const n of notes) {
      if (n.notebook_id) c[n.notebook_id] = (c[n.notebook_id] ?? 0) + 1;
    }
    return c;
  }, [notes]);

  const visibleNotes = useMemo(() => {
    let list =
      selectedNotebookId === null
        ? notes
        : notes.filter((n) => n.notebook_id === selectedNotebookId);
    if (showPinnedOnly) list = list.filter((n) => n.pinned);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.content_markdown.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return sortNotes(list, sortBy);
  }, [notes, selectedNotebookId, search, sortBy, showPinnedOnly]);

  const selectedNote = notes.find((n) => n.id === selectedNoteId) ?? null;

  // =========================================================
  //  Theme
  // =========================================================
  function toggleTheme() {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      const el = document.documentElement;
      if (next === "dark") el.classList.add("dark");
      else el.classList.remove("dark");
      try {
        localStorage.theme = next;
      } catch {}
      return next;
    });
  }

  // =========================================================
  //  Notebook CRUD
  // =========================================================
  async function addNotebook(parentId: string | null) {
    const name = await askPrompt({
      title: parentId ? "New sub-notebook" : "New notebook",
      label: "Name",
      defaultValue: "New notebook",
      placeholder: "Notebook name",
      confirmLabel: "Create",
    });
    if (!name) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("notebooks")
      .insert({ name, parent_id: parentId, user_id: user.id })
      .select()
      .single();
    if (!error && data) setNotebooks((prev) => [...prev, data as Notebook]);
  }

  async function renameNotebook(id: string, name: string) {
    const { error } = await supabase
      .from("notebooks")
      .update({ name })
      .eq("id", id);
    if (!error)
      setNotebooks((prev) =>
        prev.map((nb) => (nb.id === id ? { ...nb, name } : nb))
      );
  }

  async function deleteNotebook(id: string) {
    const ok = await askConfirm({
      title: "Delete notebook",
      message:
        "Delete this notebook and all its sub-notebooks & notes? This cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch("/api/gdrive/delete-notebook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notebookId: id }),
    });
    if (res.ok) {
      const removed = collectDescendants(id, notebooks);
      setNotebooks((prev) => prev.filter((nb) => !removed.has(nb.id)));
      setNotes((prev) =>
        prev.filter((n) => !n.notebook_id || !removed.has(n.notebook_id))
      );
      if (selectedNotebookId && removed.has(selectedNotebookId))
        setSelectedNotebookId(null);
    }
  }

  // =========================================================
  //  Note CRUD
  // =========================================================
  async function addNote() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("notes")
      .insert({
        user_id: user.id,
        notebook_id: selectedNotebookId,
        title: "Untitled",
        content_markdown: "",
      })
      .select()
      .single();
    if (!error && data) {
      setNotes((prev) => [data as Note, ...prev]);
      setSelectedNoteId((data as Note).id);
      setMobileScreen("editor");
    }
  }

  async function updateNote(id: string, patch: Partial<Note>) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
    const { data } = await supabase
      .from("notes")
      .update(patch)
      .eq("id", id)
      .select("updated_at")
      .single();
    // The `updated_at` column is bumped by a DB trigger, not by the patch we
    // sent, so the optimistic update above never touches it — pull the
    // trigger-generated value back so the list's "last updated" badge and
    // sort order reflect reality instead of staying frozen at create time.
    // Rapid successive edits (e.g. ticking several checklist items quickly)
    // fire overlapping updateNote calls whose responses can resolve out of
    // order over the network — only apply this if it's not older than what's
    // already there, so a slow, stale response can't clobber a newer one.
    if (data) {
      setNotes((prev) =>
        prev.map((n) =>
          n.id === id && data.updated_at > n.updated_at
            ? { ...n, updated_at: data.updated_at }
            : n
        )
      );
    }
  }

  async function togglePin(id: string) {
    const target = notes.find((n) => n.id === id);
    if (!target) return;
    await updateNote(id, { pinned: !target.pinned });
  }

  async function deleteNote(id: string) {
    const ok = await askConfirm({
      title: "Move to trash",
      message: "Move this note to trash? You can restore it later.",
      confirmLabel: "Move to trash",
      danger: true,
    });
    if (!ok) return;
    const when = new Date().toISOString();
    await supabase.from("notes").update({ deleted_at: when }).eq("id", id);
    await fetch("/api/gdrive/untrack-note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId: id }),
    });
    const moved = notes.find((n) => n.id === id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (moved) setTrashedNotes((prev) => [{ ...moved, deleted_at: when }, ...prev]);
    if (selectedNoteId === id) setSelectedNoteId(null);
  }

  // =========================================================
  //  Trash
  // =========================================================
  async function openTrash() {
    setView("trash");
    setSelectedNoteId(null);
    setMobileScreen("list");
    setSidebarOpen(false);
    const { data } = await supabase
      .from("notes")
      .select("*")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    setTrashedNotes((data ?? []) as Note[]);
  }

  async function restoreNote(id: string) {
    await supabase.from("notes").update({ deleted_at: null }).eq("id", id);
    const restored = trashedNotes.find((n) => n.id === id);
    setTrashedNotes((prev) => prev.filter((n) => n.id !== id));
    if (restored)
      setNotes((prev) => [{ ...restored, deleted_at: null }, ...prev]);
  }

  async function deleteForever(id: string) {
    const ok = await askConfirm({
      title: "Delete permanently",
      message: "Permanently delete this note? This cannot be undone.",
      confirmLabel: "Delete forever",
      danger: true,
    });
    if (!ok) return;
    await fetch("/api/gdrive/delete-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteIds: [id] }),
    });
    setTrashedNotes((prev) => prev.filter((n) => n.id !== id));
  }

  async function emptyTrash() {
    if (trashedNotes.length === 0) return;
    const ok = await askConfirm({
      title: "Empty trash",
      message: `Permanently delete all ${trashedNotes.length} notes in trash? This cannot be undone.`,
      confirmLabel: "Empty trash",
      danger: true,
    });
    if (!ok) return;
    const ids = trashedNotes.map((n) => n.id);
    await fetch("/api/gdrive/delete-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteIds: ids }),
    });
    setTrashedNotes([]);
  }

  // =========================================================
  //  Sync history
  // =========================================================
  async function openHistory() {
    setHistoryOpen(true);
    const { data } = await supabase
      .from("sync_logs")
      .select("*")
      .order("synced_at", { ascending: false })
      .limit(50);
    setSyncLogs((data ?? []) as SyncLog[]);
  }

  // =========================================================
  //  Import / Export .md
  // =========================================================
  async function exportAll() {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    const pathOf = notebookPathResolver(notebooks);
    for (const n of notes) {
      const folder = n.notebook_id ? pathOf(n.notebook_id) : "";
      const filename = `${folder}${safeFileName(n.title)}.md`;
      zip.file(filename, noteToMarkdown(n));
    }
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, "notes-export.zip");
  }

  function exportCurrent() {
    if (!selectedNote) return;
    const blob = new Blob([noteToMarkdown(selectedNote)], {
      type: "text/markdown",
    });
    downloadBlob(blob, `${safeFileName(selectedNote.title)}.md`);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const toInsert: Array<Partial<Note> & { user_id: string }> = [];
    for (const file of Array.from(files)) {
      const raw = await file.text();
      const parsed = markdownToNote(raw, file.name.replace(/\.md$/i, ""));
      toInsert.push({
        user_id: user.id,
        notebook_id: selectedNotebookId,
        title: parsed.title,
        content_markdown: parsed.body,
        tags: parsed.tags,
      });
    }
    const { data, error } = await supabase.from("notes").insert(toInsert).select();
    if (!error && data) setNotes((prev) => [...(data as Note[]), ...prev]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // =========================================================
  //  Google Drive
  // =========================================================
  async function connectGDrive() {
    window.location.href = "/api/gdrive/connect";
  }

  async function disconnectGDrive() {
    const ok = await askConfirm({
      title: "Disconnect Google Drive",
      message:
        "Stop syncing to Google Drive? Your notes stay untouched here and in Drive — you can reconnect later to resume syncing.",
      confirmLabel: "Disconnect",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch("/api/gdrive/disconnect", { method: "POST" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      await showAlert({
        title: "Disconnect failed",
        message: json.message ?? "Could not disconnect Google Drive.",
      });
      return;
    }
    setLocalGdriveConnected(false);
  }

  const runSync = useCallback(
    async (opts: { showResult: boolean }) => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      setSyncing(true);
      try {
        const res = await fetch("/api/gdrive/sync", { method: "POST" });
        const json = await res.json();
        if (opts.showResult) {
          await showAlert({ title: "Sync", message: json.message ?? "Done" });
        }
      } catch {
        if (opts.showResult) {
          await showAlert({
            title: "Sync failed",
            message: "Could not reach the sync server.",
          });
        }
      } finally {
        syncingRef.current = false;
        setSyncing(false);
      }
    },
    [showAlert]
  );

  async function syncNow() {
    await runSync({ showResult: true });
  }

  async function restoreFromDrive() {
    const ok = await askConfirm({
      title: "Restore from Google Drive",
      message:
        "Pull any notes and notebooks that exist in the LemaNotes Drive folder but aren't in this account yet? Existing notes are never overwritten.",
      confirmLabel: "Restore",
    });
    if (!ok) return;
    setRestoring(true);
    try {
      const res = await fetch("/api/gdrive/restore", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        await showAlert({
          title: "Restore failed",
          message: json.message ?? "Could not restore from Google Drive.",
        });
        return;
      }
      await showAlert({ title: "Restore", message: json.message ?? "Done" });
      if (json.restoredNotebooks > 0 || json.restoredNotes > 0) {
        const [{ data: nb }, { data: nt }] = await Promise.all([
          supabase
            .from("notebooks")
            .select("*")
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: true }),
          supabase
            .from("notes")
            .select("*")
            .is("deleted_at", null)
            .order("updated_at", { ascending: false }),
        ]);
        setNotebooks((nb ?? []) as Notebook[]);
        setNotes((nt ?? []) as Note[]);
      }
    } catch {
      await showAlert({
        title: "Restore failed",
        message: "Could not reach the restore server.",
      });
    } finally {
      setRestoring(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function updateDisplayName(name: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: name })
      .eq("id", user.id);
    if (error) {
      await showAlert({ title: "Update failed", message: error.message });
      return;
    }
    setLocalDisplayName(name);
    await showAlert({ title: "Saved", message: "Your name has been updated." });
  }

  async function updatePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      await showAlert({ title: "Update failed", message: error.message });
      return;
    }
    await showAlert({
      title: "Saved",
      message: "Your password has been updated.",
    });
  }

  async function deleteAccount() {
    const ok = await askConfirm({
      title: "Delete account",
      message:
        "Permanently delete your account and all your notes, notebooks, and Drive backup links? This cannot be undone.",
      confirmLabel: "Delete account",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch("/api/account/delete", { method: "POST" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      await showAlert({
        title: "Delete failed",
        message: json.message ?? "Could not delete your account.",
      });
      return;
    }
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function selectNotebook(id: string | null) {
    setView("notes");
    setSelectedNotebookId(id);
    setMobileScreen("list");
    setSidebarOpen(false);
  }

  function selectNote(id: string) {
    setSelectedNoteId(id);
    setMobileScreen("editor");
  }

  // =========================================================
  //  Render
  // =========================================================
  const isDesktop = viewport === "desktop";
  const isTablet = viewport === "tablet";
  const isMobile = viewport === "mobile";
  const collapsed = isDesktop && sidebarCollapsed;

  const sidebarNode = (
    <aside
      className={
        isDesktop
          ? `flex ${collapsed ? "w-14" : "w-64"} shrink-0 flex-col bg-sidebar text-gray-200 transition-[width] duration-150`
          : isTablet
            ? `fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar text-gray-200 shadow-xl transition-transform duration-200 ${
                sidebarOpen ? "translate-x-0" : "-translate-x-full"
              }`
            : "flex h-full w-full flex-col bg-sidebar text-gray-200"
      }
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        {!collapsed && (
          <span className="text-lg font-semibold tracking-tight text-white">
            Lema<span className="text-blue-400">Notes</span>
          </span>
        )}
        <div className={`flex items-center gap-2 ${collapsed ? "mx-auto" : ""}`}>
          <button
            onClick={toggleTheme}
            title="Toggle theme"
            className="text-gray-400 hover:text-white"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          {isDesktop && (
            <button
              onClick={toggleSidebarCollapsed}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="text-gray-400 hover:text-white"
            >
              {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
            </button>
          )}
          {isTablet && (
            <button
              onClick={() => setSidebarOpen(false)}
              title="Close"
              className="text-gray-400 hover:text-white"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <span className="truncate text-sm font-medium">
            {localDisplayName}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAccountSettingsOpen(true)}
              title="Account settings"
              className="text-gray-400 hover:text-white"
            >
              <Settings size={16} />
            </button>
            <button
              onClick={logout}
              title="Sign out"
              className="text-gray-400 hover:text-white"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      )}

      {!collapsed && (
        <div className="flex items-center justify-between px-3 py-2 text-xs uppercase tracking-wide text-gray-400">
          <span>Notebooks</span>
          <button
            onClick={() => addNotebook(null)}
            title="New notebook"
            className="hover:text-white"
          >
            <Plus size={16} />
          </button>
        </div>
      )}

      <div
        className={
          collapsed
            ? "flex-1 space-y-1 overflow-auto px-1.5 py-2"
            : "flex-1 overflow-auto px-1"
        }
      >
        {collapsed ? (
          <>
            <button
              onClick={() => selectNotebook(null)}
              title="All notes"
              className={`flex w-full items-center justify-center rounded-md py-2 ${
                view === "notes" && selectedNotebookId === null
                  ? "bg-sidebar-hover"
                  : "hover:bg-sidebar-hover"
              }`}
            >
              <FileText size={16} />
            </button>
            <button
              onClick={openTrash}
              title="Trash"
              className={`flex w-full items-center justify-center rounded-md py-2 ${
                view === "trash" ? "bg-sidebar-hover" : "hover:bg-sidebar-hover"
              }`}
            >
              <Trash size={16} />
            </button>
            <button
              onClick={() => addNotebook(null)}
              title="New notebook"
              className="flex w-full items-center justify-center rounded-md py-2 hover:bg-sidebar-hover"
            >
              <Plus size={16} />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => selectNotebook(null)}
              className={`mb-1 flex w-full items-center gap-2 rounded-md px-3 py-1 text-sm ${
                view === "notes" && selectedNotebookId === null
                  ? "bg-sidebar-hover"
                  : "hover:bg-sidebar-hover"
              }`}
            >
              <FileText size={15} /> All notes
            </button>
            <NotebookTree
              nodes={tree}
              selectedNotebookId={view === "notes" ? selectedNotebookId : null}
              noteCounts={noteCounts}
              onSelect={selectNotebook}
              onAddChild={addNotebook}
              onRename={renameNotebook}
              onDelete={deleteNotebook}
            />
            <button
              onClick={openTrash}
              className={`mt-1 flex w-full items-center gap-2 rounded-md px-3 py-1 text-sm ${
                view === "trash" ? "bg-sidebar-hover" : "hover:bg-sidebar-hover"
              }`}
            >
              <Trash size={15} /> Trash
            </button>
          </>
        )}
      </div>

      {/* Utilities */}
      <div
        className={
          collapsed
            ? "flex flex-col items-center space-y-1 border-t border-white/10 p-1.5 text-sm"
            : "space-y-1 border-t border-white/10 p-3 text-sm"
        }
      >
        {collapsed ? (
          <>
            <button
              onClick={localGdriveConnected ? undefined : connectGDrive}
              title={
                localGdriveConnected
                  ? "Google Drive connected"
                  : "Connect Google Drive"
              }
              className={`flex w-full items-center justify-center rounded-md py-2 ${
                localGdriveConnected ? "text-green-400" : "hover:bg-sidebar-hover"
              }`}
            >
              {localGdriveConnected ? <Cloud size={16} /> : <CloudOff size={16} />}
            </button>
            {localGdriveConnected && (
              <button
                onClick={syncNow}
                disabled={syncing}
                title="Sync now"
                className="flex w-full items-center justify-center rounded-md py-2 hover:bg-sidebar-hover disabled:opacity-60"
              >
                <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
              </button>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Import .md"
              className="flex w-full items-center justify-center rounded-md py-2 hover:bg-sidebar-hover"
            >
              <Upload size={16} />
            </button>
            <button
              onClick={exportAll}
              title="Export all (.zip)"
              className="flex w-full items-center justify-center rounded-md py-2 hover:bg-sidebar-hover"
            >
              <Download size={16} />
            </button>
          </>
        ) : (
          <>
            {localGdriveConnected ? (
              <>
                <div className="flex items-center gap-2 text-green-400">
                  <Cloud size={15} /> Google Drive connected
                </div>
                <button
                  onClick={syncNow}
                  disabled={syncing}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1 hover:bg-sidebar-hover disabled:opacity-60"
                >
                  <RefreshCw
                    size={15}
                    className={syncing ? "animate-spin" : ""}
                  />
                  {syncing ? "Syncing..." : "Sync now"}
                </button>
                <button
                  onClick={openHistory}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1 hover:bg-sidebar-hover"
                >
                  <History size={15} /> Sync history
                </button>
              </>
            ) : (
              <button
                onClick={connectGDrive}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1 hover:bg-sidebar-hover"
              >
                <CloudOff size={15} /> Connect Google Drive
              </button>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1 hover:bg-sidebar-hover"
            >
              <Upload size={15} /> Import .md
            </button>
            <button
              onClick={exportAll}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1 hover:bg-sidebar-hover"
            >
              <Download size={15} /> Export all (.zip)
            </button>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,text/markdown"
          multiple
          hidden
          onChange={handleImport}
        />
      </div>
    </aside>
  );

  const listNode = (
    <section
      className={
        isMobile
          ? "flex h-full w-full flex-col bg-white dark:bg-gray-900"
          : "flex w-full shrink-0 flex-col border-r bg-white sm:w-72 dark:border-gray-700 dark:bg-gray-900"
      }
    >
      {view === "notes" ? (
        <>
          <div className="border-b px-4 py-3 dark:border-gray-700">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                {isMobile && (
                  <button
                    onClick={() => setMobileScreen("sidebar")}
                    className="shrink-0 text-gray-500 dark:text-gray-400"
                    aria-label="back"
                  >
                    <ChevronLeft size={18} />
                  </button>
                )}
                {isTablet && (
                  <button
                    onClick={() => setSidebarOpen(true)}
                    className="shrink-0 text-gray-500 dark:text-gray-400"
                    aria-label="menu"
                  >
                    <Menu size={18} />
                  </button>
                )}
                <h2 className="truncate text-sm font-semibold text-gray-600 dark:text-gray-300">
                  {selectedNotebookId
                    ? notebooks.find((n) => n.id === selectedNotebookId)?.name
                    : "All notes"}
                </h2>
              </div>
              <button
                onClick={addNote}
                title="New note"
                className="shrink-0 text-blue-600 hover:text-blue-700"
              >
                <Plus size={18} />
              </button>
            </div>
            <div className="relative mb-2">
              <Search
                size={14}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search notes or tags..."
                className="w-full rounded-md border bg-gray-50 py-1.5 pl-7 pr-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowPinnedOnly((prev) => !prev)}
                className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm ${
                  showPinnedOnly
                    ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                }`}
              >
                <Pin size={13} className={showPinnedOnly ? "fill-current" : ""} />
                Pinned
              </button>
              <div className="relative">
                <button
                  onClick={() => setSortMenuOpen((prev) => !prev)}
                  className="flex items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  <ArrowUpDown size={13} />
                  Sort
                </button>
                {sortMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setSortMenuOpen(false)}
                    />
                    <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-md border bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                      {SORT_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => {
                            setSortBy(opt.value);
                            setSortMenuOpen(false);
                          }}
                          className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${
                            sortBy === opt.value
                              ? "font-medium text-blue-600 dark:text-blue-400"
                              : "text-gray-700 dark:text-gray-200"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            {visibleNotes.length === 0 && (
              <p className="p-4 text-sm text-gray-400">
                {search ? "No matching notes." : "No notes yet."}
              </p>
            )}
            {visibleNotes.map((n) => (
              <div
                key={n.id}
                role="button"
                tabIndex={0}
                onClick={() => selectNote(n.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") selectNote(n.id);
                }}
                className={`flex w-full items-start gap-2 border-b px-4 py-3 text-left hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800 ${
                  selectedNoteId === n.id
                    ? "bg-blue-50 dark:bg-blue-950"
                    : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {n.pinned && (
                      <Pin
                        size={12}
                        className="shrink-0 fill-current text-blue-600 dark:text-blue-400"
                      />
                    )}
                    <div className="truncate font-medium text-gray-900 dark:text-gray-100">
                      {n.title || "Untitled"}
                    </div>
                  </div>
                  <div className="truncate text-xs text-gray-400">
                    {new Date(n.updated_at).toLocaleString("en-US")}
                  </div>
                  {n.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {n.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePin(n.id);
                  }}
                  title={n.pinned ? "Unpin" : "Pin"}
                  className="shrink-0 text-gray-300 hover:text-blue-600 dark:text-gray-600 dark:hover:text-blue-400"
                >
                  {n.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                </button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between border-b px-4 py-3 dark:border-gray-700">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-600 dark:text-gray-300">
              {isMobile && (
                <button
                  onClick={() => setMobileScreen("sidebar")}
                  className="text-gray-500 dark:text-gray-400"
                  aria-label="back"
                >
                  <ChevronLeft size={18} />
                </button>
              )}
              {isTablet && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="text-gray-500 dark:text-gray-400"
                  aria-label="menu"
                >
                  <Menu size={18} />
                </button>
              )}
              <Trash size={15} /> Trash
            </h2>
            {trashedNotes.length > 0 && (
              <button
                onClick={emptyTrash}
                className="text-xs font-medium text-red-600 hover:underline"
              >
                Empty trash
              </button>
            )}
          </div>
          <div className="flex-1 overflow-auto">
            {trashedNotes.length === 0 && (
              <p className="p-4 text-sm text-gray-400">Trash is empty.</p>
            )}
            {trashedNotes.map((n) => (
              <div
                key={n.id}
                className="border-b px-4 py-3 dark:border-gray-800"
              >
                <div className="truncate font-medium text-gray-900 dark:text-gray-100">
                  {n.title || "Untitled"}
                </div>
                <div className="mb-2 truncate text-xs text-gray-400">
                  Deleted{" "}
                  {n.deleted_at
                    ? new Date(n.deleted_at).toLocaleString("en-US")
                    : ""}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => restoreNote(n.id)}
                    className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    <RotateCcw size={12} /> Restore
                  </button>
                  <button
                    onClick={() => deleteForever(n.id)}
                    className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
                  >
                    <Trash2 size={12} /> Delete forever
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );

  const editorNode = (
    <main
      className={
        isMobile
          ? "flex h-full w-full flex-col bg-white dark:bg-gray-900"
          : "flex-1 overflow-hidden bg-white dark:bg-gray-900"
      }
    >
      {view === "notes" && selectedNote ? (
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-2 dark:border-gray-700">
            {isMobile ? (
              <button
                onClick={() => setMobileScreen("list")}
                className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300"
              >
                <ChevronLeft size={16} /> Back
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                onClick={exportCurrent}
                className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <Download size={14} /> .md
              </button>
              <button
                onClick={() => deleteNote(selectedNote.id)}
                className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <NoteEditor
              note={selectedNote}
              theme={theme}
              onChange={updateNote}
            />
          </div>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center p-4 text-center text-gray-400">
          {view === "trash"
            ? "Restore or permanently delete notes from the trash."
            : "Select or create a note to start writing."}
        </div>
      )}
    </main>
  );

  return (
    <>
      <div className="flex h-screen overflow-hidden">
        {isDesktop && (
          <>
            {sidebarNode}
            {listNode}
            {editorNode}
          </>
        )}

        {isTablet && (
          <>
            {sidebarOpen && (
              <div
                className="fixed inset-0 z-30 bg-black/40"
                onClick={() => setSidebarOpen(false)}
              />
            )}
            {sidebarNode}
            {listNode}
            {editorNode}
          </>
        )}

        {isMobile && (
          <>
            {mobileScreen === "sidebar" && sidebarNode}
            {mobileScreen === "list" && listNode}
            {mobileScreen === "editor" && editorNode}
          </>
        )}
      </div>

      {/* Sync history modal */}
      {historyOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setHistoryOpen(false);
          }}
        >
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl dark:bg-gray-800">
            <div className="flex items-center justify-between border-b px-5 py-3 dark:border-gray-700">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
                <History size={18} /> Sync history
              </h3>
              <button
                onClick={() => setHistoryOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                aria-label="close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-2">
              {syncLogs.length === 0 && (
                <p className="p-4 text-sm text-gray-400">No sync activity yet.</p>
              )}
              {syncLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 border-b px-3 py-2 text-sm last:border-0 dark:border-gray-700"
                >
                  <span
                    className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                      log.status === "success" ? "bg-green-500" : "bg-red-500"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2">
                      <span
                        className={`font-medium ${
                          log.status === "success"
                            ? "text-green-700 dark:text-green-400"
                            : "text-red-700 dark:text-red-400"
                        }`}
                      >
                        {log.status}
                      </span>
                      <span className="shrink-0 text-xs text-gray-400">
                        {new Date(log.synced_at).toLocaleString("en-US")}
                      </span>
                    </div>
                    {log.message && (
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {log.message}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Account settings modal */}
      {accountSettingsOpen && (
        <AccountSettingsModal
          currentName={localDisplayName}
          gdriveConnected={localGdriveConnected}
          restoring={restoring}
          onClose={() => setAccountSettingsOpen(false)}
          onSaveName={updateDisplayName}
          onSavePassword={updatePassword}
          onRestoreFromDrive={restoreFromDrive}
          onDisconnectGDrive={disconnectGDrive}
          onDeleteAccount={deleteAccount}
        />
      )}

      {DialogHost}
    </>
  );
}

// =========================================================
//  Account settings modal
// =========================================================
function AccountSettingsModal({
  currentName,
  gdriveConnected,
  restoring,
  onClose,
  onSaveName,
  onSavePassword,
  onRestoreFromDrive,
  onDisconnectGDrive,
  onDeleteAccount,
}: {
  currentName: string;
  gdriveConnected: boolean;
  restoring: boolean;
  onClose: () => void;
  onSaveName: (name: string) => Promise<void>;
  onSavePassword: (password: string) => Promise<void>;
  onRestoreFromDrive: () => Promise<void>;
  onDisconnectGDrive: () => Promise<void>;
  onDeleteAccount: () => Promise<void>;
}) {
  const [name, setName] = useState(currentName);
  const [savingName, setSavingName] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSaveName() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSavingName(true);
    await onSaveName(trimmed);
    setSavingName(false);
  }

  async function handleSavePassword() {
    setPasswordError(null);
    if (password.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }
    setSavingPassword(true);
    await onSavePassword(password);
    setSavingPassword(false);
    setPassword("");
    setConfirmPassword("");
  }

  async function handleDelete() {
    setDeleting(true);
    await onDeleteAccount();
    setDeleting(false);
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    await onDisconnectGDrive();
    setDisconnecting(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-xl bg-white shadow-xl dark:bg-gray-800">
        <div className="flex items-center justify-between border-b px-5 py-3 dark:border-gray-700">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
            <Settings size={18} /> Account settings
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            aria-label="close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 space-y-6 overflow-auto p-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Display name
            </label>
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
              <button
                onClick={handleSaveName}
                disabled={savingName || !name.trim()}
                className="shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {savingName ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Change password
            </label>
            <div className="space-y-2">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="New password"
                className="w-full rounded-md border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="w-full rounded-md border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
              {passwordError && (
                <p className="text-sm text-red-600">{passwordError}</p>
              )}
              <button
                onClick={handleSavePassword}
                disabled={savingPassword || !password || !confirmPassword}
                className="w-full rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {savingPassword ? "Saving..." : "Update password"}
              </button>
            </div>
          </div>

          {gdriveConnected && (
            <div className="border-t pt-5 dark:border-gray-700">
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Google Drive
              </label>
              <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                Pull in any notes or notebooks that exist in the LemaNotes
                Drive folder but aren&apos;t in this account yet — useful after
                reconnecting a Drive account that was disconnected before.
                Existing notes are never overwritten.
              </p>
              <button
                onClick={onRestoreFromDrive}
                disabled={restoring}
                className="mb-4 flex w-full items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <CloudDownload size={14} />
                {restoring ? "Restoring..." : "Restore from Drive"}
              </button>
              <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                Stop backing up notes to Google Drive. Your notes and the
                files already in Drive are kept — you can reconnect anytime
                to resume syncing.
              </p>
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="w-full rounded-md border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                {disconnecting ? "Disconnecting..." : "Disconnect Google Drive"}
              </button>
            </div>
          )}

          <div className="border-t pt-5 dark:border-gray-700">
            <label className="mb-1 block text-sm font-medium text-red-600">
              Danger zone
            </label>
            <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
              Permanently delete your account and all notes, notebooks, and
              Drive backup links. This cannot be undone.
            </p>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="w-full rounded-md border border-red-600 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60 dark:hover:bg-red-950"
            >
              {deleting ? "Deleting..." : "Delete account"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =========================================================
//  Helpers
// =========================================================
function buildTree(list: Notebook[]): NotebookNode[] {
  const map = new Map<string, NotebookNode>();
  list.forEach((nb) => map.set(nb.id, { ...nb, children: [] }));
  const roots: NotebookNode[] = [];
  map.forEach((node) => {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

function collectDescendants(id: string, list: Notebook[]): Set<string> {
  const result = new Set<string>([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const nb of list) {
      if (nb.parent_id && result.has(nb.parent_id) && !result.has(nb.id)) {
        result.add(nb.id);
        changed = true;
      }
    }
  }
  return result;
}

// Resolve the folder path "A/Sub/" for a notebook.
function notebookPathResolver(list: Notebook[]) {
  const byId = new Map(list.map((nb) => [nb.id, nb]));
  return (id: string): string => {
    const parts: string[] = [];
    let cur = byId.get(id);
    let guard = 0;
    while (cur && guard < 50) {
      parts.unshift(safeFileName(cur.name));
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
      guard++;
    }
    return parts.length ? parts.join("/") + "/" : "";
  };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}