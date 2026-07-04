// Serialisasi/parsing markdown dengan frontmatter YAML sederhana.
// Kompatibel dibuka di Joplin / Obsidian.
import type { Note } from "./types";

export type ParsedMarkdown = {
  title: string;
  tags: string[];
  created_at?: string;
  updated_at?: string;
  body: string;
};

// Ubah note -> string .md dengan frontmatter.
export function noteToMarkdown(note: Pick<
  Note,
  "title" | "tags" | "content_markdown" | "created_at" | "updated_at"
>): string {
  const fm: string[] = ["---"];
  fm.push(`title: ${escapeYaml(note.title)}`);
  if (note.tags && note.tags.length) {
    fm.push(`tags: [${note.tags.map(escapeYaml).join(", ")}]`);
  }
  if (note.created_at) fm.push(`created_at: ${note.created_at}`);
  if (note.updated_at) fm.push(`updated_at: ${note.updated_at}`);
  fm.push("---", "");
  return fm.join("\n") + (note.content_markdown ?? "");
}

// Parse string .md -> objek. Toleran bila tidak ada frontmatter.
export function markdownToNote(raw: string, fallbackTitle = "Untitled"): ParsedMarkdown {
  const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!fmMatch) {
    return { title: fallbackTitle, tags: [], body: raw };
  }
  const fmBlock = fmMatch[1];
  const body = raw.slice(fmMatch[0].length);

  const get = (key: string): string | undefined => {
    const m = fmBlock.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
    return m ? m[1].trim() : undefined;
  };

  const title = unquote(get("title") ?? "") || fallbackTitle;

  let tags: string[] = [];
  const tagsRaw = get("tags");
  if (tagsRaw) {
    tags = tagsRaw
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((t) => unquote(t.trim()))
      .filter(Boolean);
  }

  return {
    title,
    tags,
    created_at: get("created_at"),
    updated_at: get("updated_at"),
    body,
  };
}

// Nama file aman untuk sistem file / Google Drive.
export function safeFileName(title: string): string {
  return (
    title
      .replace(/[\/\\:*?"<>|]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "untitled"
  );
}

function escapeYaml(v: string): string {
  if (/[:#\[\]{},&*!|>'"%@`]/.test(v) || v.includes("\n")) {
    return `"${v.replace(/"/g, '\\"')}"`;
  }
  return v;
}

function unquote(v: string): string {
  return v.replace(/^["']|["']$/g, "");
}
