// Mesaj sınıflandırma + çıktı güvenliği (350 char, "AI bot" notu).
import { MAX_MESSAGE_LENGTH } from "./config";

const AI_NOTE = "— Ben bir AI botum 🤖";

// Türkçe küfür/hakaret kök listesi (normalize edilmiş). Niyet: bota laf sokulduğunu yakalamak.
const INSULT_ROOTS = [
  "amk", "aq", "amq", "oç", "oc ", "piç", "pic", "salak", "aptal", "gerizekal", "mal ",
  " aptal", "yavşak", "yavsak", "şerefsiz", "serefsiz", "orospu", "sik", "sıçtın", "sictin",
  "göt", "got ", "ibne", "puşt", "pust", "kahpe", "yarrak", "yarak", "amına", "amina",
  "amcık", "amcik", "embesil", "dangalak", "gavat", "kavat", "pezevenk", "denyo", "geri zekalı",
  "bok ", "boktan", "çöp bot", "saçma bot", "işe yaramaz",
];

function normalize(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replaceAll("ç", "c").replaceAll("ğ", "g").replaceAll("ı", "i")
    .replaceAll("ö", "o").replaceAll("ş", "s").replaceAll("ü", "u")
    .trim();
}

export function detectInsult(text: string): boolean {
  const n = normalize(text);
  return INSULT_ROOTS.some((root) => n.includes(normalize(root)));
}

// Mesaj botu etiketliyor mu / ona mı sesleniyor + soru mu?
export function classifyMention(
  text: string,
  botUsername: string,
): { mentioned: boolean; isQuestion: boolean } {
  const n = normalize(text);
  const bu = normalize(botUsername);
  const mentioned =
    !!bu && (n.includes("@" + bu) || n.includes(bu) || n.includes("bot"));
  const isQuestion = text.includes("?") || /\b(ne|neden|nasil|nasıl|kim|kac|kaç|nerede|nezaman|ne zaman|mi|mı|mu|mü)\b/i.test(n);
  return { mentioned, isQuestion };
}

// Çıktıyı 350 karaktere sığdır; hakaret cevabıysa AI notunu garanti et.
export function finalizeMessage(text: string, opts: { isInsult: boolean }): string {
  let body = text.replace(/\s+/g, " ").trim();

  if (opts.isInsult) {
    const alreadyHasNote = /ai\s*bot|yapay\s*zek|bir\s*botum/i.test(body);
    if (!alreadyHasNote) {
      const room = MAX_MESSAGE_LENGTH - AI_NOTE.length - 1;
      if (body.length > room) body = body.slice(0, room).trimEnd();
      body = `${body} ${AI_NOTE}`;
    }
  }

  if (body.length > MAX_MESSAGE_LENGTH) {
    body = body.slice(0, MAX_MESSAGE_LENGTH - 1).trimEnd() + "…";
  }
  return body;
}

// Haber mesajını 350 karaktere göre biçimlendir.
export function formatNews(title: string, summary: string): string {
  // Kısa, dikkat çekici başlık + özet.
  let msg = summary?.trim() || title?.trim() || "";
  if (title && summary && !summary.includes(title)) {
    msg = `📰 ${summary.trim()}`;
  } else {
    msg = `📰 ${msg}`;
  }
  if (msg.length > MAX_MESSAGE_LENGTH) {
    msg = msg.slice(0, MAX_MESSAGE_LENGTH - 1).trimEnd() + "…";
  }
  return msg;
}
