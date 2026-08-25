// Azure Speech nöral TTS (Emel/Ahmet). Key varsa kullanılır. Ücretsiz kademe: ~500k karakter/ay.
import { config } from "@/lib/config";

export function azureConfigured(): boolean {
  return !!config.azure.key && !!config.azure.region;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// Kısa etiket -> Azure nöral ses adı.
function mapVoice(v?: string): string {
  if (!v) return "tr-TR-EmelNeural";
  if (/ahmet/i.test(v)) return "tr-TR-AhmetNeural";
  if (/emel/i.test(v)) return "tr-TR-EmelNeural";
  if (/^tr-TR-/.test(v)) return v;
  return "tr-TR-EmelNeural";
}

export async function azureTts(text: string, voice?: string): Promise<Buffer> {
  const name = mapVoice(voice);
  const ssml =
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='tr-TR'>` +
    `<voice name='${name}'>${escapeXml(text)}</voice></speak>`;
  const res = await fetch(`https://${config.azure.region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": config.azure.key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      "User-Agent": "sostevie-bot",
    },
    body: ssml,
  });
  if (!res.ok) throw new Error(`azure ${res.status}: ${(await res.text()).slice(0, 120)}`);
  return Buffer.from(await res.arrayBuffer());
}
