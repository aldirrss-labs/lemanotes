import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Workspace from "@/components/workspace";
import type { Notebook, Note } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: notebooks } = await supabase
    .from("notebooks")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const { data: notes } = await supabase
    .from("notes")
    .select("*")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, gdrive_connected")
    .eq("id", user.id)
    .single();

  return (
    <Workspace
      initialNotebooks={(notebooks ?? []) as Notebook[]}
      initialNotes={(notes ?? []) as Note[]}
      displayName={profile?.display_name ?? user.email ?? "User"}
      gdriveConnected={profile?.gdrive_connected ?? false}
    />
  );
}
