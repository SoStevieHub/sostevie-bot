// Kick chat.message.sent webhook'u. Hızlı 200 döner, işlemeyi arka planda yapar.
import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { verifyKickSignature } from "@/lib/kick/webhook";
import { handleIncomingMessage } from "@/lib/bot";

export const maxDuration = 60;

export async function POST(req: Request) {
  const raw = await req.text();

  const eventType = req.headers.get("Kick-Event-Type");
  const valid = await verifyKickSignature(
    {
      messageId: req.headers.get("Kick-Event-Message-Id"),
      timestamp: req.headers.get("Kick-Event-Message-Timestamp"),
      signature: req.headers.get("Kick-Event-Signature"),
    },
    raw,
  );

  // İmza açıkça geçersizse reddet. (null = public key alınamadı, geçişe izin ver.)
  if (valid === false) {
    return NextResponse.json({ error: "imza gecersiz" }, { status: 401 });
  }

  if (eventType && eventType !== "chat.message.sent") {
    return NextResponse.json({ ok: true, skipped: eventType });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "gecersiz json" }, { status: 400 });
  }

  const sender = payload.sender as { username?: string } | undefined;
  const broadcaster = payload.broadcaster as { user_id?: number } | undefined;
  const content = typeof payload.content === "string" ? payload.content : "";

  if (content && broadcaster?.user_id) {
    // Hızlı 200 dön, işlemeyi response sonrası arka planda sürdür (Vercel waitUntil).
    waitUntil(
      handleIncomingMessage({
        username: sender?.username ?? "bilinmeyen",
        content,
        broadcasterUserId: broadcaster.user_id,
      }).catch((e) => console.error("[webhook] işleme hatası:", e)),
    );
  }

  return NextResponse.json({ ok: true });
}
