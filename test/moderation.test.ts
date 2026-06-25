// Çıktı güvenliği testleri — 350 char sınırı, "AI bot" notu, hakaret tespiti.
import { test } from "node:test";
import assert from "node:assert/strict";
import { finalizeMessage, detectInsult, classifyMention, formatNews } from "../lib/moderation.ts";

test("cevap 350 karakteri asla aşmaz", () => {
  const long = "a".repeat(1000);
  const out = finalizeMessage(long, { isInsult: false });
  assert.ok(out.length <= 350, `uzunluk ${out.length}`);
});

test("hakaret cevabında 'AI botum' notu eklenir ve 350'yi aşmaz", () => {
  const out = finalizeMessage("sen de busun iste", { isInsult: true });
  assert.match(out, /botum/i);
  assert.ok(out.length <= 350);
});

test("uzun hakaret cevabı bile not + 350 sınırını korur", () => {
  const out = finalizeMessage("b".repeat(1000), { isInsult: true });
  assert.match(out, /botum/i);
  assert.ok(out.length <= 350, `uzunluk ${out.length}`);
});

test("not zaten varsa tekrar eklenmez", () => {
  const out = finalizeMessage("ben bir AI botum zaten", { isInsult: true });
  assert.equal((out.match(/botum/gi) ?? []).length, 1);
});

test("hakaret tespiti çalışır", () => {
  assert.equal(detectInsult("salak bot"), true);
  assert.equal(detectInsult("merhaba nasılsın"), false);
});

test("etiket ve soru sınıflandırması", () => {
  const r = classifyMention("@sosteviebot bugün hava nasıl?", "sosteviebot");
  assert.equal(r.mentioned, true);
  assert.equal(r.isQuestion, true);
});

test("haber mesajı 350 karaktere sığar", () => {
  const out = formatNews("Başlık", "c".repeat(1000));
  assert.ok(out.length <= 350);
});
