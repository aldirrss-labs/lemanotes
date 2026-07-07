"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Crepe as CrepeType } from "@milkdown/crepe";
import type { replaceAll as replaceAllType } from "@milkdown/kit/utils";
import type { Note } from "@/lib/types";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import "./milkdown-overrides.css";

type Props = {
  note: Note;
  // Theme switching is handled globally via the `html.dark` class (see
  // milkdown-overrides.css) rather than this prop; kept for API
  // compatibility with the caller.
  theme?: "light" | "dark";
  onChange: (noteId: string, patch: Partial<Note>) => void;
};

export default function NoteEditor({ note, onChange }: Props) {
  const [title, setTitle] = useState(note.title);
  const [tags, setTags] = useState(note.tags);
  const [tagDraft, setTagDraft] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<CrepeType | null>(null);
  const replaceAllRef = useRef<typeof replaceAllType | null>(null);
  const contentRef = useRef(note.content_markdown);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef(title);
  const tagsRef = useRef(tags);
  const noteIdRef = useRef(note.id);
  const onChangeRef = useRef(onChange);
  titleRef.current = title;
  tagsRef.current = tags;
  noteIdRef.current = note.id;
  onChangeRef.current = onChange;

  // Flush any pending save immediately (no debounce wait). `targetNoteId`
  // pins the save to the note this edit actually belongs to — using
  // noteIdRef.current here would be wrong when flushing on note switch,
  // since that ref is already updated to the *new* note by the time this
  // runs (refs are mutated during render, before the old effect's cleanup).
  function flushSave(targetNoteId: string) {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    onChangeRef.current(targetNoteId, {
      title: titleRef.current,
      content_markdown: contentRef.current,
      tags: tagsRef.current,
    });
  }

  function addTag(raw: string) {
    const value = raw.trim();
    if (!value) return;
    setTags((prev) => (prev.includes(value) ? prev : [...prev, value]));
    setTagDraft("");
  }

  function removeTag(value: string) {
    setTags((prev) => prev.filter((t) => t !== value));
  }

  function handleTagInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagDraft);
    } else if (e.key === "Backspace" && tagDraft === "" && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  function scheduleSave() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => flushSave(noteIdRef.current), 400);
  }

  // Create the editor instance once per mount. Both the editor class and its
  // CSS themes are dynamically imported so they aren't part of the initial
  // /workspace bundle — only paid for once a note is actually opened.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ Crepe }, { replaceAll }] = await Promise.all([
        import("@milkdown/crepe"),
        import("@milkdown/kit/utils"),
      ]);
      if (cancelled || !containerRef.current) return;
      replaceAllRef.current = replaceAll;
      const crepe = new Crepe({
        root: containerRef.current,
        defaultValue: contentRef.current,
        features: {
          [Crepe.Feature.Latex]: false,
          [Crepe.Feature.Toolbar]: false,
          [Crepe.Feature.TopBar]: true,
        },
      });
      crepe.on((listener) => {
        listener.markdownUpdated((_ctx, markdown) => {
          contentRef.current = markdown;
          scheduleSave();
        });
      });
      await crepe.create();
      if (cancelled) {
        crepe.destroy();
        return;
      }
      crepeRef.current = crepe;
    })();
    return () => {
      cancelled = true;
      crepeRef.current?.destroy();
      crepeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap content & metadata when the selected note changes. Flush first so
  // edits made just before switching notes aren't overwritten by stale props.
  // `note.id` here is captured by this effect's own closure at the render
  // where it was still the *previous* note — do not use noteIdRef, which is
  // already mutated to the *new* note's id by the time this cleanup runs.
  useEffect(() => {
    return () => {
      flushSave(note.id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  useEffect(() => {
    setTitle(note.title);
    setTags(note.tags);
    setTagDraft("");
    contentRef.current = note.content_markdown;
    if (crepeRef.current && replaceAllRef.current) {
      crepeRef.current.editor.action(
        replaceAllRef.current(note.content_markdown, true)
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  // Flush immediately when the tab is hidden/closed so nothing is lost to
  // the debounce window (e.g. switching tabs right after typing).
  useEffect(() => {
    const flushCurrent = () => flushSave(noteIdRef.current);
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") flushCurrent();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", flushCurrent);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", flushCurrent);
      flushCurrent();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scheduleSave();
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, tags]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-white px-4 py-3 sm:px-6 dark:border-gray-700 dark:bg-gray-900">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Note title"
          className="w-full bg-transparent text-xl font-semibold text-gray-900 outline-none placeholder:text-gray-300 sm:text-2xl dark:text-gray-100 dark:placeholder:text-gray-600"
        />
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                aria-label={`Remove tag ${tag}`}
                className="text-blue-400 hover:text-blue-700 dark:text-blue-500 dark:hover:text-blue-200"
              >
                <X size={12} />
              </button>
            </span>
          ))}
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={handleTagInputKeyDown}
            onBlur={() => addTag(tagDraft)}
            placeholder={tags.length === 0 ? "Add tags (Enter or comma)" : "Add tag"}
            className="min-w-[8rem] flex-1 bg-transparent text-sm text-gray-500 outline-none placeholder:text-gray-300 dark:text-gray-400 dark:placeholder:text-gray-600"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <div ref={containerRef} className="h-full" />
      </div>
    </div>
  );
}
