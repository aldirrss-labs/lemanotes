"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { Note } from "@/lib/types";
import "@uiw/react-md-editor/markdown-editor.css";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

type Props = {
  note: Note;
  theme?: "light" | "dark";
  onChange: (patch: Partial<Note>) => void;
};

export default function NoteEditor({ note, theme = "light", onChange }: Props) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content_markdown);
  const [tagsInput, setTagsInput] = useState(note.tags.join(", "));

  // Sinkronkan bila note yang dipilih berganti.
  useEffect(() => {
    setTitle(note.title);
    setContent(note.content_markdown);
    setTagsInput(note.tags.join(", "));
  }, [note.id]);

  // Debounce simpan.
  useEffect(() => {
    const t = setTimeout(() => {
      const tags = tagsInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const changed =
        title !== note.title ||
        content !== note.content_markdown ||
        tags.join(",") !== note.tags.join(",");
      if (changed) {
        onChange({ title, content_markdown: content, tags });
      }
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, tagsInput]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-white px-6 py-3 dark:border-gray-700 dark:bg-gray-900">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Note title"
          className="w-full bg-transparent text-2xl font-semibold text-gray-900 outline-none placeholder:text-gray-300 dark:text-gray-100 dark:placeholder:text-gray-600"
        />
        <input
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="comma-separated tags (e.g. work, ideas)"
          className="mt-1 w-full bg-transparent text-sm text-gray-500 outline-none placeholder:text-gray-300 dark:text-gray-400 dark:placeholder:text-gray-600"
        />
      </div>
      <div className="flex-1 overflow-auto" data-color-mode={theme}>
        <MDEditor
          value={content}
          onChange={(v) => setContent(v ?? "")}
          height="100%"
          visibleDragbar={false}
          preview="live"
        />
      </div>
    </div>
  );
}