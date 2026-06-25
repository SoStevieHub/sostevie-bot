// Admin tetiklemeli aksiyonlar: test mesajı gönder, hemen haber paylaş.
import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { getChannelBroadcasterId, sendChatMessage } from "@/lib/kick/api";
import { runNewsTick } from "@/lib/bot";
import { addLog } from "@/lib/store";
import { finalizeMessage } from "@/lib/moderation";

export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "yetkisiz" }, { status: 401 });
  const { action, text } = (await req.json().catch(() => ({}))) as { action?: string; text?: string };

  if (action === "test") {
    const id = await getChannelBroadcasterId();
    if (!id) return NextResponse.json({ error: "Kanal/token yok. Önce bot hesabını bağla." }, { status: 400 });
    const msg = finalizeMessage(text || "Selam millet, bot ayakta! 🤖", { isInsult: false });
    const ok = await sendChatMessage(id, msg);
    if (ok) await addLog({ direction: "out", kind: "reply", username: "(test)", content: msg });
    return NextResponse.json({ ok, sent: msg });
  }

  if (action === "news") {
    const r = await runNewsTick();
    return NextResponse.json(r);
  }

  return NextResponse.json({ error: "bilinmeyen aksiyon" }, { status: 400 });
}
