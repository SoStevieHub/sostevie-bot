// Kick public API istemcisi — iki token (reader=yayıncı, writer=bot) yönetimi.
import { KICK_API_BASE } from "@/lib/config";
import { getToken, setToken, getBroadcasterId, type Role } from "@/lib/store";
import { refreshToken } from "./oauth";

// Süresi dolmak üzereyse ilgili rolün token'ını yeniler; geçerli access token döner.
export async function getValidAccessToken(role: Role): Promise<string | null> {
  const t = await getToken(role);
  if (!t) return null;

  // 60 sn'den az kaldıysa yenile.
  if (t.expiresAt - Date.now() > 60_000) return t.accessToken;

  try {
    const refreshed = await refreshToken(t.refreshToken);
    await setToken(role, {
      ...t,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token || t.refreshToken,
      expiresAt: Date.now() + refreshed.expires_in * 1000,
      scope: refreshed.scope ?? t.scope,
    });
    return refreshed.access_token;
  } catch (e) {
    console.error(`[kick] token yenileme hatası (${role}):`, e);
    return null;
  }
}

async function kickFetch(
  path: string,
  init: RequestInit & { token?: string; role?: Role } = {},
) {
  const token = init.token ?? (init.role ? await getValidAccessToken(init.role) : null);
  if (!token) throw new Error("Geçerli token yok (hesap bağlı değil).");
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
export async function getChannelBySlug(slug: string, token: string): Promise<KickChannel | null> {
  const res = await kickFetch(`/channels?slug=${encodeURIComponent(slug)}`, { token });
  if (!res.ok) {
    console.error("[kick] kanal çekme hatası:", res.status, await res.text());
    return null;
  }
  const json = (await res.json()) as { data?: KickChannel[] };
  return json.data?.[0] ?? null;
}

// Token'ın ait olduğu kullanıcıyı çek (hesabın kimliği).
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

// Kanala mesaj gönder — BOT (writer) token'ı ile, type:user.
export async function sendChatMessage(broadcasterUserId: number, content: string): Promise<SendResult> {
  const res = await kickFetch(`/chat`, {
    role: "writer",
    method: "POST",
    body: JSON.stringify({
      broadcaster_user_id: broadcasterUserId,
      content,
      // Yayıncının kanalına yazıyoruz; bot kendi kanalı olmadığından "user".
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

// chat.message.sent webhook aboneliği — YAYINCI (reader) token'ı ile.
export async function subscribeChatEvents(broadcasterUserId: number, token: string): Promise<boolean> {
  const res = await kickFetch(`/events/subscriptions`, {
    token,
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

// Yayıncı kanalının broadcaster id'si (reader bağlanınca store'a yazılır).
export async function getChannelBroadcasterId(): Promise<number | null> {
  return getBroadcasterId();
}
