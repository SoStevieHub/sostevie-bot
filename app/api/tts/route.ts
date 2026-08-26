// /ear için TTS. Ses seçimine göre backend: edge (bedava nöral) / gemini / azure (Emel) / google.
// Hata olursa her zaman Google Türkçe'ye düşer (yayın sessiz kalmasın). Admin oturumu ile korunur.
import { isAuthed } from "@/lib/auth";
import { ttsTurkish } from "@/lib/tts/gtts";
import { azureConfigured, azureTts } from "@/lib/tts/azure";
import { edgeTts } from "@/lib/tts/edge";
import { geminiTts } from "@/lib/tts/gemini";

export const maxDuration = 30;
export const runtime = "nodejs";

// Seçilen sese göre uygun backend'i çağır; { ses, MIME } döndür.
async function synth(text: string, voice?: string): Promise<{ buf: Buffer; mime: string }> {
  if (voice && /edge/i.test(voice)) return { buf: await edgeTts(text, voice), mime: "audio/mpeg" };
  if (voice && /gemini/i.test(voice)) return { buf: await geminiTts(text), mime: "audio/wav" };
  if (voice && /google|filiz/i.test(voice)) return { buf: await ttsTurkish(text), mime: "audio/mpeg" };
  if (azureConfigured()) return { buf: await azureTts(text, voice), mime: "audio/mpeg" };
  return { buf: await ttsTurkish(text), mime: "audio/mpeg" };
}

export async function POST(req: Request) {
  if (!(await isAuthed())) return new Response("yetkisiz", { status: 401 });
  const { text, voice } = (await req.json().catch(() => ({}))) as { text?: string; voice?: string };
  if (!text || !text.trim()) return new Response("metin yok", { status: 400 });
  try {
    const { buf, mime } = await synth(text, voice);
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: { "Content-Type": mime, "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("[tts] hata:", e);
    // Seçilen backend patlarsa Google'a düş (Emel/Edge/Gemini bozulsa bile ses gelsin).
    try {
      const mp3 = await ttsTurkish(text);
      return new Response(new Uint8Array(mp3), { status: 200, headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
    } catch (e2) {
      return new Response(`tts hata: ${String(e2).slice(0, 120)}`, { status: 502 });
    }
  }
}
