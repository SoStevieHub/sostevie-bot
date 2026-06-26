// Bot çekirdeği — gelen mesaja cevap kararı ve periyodik haber paylaşımı.
import crypto from "node:crypto";
import { getSettings, getToken, addLog, getRecentPostedNews, addPostedNews, hasPostedNews } from "./store";
import { getChannelBroadcasterId, sendChatMessage } from "./kick/api";
import { generateReply, findBreakingNews } from "./ai/gemini";
import { detectInsult, classifyMention, finalizeMessage, formatNews } from "./moderation";

export type IncomingMessage = {
  username: string;
  content: string;
  broadcasterUserId: number;
};

// Kick'ten gelen bir chat mesajını işle: kaydet, gerekiyorsa cevap üret ve gönder.
export async function handleIncomingMessage(msg: IncomingMessage): Promise<void> {
  const settings = await getSettings();
  if (!settings.botEnabled) return;

  const token = await getToken("writer");
  const botUsername = token?.botUsername ?? "";

  // Botun kendi mesajına cevap verme (döngü engeli).
  if (botUsername && msg.username.toLowerCase() === botUsername.toLowerCase()) return;
  if (!msg.content.trim()) return;

  const isInsult = detectInsult(msg.content);
  const { mentioned, isQuestion } = classifyMention(msg.content, botUsername);

  await addLog({ direction: "in", kind: "incoming", username: msg.username, content: msg.content });

  // Cevap kararı: etiket/hakaret -> her zaman; aksi halde olasılıkla.
  const mustReply = mentioned || isInsult;
  const randomReply = Math.random() * 100 < settings.randomReplyPercent;
  if (!mustReply && !randomReply) return;

  try {
    const raw = await generateReply({
      userMessage: msg.content,
      username: msg.username,
      isInsult,
      isQuestion: isQuestion && mentioned, // sadece bota yönelik soruları araştır
      persona: settings.persona,
      toxicMode: settings.toxicModeEnabled,
    });
    if (!raw) return;

    const text = finalizeMessage(raw, { isInsult });
    const sent = await sendChatMessage(msg.broadcasterUserId, text);
    if (sent.ok) {
      await addLog({
        direction: "out",
        kind: isInsult ? "insult" : "reply",
        username: msg.username,
        content: text,
      });
    }
  } catch (e) {
    console.error("[bot] cevap üretme hatası:", e);
  }
}

function newsHash(title: string): string {
  const norm = title.toLocaleLowerCase("tr").replace(/[^\p{L}\p{N}]/gu, "");
  return crypto.createHash("md5").update(norm).digest("hex");
}

// Periyodik haber döngüsü — bir tur çalıştırır.
export async function runNewsTick(): Promise<{ posted: boolean; reason?: string }> {
  const settings = await getSettings();
  if (!settings.botEnabled) return { posted: false, reason: "bot kapalı" };
  if (settings.newsCategories.length === 0) return { posted: false, reason: "kategori seçili değil" };

  const broadcasterId = await getChannelBroadcasterId();
  if (!broadcasterId) return { posted: false, reason: "kanal/token yok" };

  const recent = await getRecentPostedNews(25);
  let news;
  try {
    news = await findBreakingNews({
      categories: settings.newsCategories,
      recencyHours: settings.newsRecencyHours,
      excludeTitles: recent.map((n) => n.title),
    });
  } catch (e) {
    console.error("[bot] haber bulma hatası:", e);
    return { posted: false, reason: "ai hatası" };
  }
  if (!news) return { posted: false, reason: "uygun haber yok" };

  const hash = newsHash(news.title);
  if (await hasPostedNews(hash)) return { posted: false, reason: "zaten paylaşılmış" };

  const text = formatNews(news.title, news.summary);
  const sent = await sendChatMessage(broadcasterId, text);
  if (!sent.ok) return { posted: false, reason: `gönderim hatası (${sent.status}): ${sent.error ?? ""}` };

  await addPostedNews({ hash, title: news.title, url: news.url, category: news.category });
  await addLog({ direction: "out", kind: "news", username: "", content: text });
  return { posted: true };
}
