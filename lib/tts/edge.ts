// Microsoft Edge "sesli oku" (read-aloud) TTS — Azure ile AYNI nöral sesler (Emel/Ahmet),
// ama API KEY YOK, KOTA YOK, bedava. Resmî olmayan uç: nadiren bozulabilir → route Google'a düşer.
// GEC token algoritması bozulursa EDGE_VER'i güncel bir Edge sürümüne çek.
import WebSocket from "ws";
import { createHash, randomUUID } from "node:crypto";

const TRUSTED = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
// Bozulursa (403) edge-tts kaynağından güncel değerleri al:
// github.com/rany2/edge-tts → src/edge_tts/constants.py (SEC_MS_GEC_VERSION + User-Agent).
const GEC_VERSION = "1-143.0.3650.75"; // Sec-MS-GEC-Version query paramı (birebir)
const UA_VER = "143.0.0.0"; // User-Agent'taki Chrome/Edg sürümü
const ORIGIN = "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold";
const WSS = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";

// Sec-MS-GEC: Windows dosya zamanı (100ns) 5 dk'ya yuvarlanır + sabit token → SHA256 (BÜYÜK harf hex).
// ÖNEMLİ: edge-tts float64 aritmetiği kullanıyor; sunucu birebir o değeri bekliyor. JS de float64
// olduğu için ×10^7'yi Number ile yapıp toFixed(0) ile Python'un f"{x:.0f}" davranışını eşliyoruz.
function gecToken(): string {
  const WIN_EPOCH = 11644473600; // 1601→1970 arası saniye
  const secs = Math.floor(Date.now() / 1000) + WIN_EPOCH;
  const rounded = secs - (secs % 300); // 5 dakikalık pencereye yuvarla
  const ticks = (rounded * 1e7).toFixed(0); // saniye → 100ns birimi (float64, edge-tts ile aynı)
  return createHash("sha256").update(ticks + TRUSTED).digest("hex").toUpperCase();
}

function mapVoice(v?: string): string {
  if (v && /ahmet/i.test(v)) return "tr-TR-AhmetNeural";
  if (v && /^tr-TR-/.test(v)) return v;
  return "tr-TR-EmelNeural";
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export async function edgeTts(text: string, voice?: string): Promise<Buffer> {
  const name = mapVoice(voice);
  const clean = text.slice(0, 2000);
  const url =
    `${WSS}?TrustedClientToken=${TRUSTED}` +
    `&Sec-MS-GEC=${gecToken()}&Sec-MS-GEC-Version=${GEC_VERSION}` +
    `&ConnectionId=${randomUUID().replace(/-/g, "")}`;

  const ws = new WebSocket(url, {
    headers: {
      "User-Agent":
        `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${UA_VER} Safari/537.36 Edg/${UA_VER}`,
      "Accept-Encoding": "gzip, deflate, br, zstd",
      "Accept-Language": "en-US,en;q=0.9",
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
      Origin: ORIGIN,
    },
  });

  const chunks: Buffer[] = [];
  let settled = false;

  return await new Promise<Buffer>((resolve, reject) => {
    const finish = (err: Error | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* noop */ }
      if (err) reject(err);
      else if (chunks.length) resolve(Buffer.concat(chunks));
      else reject(new Error("edge tts: boş yanıt"));
    };
    const timer = setTimeout(() => { try { ws.terminate(); } catch { /* noop */ } finish(new Error("edge tts: zaman aşımı")); }, 20000);

    ws.on("open", () => {
      const ts = new Date().toString();
      ws.send(
        `X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`,
      );
      const reqId = randomUUID().replace(/-/g, "").toUpperCase();
      const ssml =
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='tr-TR'>` +
        `<voice name='${name}'>${escapeXml(clean)}</voice></speak>`;
      ws.send(`X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ts}Z\r\nPath:ssml\r\n\r\n${ssml}`);
    });

    ws.on("message", (data: Buffer, isBinary: boolean) => {
      if (isBinary) {
        // İkili çerçeve: [2 byte başlık uzunluğu][başlık][ses baytları]
        if (data.length < 2) return;
        const headerLen = data.readUInt16BE(0);
        const audio = data.subarray(2 + headerLen);
        if (audio.length) chunks.push(Buffer.from(audio));
      } else if (data.toString("utf8").includes("Path:turn.end")) {
        finish(null);
      }
    });

    ws.on("error", (e) => finish(new Error(`edge ws: ${String(e).slice(0, 120)}`)));
    ws.on("close", () => finish(null));
  });
}
