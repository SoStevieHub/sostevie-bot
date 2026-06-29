// Cevap üretimi (Groq + opsiyonel web arama) ve haber seçimi (RSS + Groq).
import { MAX_MESSAGE_LENGTH } from "@/lib/config";
import { chat } from "./llm";
import { webSearch } from "./search";
import { fetchNews } from "@/lib/news/rss";

export type ReplyInput = {
  userMessage: string;
  username: string;
  isInsult: boolean;
  isQuestion: boolean;
  persona: string;
  toxicMode: boolean;
  ownerName: string;
  ownerProfile: string;
  defendOwner: boolean;
  isFromOwner: boolean;
  chatterCount: number; // bu kullanıcının toplam mesaj sayısı
  chatterNotes: string; // botun bu kullanıcı için öğrendiği profil
  chatterRecent: string[]; // son mesajları
};

// İzleyiciye sohbet cevabı üret. Soru ise (ve arama varsa) web'den bağlam ekler.
export async function generateReply(input: ReplyInput): Promise<string> {
  const rules = [
    input.persona,
    "ÜSLUP: Elit, zeki, az ve öz, özgüvenli, hafif iğneleyici. Klişe selamlaşma ve hitap KULLANMA: 'aleyküm selam', 'naber', 'merhaba millet', 'selam reis', 'kanka', 'hoş geldin' gibi kalıplar YASAK. Yapışkan nezaket yok; doğrudan ve havalı konuş.",
    "KARŞI TARAFIN ÜSLUBUNA GÖRE AYAR YAP: seviyeli/sakin konuşana zekâ ve nüktedanlıkla; laubali olana iğneyle; agresif/küfürlü olana aynı sertlikte karşılık ver. Aynaya bak gibi onun tonunu yansıt.",
    `Cevabın TEK mesaj ve yaklaşık 280 (en fazla ${MAX_MESSAGE_LENGTH}) karakter olmalı. Kısa tut ama cümleni MUTLAKA tamamla; sözünü yarıda bırakma, cümle ortasında kesme.`,
    "Türkçe yaz. Emoji'yi abartma. Markdown veya tırnak kullanma, düz sohbet mesajı yaz.",
    `KANAL SAHİBİ (yayıncı): ${input.ownerName || "yayıncı"}. Hakkında: ${input.ownerProfile}. Ona sadıksın: hep arkasında durur, olumlu konuşur, asla kötülemezsin. Zevklerine (örn. Pink Floyd, Grunge) uygun yerde olumlu gönderme yapabilirsin. Ama yağcı/yapışkan olma, elit ve ölçülü kal.`,
  ];
  if (input.isFromOwner) {
    rules.push("Şu an YAYINCININ KENDİSİYLE konuşuyorsun. Sıcak, saygılı ve hafifçe takdir eden ol; onu küçük düşürme.");
  }
  // Chatter'ı tanı: geçmişine göre davran.
  if (input.chatterCount > 1 && !input.isFromOwner) {
    const recent = input.chatterRecent.slice(-6).map((m) => `- ${m}`).join("\n");
    rules.push(
      `BU CHATTER'I TANIYORSUN (${input.chatterCount} mesajdır burada).` +
        (input.chatterNotes ? ` Hakkında bildiklerin: ${input.chatterNotes}.` : "") +
        `\nSon mesajlarından bazıları:\n${recent}\nOna tanıdık biri gibi, kişiliğine ve geçmiş tavrına uygun davran (dostsa sıcak, troll'se mesafeli/iğneli).`,
    );
  }
  if (input.defendOwner) {
    rules.push(
      "Eğer bu mesaj yayıncıya (kanal sahibine) hakaret ediyor, onu küçümsüyor veya ona saldırıyorsa: yayıncıyı SAVUN ve saldırgana ACIMADAN, aynı sertlikte karşılık ver (argo serbest). Sınır: ırkçılık/nefret söylemi, ciddi tehdit, aile/etni/din/cinsiyet hedefli saldırı YOK.",
    );
  }
  if (input.isInsult) {
    if (input.toxicMode) {
      rules.push(
        "Bu kullanıcı sana SÖVDÜ/hakaret etti. Acıma, yumuşatma, geri adım atma. AYNI sertlikte ve aynı üslupla karşılık ver — küfür/argo serbest, ezici ve iğneleyici ol, onu rezil et. SADECE şu sınırlar (Kick'te ban sebebi, asla geçme): ırkçılık ve nefret söylemi yok; din/etni/cinsiyet/cinsel yönelim üzerinden hedef alma yok; ciddi tehdit yok; kişinin ailesine sövme yok. Bu sınırların dışında tamamen acımasız ol.",
      );
    } else {
      rules.push("Bu kullanıcı sana hakaret etti ama sakin ve esprili bir şekilde geçiştir.");
    }
  }

  let context = "";
  if (input.isQuestion) {
    rules.push("Kullanıcı bir şey soruyor. Aşağıda web arama sonucu varsa ondan yararlan; yoksa bildiğin kadarını ver, uydurma.");
    const found = await webSearch(input.userMessage);
    if (found) context = `\n\n[Web arama sonuçları]\n${found}`;
  }

  const prompt = `Kullanıcı adı: ${input.username}\nMesajı: "${input.userMessage}"${context}\n\nBuna tek bir sohbet mesajıyla cevap ver.`;
  return chat(rules.join("\n"), prompt, { temperature: 0.9, maxTokens: 300 });
}

// Bir chatter hakkında kısa profil notu çıkar/güncelle (zamanla "öğrenme").
export async function summarizeChatter(username: string, recent: string[], oldNotes: string): Promise<string> {
  const system =
    "Sen bir topluluk gözlemcisisin. Bir Kick chatter'ı hakkında ÇOK KISA (en fazla 280 karakter) tek paragraf profil notu çıkarırsın: konuşma tarzı, ilgi alanları, bota ve yayıncıya tavrı (dost/troll/nötr), genel tonu. Türkçe.";
  const prompt = [
    `Chatter: ${username}`,
    `Mevcut not: ${oldNotes || "(yok)"}`,
    "Son mesajları:",
    recent.map((m) => `- ${m}`).join("\n"),
    "",
    "Bu bilgilere göre GÜNCELLENMİŞ kısa profil notunu yaz (max 280 karakter, tek paragraf).",
  ].join("\n");
  try {
    const out = await chat(system, prompt, { temperature: 0.4, maxTokens: 150 });
    return out.replace(/\s+/g, " ").trim().slice(0, 400);
  } catch (e) {
    console.error("[chatter] not güncelleme hatası:", e);
    return oldNotes;
  }
}

export type NewsItem = { title: string; summary: string; url: string; category: string };

// Seçili kategorilerde RSS'ten haber çek, Groq ile EN ÖNEMLİSİNİ seç + özetle.
export async function findBreakingNews(opts: {
  categories: string[];
  recencyHours: number;
  excludeTitles: string[];
}): Promise<NewsItem | null> {
  const items = await fetchNews(opts.categories, opts.recencyHours);
  if (items.length === 0) return null;

  // Daha önce paylaşılanları ele.
  const excl = opts.excludeTitles.map((t) => t.toLocaleLowerCase("tr").slice(0, 40));
  const fresh = items.filter((i) => {
    const k = i.title.toLocaleLowerCase("tr").slice(0, 40);
    return !excl.some((e) => e && (k.includes(e) || e.includes(k)));
  });
  const pool = fresh.slice(0, 25);
  if (pool.length === 0) return null;

  const list = pool.map((i, idx) => `${idx + 1}. ${i.title}`).join("\n");
  const system =
    "Sen bir Türkçe haber editörüsün. Verilen GERÇEK başlıklar arasından o anki EN ÖNEMLİ, en büyük gündem haberini seçersin. Haber uydurmazsın, sadece listeden seçersin.";
  const prompt = [
    "Aşağıdaki güncel haber başlıklarından SADECE BİR TANE seç: o anki en önemli/en çok konuşulacak olanı. Sıradan/önemsiz olanı seçme.",
    `Seçtiğinin numarasını ve ${MAX_MESSAGE_LENGTH - 30} karakteri aşmayan, çarpıcı tek cümlelik bir özetini ver.`,
    'SADECE tek satır JSON döndür: {"index": N, "summary": "..."}',
    "",
    list,
  ].join("\n");

  let chosen = pool[0];
  let summary = chosen.title;
  try {
    const raw = await chat(system, prompt, { temperature: 0.3, maxTokens: 200 });
    const parsed = extractJson(raw);
    const idx = Number(parsed?.index) - 1;
    if (Number.isInteger(idx) && pool[idx]) chosen = pool[idx];
    if (parsed?.summary) summary = String(parsed.summary);
  } catch (e) {
    console.error("[news] seçim hatası, ilk haber kullanılıyor:", e);
  }

  return { title: chosen.title, summary, url: chosen.link, category: chosen.category };
}

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
