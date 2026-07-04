"use client";

import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Plus,
  MoreVertical,
} from "lucide-react";
import type { NotebookNode } from "@/lib/types";

type Props = {
  nodes: NotebookNode[];
  selectedNotebookId: string | null;
  noteCounts: Record<string, number>;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string | null) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  depth?: number;
};

export default function NotebookTree(props: Props) {
  const { nodes, depth = 0 } = props;
  return (
    <ul>
      {nodes.map((node) => (
        <TreeItem key={node.id} node={node} {...props} depth={depth} />
      ))}
    </ul>
  );
}

function TreeItem({
  node,
  selectedNotebookId,
  noteCounts,
  onSelect,
  onAddChild,
  onRename,
  onDelete,
  depth = 0,
}: Props & { node: NotebookNode }) {
  const [open, setOpen] = useState(true);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(node.name);
  const hasChildren = node.children.length > 0;
  const selected = selectedNotebookId === node.id;

  return (
    <li>
      <div
        className={`group flex items-center gap-1 rounded-md px-2 py-1 text-sm ${
          selected ? "bg-sidebar-hover" : "hover:bg-sidebar-hover"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <button
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 text-gray-400"
          aria-label="toggle"
        >
          {hasChildren ? (
            open ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )
          ) : (
            <span className="inline-block w-[14px]" />
          )}
        </button>

        {open && hasChildren ? (
          <FolderOpen size={15} className="shrink-0 text-amber-400" />
        ) : (
          <Folder size={15} className="shrink-0 text-amber-400" />
        )}

        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              setEditing(false);
              if (name.trim() && name !== node.name) onRename(node.id, name.trim());
              else setName(node.name);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setName(node.name);
                setEditing(false);
              }
            }}
            className="flex-1 rounded bg-sidebar px-1 text-white outline-none ring-1 ring-blue-500"
          />
        ) : (
          <button
            onClick={() => onSelect(node.id)}
            className="flex-1 truncate text-left"
            title={node.name}
          >
            {node.name}
            {noteCounts[node.id] ? (
              <span className="ml-1 text-xs text-gray-500">
                ({noteCounts[node.id]})
              </span>
            ) : null}
          </button>
        )}

        <div className="relative">
          <button
            onClick={() => setMenu((m) => !m)}
            className="opacity-0 group-hover:opacity-100"
            aria-label="menu"
          >
            <MoreVertical size={14} />
          </button>
          {menu && (
            <div
              className="absolute right-0 z-10 mt-1 w-40 rounded-md border bg-white py-1 text-gray-800 shadow-lg dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
              onMouseLeave={() => setMenu(false)}
            >
              <button
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={() => {
                  onAddChild(node.id);
                  setMenu(false);
                  setOpen(true);
                }}
              >
                + Sub-notebook
              </button>
              <button
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={() => {
                  setEditing(true);
                  setMenu(false);
                }}
              >
                Rename
              </button>
              <button
                className="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={() => {
                  onDelete(node.id);
                  setMenu(false);
                }}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {open && hasChildren && (
        <NotebookTree
          nodes={node.children}
          selectedNotebookId={selectedNotebookId}
          noteCounts={noteCounts}
          onSelect={onSelect}
          onAddChild={onAddChild}
          onRename={onRename}
          onDelete={onDelete}
          depth={depth + 1}
        />
      )}
    </li>
  );
}