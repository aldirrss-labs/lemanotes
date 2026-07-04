"use client";

import { useEffect, useRef, useState } from "react";
import type Editor from "@toast-ui/editor";
import type { Note } from "@/lib/types";
import "@toast-ui/editor/dist/toastui-editor.css";
import "@toast-ui/editor/dist/theme/toastui-editor-dark.css";

type Props = {
  note: Note;
  theme?: "light" | "dark";
  onChange: (patch: Partial<Note>) => void;
};

export default function NoteEditor({ note, theme = "light", onChange }: Props) {
  const [title, setTitle] = useState(note.title);
  const [tagsInput, setTagsInput] = useState(note.tags.join(", "));

  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const contentRef = useRef(note.content_markdown);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Create the editor instance once per mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { default: ToastEditor } = await import("@toast-ui/editor");
      if (cancelled || !containerRef.current) return;
      const instance = new ToastEditor({
        el: containerRef.current,
        height: "100%",
        initialEditType: "wysiwyg",
        previewStyle: "tab",
        hideModeSwitch: true,
        theme: theme === "dark" ? "dark" : "light",
        initialValue: contentRef.current,
        placeholder: "Mulai menulis...",
        events: {
          change: () => {
            contentRef.current = instance.getMarkdown();
            scheduleSave();
          },
        },
      });
      editorRef.current = instance;
    })();
    return () => {
      cancelled = true;
      editorRef.current?.destroy();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap content & metadata when the selected note changes.
  useEffect(() => {
    setTitle(note.title);
    setTagsInput(note.tags.join(", "));
    contentRef.current = note.content_markdown;
    editorRef.current?.setMarkdown(note.content_markdown, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  function scheduleSave() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const tags = tagsInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      onChange({
        title,
        content_markdown: contentRef.current,
        tags,
      });
    }, 700);
  }

  useEffect(() => {
    scheduleSave();
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, tagsInput]);

  // Toast UI Editor has no runtime theme-switch API; toggle the class manually.
  useEffect(() => {
    const root = containerRef.current?.querySelector(
      ".toastui-editor-defaultUI"
    );
    root?.classList.toggle("toastui-editor-dark", theme === "dark");
  }, [theme]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-white px-4 py-3 sm:px-6 dark:border-gray-700 dark:bg-gray-900">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Note title"
          className="w-full bg-transparent text-xl font-semibold text-gray-900 outline-none placeholder:text-gray-300 sm:text-2xl dark:text-gray-100 dark:placeholder:text-gray-600"
        />
        <input
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="comma-separated tags (e.g. work, ideas)"
          className="mt-1 w-full bg-transparent text-sm text-gray-500 outline-none placeholder:text-gray-300 dark:text-gray-400 dark:placeholder:text-gray-600"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <div ref={containerRef} className="h-full" />
      </div>
    </div>
  );
}
