// Ücretsiz nöral TTS (Edge). Admin oturumu ile korunur. MP3 ses döner.
import { isAuthed } from "@/lib/auth";
import { edgeTts, DEFAULT_EDGE_VOICE } from "@/lib/tts/edge";

export const maxDuration = 30;
export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!(await isAuthed())) return new Response("yetkisiz", { status: 401 });
  const { text, voice } = (await req.json().catch(() => ({}))) as { text?: string; voice?: string };
  if (!text || !text.trim()) return new Response("metin yok", { status: 400 });
  try {
    const mp3 = await edgeTts(text.slice(0, 1000), voice || DEFAULT_EDGE_VOICE);
    return new Response(new Uint8Array(mp3), {
      status: 200,
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("[tts] edge hatası:", e);
    return new Response(`tts hata: ${String(e).slice(0, 120)}`, { status: 502 });
  }
}
