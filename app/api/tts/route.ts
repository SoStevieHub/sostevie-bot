// Ücretsiz/kaliteli TTS. Azure key varsa nöral Emel; yoksa Google Türkçe. Admin oturumu ile korunur.
import { isAuthed } from "@/lib/auth";
import { ttsTurkish } from "@/lib/tts/gtts";
import { azureConfigured, azureTts } from "@/lib/tts/azure";

export const maxDuration = 30;
export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!(await isAuthed())) return new Response("yetkisiz", { status: 401 });
  const { text, voice } = (await req.json().catch(() => ({}))) as { text?: string; voice?: string };
  if (!text || !text.trim()) return new Response("metin yok", { status: 400 });
  try {
    let mp3: Buffer;
    if (voice && /google|filiz/i.test(voice)) mp3 = await ttsTurkish(text);
    else if (azureConfigured()) mp3 = await azureTts(text, voice);
    else mp3 = await ttsTurkish(text);
    return new Response(new Uint8Array(mp3), {
      status: 200,
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("[tts] hata:", e);
    // Azure hata verirse Google'a düş.
    try {
      const mp3 = await ttsTurkish(text);
      return new Response(new Uint8Array(mp3), { status: 200, headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
    } catch (e2) {
      return new Response(`tts hata: ${String(e2).slice(0, 120)}`, { status: 502 });
    }
  }
}
