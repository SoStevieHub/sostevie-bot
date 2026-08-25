// Microsoft Edge "Read Aloud" online nöral TTS — API key gerektirmez, ücretsiz.
// WebSocket üzerinden SSML gönderip MP3 ses alır (Emel vb. Türkçe nöral sesler).
import crypto from "node:crypto";
import WebSocket from "ws";

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const WSS_BASE = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
const CHROMIUM_VER = "1-131.0.2903.51";

// Sec-MS-GEC: 5 dakikalık pencereye yuvarlanmış Windows file-time + token'ın SHA256'sı (BigInt şart, sayı çok büyük).
function secMsGec(): string {
  const ticks = BigInt(Date.now()) * BigInt(10000) + BigInt("116444736000000000"); // ms -> 100ns ticks
  const rounded = ticks - (ticks % BigInt("3000000000")); // 5 dk = 3e9 tick
  return crypto.createHash("sha256").update(`${rounded.toString()}${TRUSTED_CLIENT_TOKEN}`).digest("hex").toUpperCase();
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export const DEFAULT_EDGE_VOICE = "tr-TR-EmelNeural";

// Kısa voice adını tam SSML voice adına çevir (tr-TR-EmelNeural -> Microsoft Server Speech ...).
function fullVoice(short: string): string {
  const m = short.match(/^([a-z]{2}-[A-Z]{2})-(.+)$/);
  if (!m) return short;
  return `Microsoft Server Speech Text to Speech Voice (${m[1]}, ${m[2]})`;
}

export async function edgeTts(text: string, voice: string = DEFAULT_EDGE_VOICE): Promise<Buffer> {
  const connId = crypto.randomUUID().replace(/-/g, "");
  const url = `${WSS_BASE}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${secMsGec()}&Sec-MS-GEC-Version=${CHROMIUM_VER}&ConnectionId=${connId}`;
  const ws = new WebSocket(url, {
    headers: {
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
      Origin: "chrome-extension://jdiccldimpahibkdeljjbmcndclbhnpo",
      "Accept-Encoding": "gzip, deflate, br",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
    },
  });

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const timeout = setTimeout(() => { try { ws.close(); } catch { /* noop */ } reject(new Error("edge-tts timeout")); }, 15000);

    ws.on("open", () => {
      ws.send(
        `X-Timestamp:${new Date().toISOString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
          `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`,
      );
      const ssml =
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='tr-TR'>` +
        `<voice name='${fullVoice(voice)}'><prosody rate='0%' pitch='0%'>${escapeXml(text)}</prosody></voice></speak>`;
      ws.send(
        `X-RequestId:${crypto.randomUUID().replace(/-/g, "")}\r\nContent-Type:application/ssml+xml\r\n` +
          `X-Timestamp:${new Date().toISOString()}Z\r\nPath:ssml\r\n\r\n${ssml}`,
      );
    });

    ws.on("message", (data: WebSocket.RawData, isBinary: boolean) => {
      if (isBinary) {
        const buf = data as Buffer;
        if (buf.length < 2) return;
        const headerLen = buf.readUInt16BE(0);
        if (2 + headerLen <= buf.length) chunks.push(buf.subarray(2 + headerLen));
      } else {
        const s = data.toString();
        if (s.includes("Path:turn.end")) {
          clearTimeout(timeout);
          try { ws.close(); } catch { /* noop */ }
          if (chunks.length === 0) reject(new Error("edge-tts boş ses"));
          else resolve(Buffer.concat(chunks));
        }
      }
    });

    ws.on("error", (e) => { clearTimeout(timeout); reject(e); });
    ws.on("close", () => { clearTimeout(timeout); if (chunks.length > 0) resolve(Buffer.concat(chunks)); });
  });
}
