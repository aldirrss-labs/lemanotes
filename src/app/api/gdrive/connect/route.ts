import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAuthorizeUrl } from "@/lib/gdrive";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.redirect(
      new URL("/login", process.env.NEXT_PUBLIC_APP_URL)
    );

  if (!process.env.GOOGLE_CLIENT_ID) {
    return new NextResponse(
      "GOOGLE_CLIENT_ID is not set. Configure Google OAuth credentials in .env first.",
      { status: 501 }
    );
  }

  // state = user id (ideally signed/HMAC-ed for production).
  return NextResponse.redirect(buildAuthorizeUrl(user.id));
}
