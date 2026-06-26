// Google Gemini (ücretsiz kademe) + Google Search grounding.
// Hem sohbet cevabı üretir hem de gerçek son dakika haberi bulur.
import { GoogleGenAI } from "@google/genai";
import { config, MAX_MESSAGE_LENGTH, NEWS_CATEGORIES } from "@/lib/config";

let client: GoogleGenAI | null = null;
function ai(): GoogleGenAI {
  if (!config.gemini.apiKey) throw new Error("GEMINI_API_KEY tanımlı değil.");
  if (!client) client = new GoogleGenAI({ apiKey: config.gemini.apiKey });
  return client;
}

// Grounding (web arama) ile düz metin üretir.
async function generate(systemInstruction: string, prompt: string, useSearch: boolean): Promise<string> {
  const res = await ai().models.generateContent({
    model: config.gemini.model,
    contents: prompt,
    config: {
      systemInstruction,
      temperature: 0.9,
      maxOutputTokens: 400,
      ...(useSearch ? { tools: [{ googleSearch: {} }] } : {}),
    },
  });
  return (res.text ?? "").trim();
}

export type ReplyInput = {
  userMessage: string;
  username: string;
  isInsult: boolean;
  isQuestion: boolean;
  persona: string;
  toxicMode: boolean;
};

// İzleyiciye sohbet cevabı üret. Soru ise web'de araştırır.
export async function generateReply(input: ReplyInput): Promise<string> {
  const rules = [
    input.persona,
    "ÜSLUP: Elit, zeki, az ve öz, özgüvenli, hafif iğneleyici. Klişe selamlaşma ve hitap KULLANMA: 'aleyküm selam', 'naber', 'merhaba millet', 'selam reis', 'kanka', 'hoş geldin' gibi kalıplar YASAK. Yapışkan nezaket yok; doğrudan ve havalı konuş.",
    `Cevabın TEK mesaj ve EN FAZLA ${MAX_MESSAGE_LENGTH} karakter olmalı. Kısa tut.`,
    "Türkçe yaz. Emoji'yi abartma. Markdown veya tırnak kullanma, düz sohbet mesajı yaz.",
  ];
  if (input.isQuestion) {
    rules.push(
      "Kullanıcı bir şey soruyor. Gerekirse web'de araştır ve GÜNCEL, doğru bilgi ver. Bilmiyorsan uydurma, bilmediğini söyle.",
    );
  }
  if (input.isInsult) {
    if (input.toxicMode) {
      rules.push(
        "Bu kullanıcı sana hakaret etti. Sen de ona sert, iğneleyici ve laf sokan bir cevap verebilirsin (argo serbest) ama nefret söylemi / ırkçılık / tehdit YOK, kişinin ailesine vb. girme.",
      );
    } else {
      rules.push("Bu kullanıcı sana hakaret etti ama sakin ve esprili bir şekilde geçiştir.");
    }
  }

  const prompt = `Kullanıcı adı: ${input.username}\nMesajı: "${input.userMessage}"\n\nBuna tek bir sohbet mesajıyla cevap ver.`;
  return generate(rules.join("\n"), prompt, input.isQuestion);
}

export type NewsItem = { title: string; summary: string; url: string; category: string };

// Seçili kategorilerde GERÇEK son dakika haberi bul. Yoksa null döner.
export async function findBreakingNews(opts: {
  categories: string[];
  recencyHours: number;
  excludeTitles: string[];
}): Promise<NewsItem | null> {
  const catLabels = opts.categories
    .map((c) => NEWS_CATEGORIES.find((n) => n.id === c)?.label ?? c)
    .join(", ");

  const system = [
    "Sen bir Türkçe haber editörüsün. Google arama aracını kullanarak GERÇEK ve DOĞRULANABİLİR haber bulursun.",
    "Asla haber UYDURMA. Sadece web aramasında gerçekten gördüğün, güvenilir kaynaklı haberleri kullan.",
    "Çok mesaj atmak YOK: her seferinde yalnızca TEK haber paylaşırsın ve o da o anki EN ÖNEMLİ/EN BÜYÜK gündem haberi olmalı.",
  ].join(" ");

  const exclude = opts.excludeTitles.slice(-25).map((t) => `- ${t}`).join("\n") || "(yok)";

  const prompt = [
    `Şu kategorilerde Türkiye veya dünya gündeminden, son ${opts.recencyHours} saat içindeki haberlere bak: ${catLabels}.`,
    "Bunların arasından SADECE BİR TANE seç: o anki EN ÖNEMLİ, en çok konuşulan, en büyük son dakika haberi. Sıradan/önemsiz haber paylaşma.",
    "Aşağıdaki haberleri TEKRARLAMA (zaten paylaşıldı):",
    exclude,
    "",
    "Eğer son saatlerde paylaşmaya değer GERÇEKTEN önemli/güncel bir haber yoksa, sadece şunu yaz: NONE",
    `Varsa, SADECE şu formatta TEK satır JSON döndür (markdown yok, tek haber): {"title":"kısa çarpıcı başlık","summary":"1-2 cümle, en fazla ${MAX_MESSAGE_LENGTH - 30} karakter","url":"kaynak linki","category":"kategori"}`,
  ].join("\n");

  const raw = await generate(system, prompt, true);
  if (!raw || /^\s*NONE\s*$/i.test(raw)) return null;

  const parsed = extractJson(raw);
  if (!parsed?.title || !parsed?.summary) return null;
  return {
    title: String(parsed.title),
    summary: String(parsed.summary),
    url: String(parsed.url ?? ""),
    category: String(parsed.category ?? opts.categories[0] ?? ""),
  };
}

// Model çıktısındaki ilk JSON nesnesini toleranslı şekilde ayıkla.
function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.replace(/```json|```/gi, "");
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(fenced.slice(start, end + 1));
  } catch {
    return null;
  }
}
