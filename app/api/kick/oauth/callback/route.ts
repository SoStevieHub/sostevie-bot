// OAuth callback — kodu token'a çevirir, bot kimliğini çeker, aboneliği kurar.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAuthed } from "@/lib/auth";
import { exchangeCode } from "@/lib/kick/oauth";
import { getTokenUser, getChannelBySlug, subscribeChatEvents } from "@/lib/kick/api";
import { setToken } from "@/lib/store";
import { config } from "@/lib/config";

function back(params: string) {
  return NextResponse.redirect(new URL(`/admin?${params}`, config.publicBaseUrl));
}

export async function GET(req: Request) {
  if (!(await isAuthed())) {
    return NextResponse.redirect(new URL("/admin/login", config.publicBaseUrl));
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  if (error) return back(`kick=error&msg=${encodeURIComponent(error)}`);
  if (!code) return back("kick=error&msg=kod-yok");

  const jar = await cookies();
  const verifier = jar.get("kick_pkce_verifier")?.value;
  const savedState = jar.get("kick_pkce_state")?.value;
  if (!verifier || !savedState || savedState !== state) {
    return back("kick=error&msg=pkce-uyusmadi");
  }

  try {
    const tok = await exchangeCode(code, verifier);

    // Bot hesabının kimliğini çek.
    const me = await getTokenUser(tok.access_token);

    await setToken({
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      expiresAt: Date.now() + tok.expires_in * 1000,
      scope: tok.scope ?? "",
      botUserId: me ? String(me.user_id) : "",
      botUsername: me?.name ?? "",
    });

    // Kanalın broadcaster id'sini bul ve chat event aboneliğini kur.
    const channel = await getChannelBySlug(config.kick.channelSlug, tok.access_token);
    let subMsg = "abonelik-atlandi";
    if (channel) {
      const ok = await subscribeChatEvents(channel.broadcaster_user_id);
      subMsg = ok ? "abone-olundu" : "abonelik-hatasi";
    }

    const res = back(`kick=ok&sub=${subMsg}`);
    res.cookies.delete("kick_pkce_verifier");
    res.cookies.delete("kick_pkce_state");
    return res;
  } catch (e) {
    console.error("[oauth] callback hatası:", e);
    return back(`kick=error&msg=${encodeURIComponent(String(e))}`);
  }
}
