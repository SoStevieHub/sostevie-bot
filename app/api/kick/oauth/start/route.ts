// Bot hesabını bağlamak için OAuth akışını başlatır (PKCE).
import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { buildAuthorizeUrl, createPkce } from "@/lib/kick/oauth";
import { config } from "@/lib/config";

export async function GET(req: Request) {
  if (!(await isAuthed())) {
    return NextResponse.redirect(new URL("/admin/login", new URL(req.url).origin));
  }
  if (!config.kick.clientId) {
    return NextResponse.json({ error: "KICK_CLIENT_ID tanımlı değil" }, { status: 400 });
  }

  const { verifier, challenge, state } = createPkce();
  const res = NextResponse.redirect(buildAuthorizeUrl(challenge, state));
  const opts = { httpOnly: true as const, sameSite: "lax" as const, path: "/", maxAge: 600 };
  res.cookies.set("kick_pkce_verifier", verifier, opts);
  res.cookies.set("kick_pkce_state", state, opts);
  return res;
}
