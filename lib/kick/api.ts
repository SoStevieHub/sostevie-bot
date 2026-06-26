// Kick public API istemcisi — geçerli token yönetimi + mesaj/abonelik işlemleri.
import { KICK_API_BASE, config } from "@/lib/config";
import { getToken, setToken } from "@/lib/store";
import { refreshToken } from "./oauth";

// Süresi dolmak üzereyse token'ı yeniler; geçerli access token döner.
export async function getValidAccessToken(): Promise<string | null> {
  const t = await getToken();
  if (!t) return null;

  // 60 sn'den az kaldıysa yenile.
  if (t.expiresAt - Date.now() > 60_000) return t.accessToken;

  try {
    const refreshed = await refreshToken(t.refreshToken);
    await setToken({
      ...t,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token || t.refreshToken,
      expiresAt: Date.now() + refreshed.expires_in * 1000,
      scope: refreshed.scope ?? t.scope,
    });
    return refreshed.access_token;
  } catch (e) {
    console.error("[kick] token yenileme hatası:", e);
    return null;
  }
}

async function kickFetch(path: string, init: RequestInit & { token?: string } = {}) {
  const token = init.token ?? (await getValidAccessToken());
  if (!token) throw new Error("Bot hesabı bağlı değil (token yok).");
  const res = await fetch(`${KICK_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  return res;
}

type KickChannel = { broadcaster_user_id: number; slug: string; [k: string]: unknown };

// Slug'tan kanal bilgisi (broadcaster_user_id) çek.
export async function getChannelBySlug(slug: string, token?: string): Promise<KickChannel | null> {
  const res = await kickFetch(`/channels?slug=${encodeURIComponent(slug)}`, { token });
  if (!res.ok) {
    console.error("[kick] kanal çekme hatası:", res.status, await res.text());
    return null;
  }
  const json = (await res.json()) as { data?: KickChannel[] };
  return json.data?.[0] ?? null;
}

// Token'ın ait olduğu kullanıcıyı çek (bot hesabının kimliği).
export async function getTokenUser(token: string): Promise<{ user_id: number; name: string } | null> {
  const res = await kickFetch(`/users`, { token });
  if (!res.ok) {
    console.error("[kick] kullanıcı çekme hatası:", res.status, await res.text());
    return null;
  }
  const json = (await res.json()) as { data?: { user_id: number; name: string }[] };
  return json.data?.[0] ?? null;
}

export type SendResult = { ok: boolean; status?: number; error?: string };

// Kanala mesaj gönder (bot olarak). content 500 char'ı aşmamalı (biz 350 ile sınırlıyoruz).
export async function sendChatMessage(broadcasterUserId: number, content: string): Promise<SendResult> {
  const res = await kickFetch(`/chat`, {
    method: "POST",
    body: JSON.stringify({
      broadcaster_user_id: broadcasterUserId,
      content,
      // Başka birinin kanalına (sostevie) yazdığımız için "user". "bot" yalnız
      // token sahibinin kendi kanalına yazar ve burada Kick 500 döndürür.
      type: "user",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("[kick] mesaj gönderme hatası:", res.status, body);
    return { ok: false, status: res.status, error: body.slice(0, 300) };
  }
  return { ok: true };
}

// chat.message.sent webhook aboneliği oluştur.
export async function subscribeChatEvents(broadcasterUserId: number): Promise<boolean> {
  const res = await kickFetch(`/events/subscriptions`, {
    method: "POST",
    body: JSON.stringify({
      broadcaster_user_id: broadcasterUserId,
      method: "webhook",
      events: [{ name: "chat.message.sent", version: 1 }],
    }),
  });
  if (!res.ok) {
    console.error("[kick] abonelik hatası:", res.status, await res.text());
    return false;
  }
  return true;
}

// "sostevie" kanalının broadcaster id'sini bir kez çözüp önbelleğe al.
let cachedBroadcasterId: number | null = null;
export async function getChannelBroadcasterId(): Promise<number | null> {
  if (cachedBroadcasterId) return cachedBroadcasterId;
  try {
    const ch = await getChannelBySlug(config.kick.channelSlug);
    if (ch) cachedBroadcasterId = ch.broadcaster_user_id;
  } catch (e) {
    console.error("[kick] broadcaster id çözülemedi:", e);
  }
  return cachedBroadcasterId;
}
