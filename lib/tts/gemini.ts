// Gemini TTS — GEMINI_API_KEY varsa kullanılır (ücretsiz kademe, rate-limitli).
// Model 24kHz mono PCM (16-bit) döner; tarayıcının çalabilmesi için WAV başlığı ekliyoruz.
import { config } from "@/lib/config";

export function geminiTtsConfigured(): boolean {
  return !!config.gemini.apiKey;
}

// Ham PCM (s16le mono) için minimal WAV başlığı üret.
function wavHeader(dataLen: number, rate: number, channels = 1, bits = 16): Buffer {
  const blockAlign = (channels * bits) / 8;
  const byteRate = rate * blockAlign;
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + dataLen, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); // fmt chunk boyutu
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(byteRate, 28);
  h.writeUInt16LE(blockAlign, 32);
  h.writeUInt16LE(bits, 34);
  h.write("data", 36);
  h.writeUInt32LE(dataLen, 40);
  return h;
}

export async function geminiTts(text: string): Promise<Buffer> {
  if (!config.gemini.apiKey) throw new Error("GEMINI_API_KEY yok");
  const model = config.gemini.ttsModel;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": config.gemini.apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: text.slice(0, 2000) }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: config.gemini.ttsVoice } } },
      },
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`gemini tts ${res.status}: ${(await res.text()).slice(0, 150)}`);

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[];
  };
  const inline = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
  if (!inline?.data) throw new Error("gemini tts: ses verisi yok");
  const pcm = Buffer.from(inline.data, "base64");
  const rate = Number(/rate=(\d+)/.exec(inline.mimeType ?? "")?.[1] ?? 24000);
  return Buffer.concat([wavHeader(pcm.length, rate), pcm]);
}
