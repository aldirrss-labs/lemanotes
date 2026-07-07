import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncUserNotesToDrive } from "@/lib/gdrive-sync";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  try {
    const result = await syncUserNotesToDrive(user.id);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Sync failed." },
      { status: 400 }
    );
  }
}
