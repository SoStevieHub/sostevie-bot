// OAuth callback — kodu token'a çevirir, role'e göre kaydeder.
// reader (yayıncı) bağlanınca broadcaster id'yi çözer ve chat aboneliğini kurar.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAuthed } from "@/lib/auth";
import { exchangeCode } from "@/lib/kick/oauth";
import { getTokenUser, getChannelBySlug, subscribeChatEvents } from "@/lib/kick/api";
import { setToken, setBroadcasterId, type Role } from "@/lib/store";
import { config } from "@/lib/config";

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const back = (params: string) => NextResponse.redirect(new URL(`/admin?${params}`, origin));

  if (!(await isAuthed())) {
    return NextResponse.redirect(new URL("/admin/login", origin));
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
  const role: Role = jar.get("kick_oauth_role")?.value === "writer" ? "writer" : "reader";
  if (!verifier || !savedState || savedState !== state) {
    return back("kick=error&msg=pkce-uyusmadi");
  }

  try {
    const tok = await exchangeCode(code, verifier);
    const me = await getTokenUser(tok.access_token);

    await setToken(role, {
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      expiresAt: Date.now() + tok.expires_in * 1000,
      scope: tok.scope ?? "",
      botUserId: me ? String(me.user_id) : "",
      botUsername: me?.name ?? "",
    });

    let subMsg: string = role;
    if (role === "reader") {
      // Yayıncı bağlandı: kanal id'sini çöz ve chat aboneliğini onun token'ıyla kur.
      const channel = await getChannelBySlug(config.kick.channelSlug, tok.access_token);
      const broadcasterId = channel?.broadcaster_user_id ?? me?.user_id;
      if (broadcasterId) {
        await setBroadcasterId(broadcasterId);
        const ok = await subscribeChatEvents(broadcasterId, tok.access_token);
        subMsg = ok ? "yayinci-abone-olundu" : "abonelik-hatasi";
      } else {
        subMsg = "kanal-bulunamadi";
      }
    } else {
      subMsg = "bot-baglandi";
    }

    const res = back(`kick=ok&sub=${subMsg}`);
    res.cookies.delete("kick_pkce_verifier");
    res.cookies.delete("kick_pkce_state");
    res.cookies.delete("kick_oauth_role");
    return res;
  } catch (e) {
    console.error("[oauth] callback hatası:", e);
    return back(`kick=error&msg=${encodeURIComponent(String(e))}`);
  }
}
