// Google Translate TTS — ücretsiz, API key gerektirmez. Türkçe kadın ses.
// ~200 karakter sınırı olduğu için metni kelime sınırından parçalayıp MP3'leri birleştiriyoruz.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

function chunk(text: string, max = 190): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const chunks: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur && (cur + " " + w).length > max) {
      chunks.push(cur);
      cur = w;
    } else {
      cur = cur ? `${cur} ${w}` : w;
    }
  }
  if (cur) chunks.push(cur);
  return chunks.length ? chunks : [text.slice(0, max)];
}

export async function ttsTurkish(text: string, lang = "tr"): Promise<Buffer> {
  const parts = chunk(text.slice(0, 800), 190);
  const bufs: Buffer[] = [];
  for (const p of parts) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encodeURIComponent(p)}&textlen=${p.length}`;
    const res = await fetch(url, { headers: { "User-Agent": UA, Referer: "https://translate.google.com/" } });
    if (!res.ok) throw new Error(`gtts ${res.status}`);
    bufs.push(Buffer.from(await res.arrayBuffer()));
  }
  if (bufs.length === 0) throw new Error("gtts boş");
  return Buffer.concat(bufs);
}
