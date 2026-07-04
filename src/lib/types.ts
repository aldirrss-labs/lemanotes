export type Notebook = {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
  gdrive_folder_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Note = {
  id: string;
  user_id: string;
  notebook_id: string | null;
  title: string;
  content_markdown: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  last_synced_at: string | null;
  gdrive_file_id: string | null;
};

// Notebook dengan anak-anaknya, untuk render tree.
export type NotebookNode = Notebook & { children: NotebookNode[] };

export type SyncLog = {
  id: string;
  user_id: string;
  note_id: string | null;
  status: "success" | "failed";
  message: string | null;
  synced_at: string;
};