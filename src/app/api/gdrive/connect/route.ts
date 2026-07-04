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
      "GOOGLE_CLIENT_ID belum diisi. Lengkapi kredensial Google OAuth dulu di .env.",
      { status: 501 }
    );
  }

  // state = user id (idealnya ditandatangani/HMAC untuk produksi).
  return NextResponse.redirect(buildAuthorizeUrl(user.id));
}
