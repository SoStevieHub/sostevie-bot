# sostevie · Kick Chat Botu

`kick.com/sostevie` kanalında çalışan, ayrı bir bot hesabıyla mesaj atan sohbet botu.
**Tamamen ücretsiz** çalışacak şekilde Vercel (serverless) + Gemini ücretsiz kademe + Upstash Redis üzerine kuruludur.

## Ne yapar?

- İzleyicilere  **rastgele** cevap verir; biri **@ ile etiketleyip soru sorarsa** web'de araştırıp cevaplar.
- Seçilen kategorilerde **gerçek son dakika haberlerini** paylaşır (Gemini + Google arama; haber uydurmaz).
- Tüm mesajlar **en fazla 350 karakter**.
- Birisi bota **hakaret ederse** sert cevap verir ama sonuna **"— Ben bir AI botum 🤖"** ekler (panelden kapatılabilir).
- Tek kanalda (`KICK_CHANNEL_SLUG`) çalışır.

## Teknoloji

- **Next.js 16** (admin panel + Kick webhook + cron endpoint, hepsi tek proje)
- **Google Gemini** (ücretsiz kademe) + Google Search grounding
- **Kick resmî API** (OAuth 2.1 + PKCE, webhook ile chat dinleme)
- **Upstash Redis** (serverless kalıcı depo) — ayar, token, log, haber dedupe
- Haber zamanlaması: harici ücretsiz cron (GitHub Actions / cron-job.org) → `/api/cron/news`

## Mimari (neden serverless?)

Bot iki şey yapar: (1) gelen mesajlara tepki = **webhook** (serverless'e birebir uyar), (2) periyodik haber = **cron**. İkisi de sürekli açık sunucu gerektirmez; Vercel'de bedava ve "uyumadan" çalışır.

```
app/
  admin/                 Admin paneli (login + dashboard)
  api/admin/*            Ayarlar, durum, login, aksiyonlar
  api/kick/oauth/*       Bot hesabını bağlama (OAuth)
  api/kick/webhook       Kick chat.message.sent webhook'u (waitUntil ile arka plan işleme)
  api/cron/news          Haber turu (cron ile tetiklenir, ayardaki sıklığı uygular)
lib/
  config.ts              Env + sabitler
  store.ts               Upstash Redis deposu
  auth.ts                Admin oturumu (imzalı çerez)
  kick/oauth.ts          PKCE + token alışverişi
  kick/api.ts            Mesaj gönderme, kanal/kullanıcı, abonelik, token yenileme
  kick/webhook.ts        Webhook imza doğrulama (RSA-SHA256)
  ai/gemini.ts           Cevap üretimi + son dakika haber bulma (grounding)
  moderation.ts          Hakaret tespiti, 350 char, "AI bot" notu
  bot.ts                 Gelen mesaj akışı + haber turu
```

## Kurulum (lokal)

1. `cp .env.example .env` ve değerleri doldur.
2. Upstash hesabı aç (ücretsiz) → bir Redis DB oluştur → REST URL/TOKEN'ı `.env`'e koy.
3. `npm install`
4. `npm run dev` → http://localhost:3000/admin

> Webhook'lar public URL ister; lokalde gelen mesaj testi için Vercel'e deploy etmek en pratiği. Admin paneli, test mesajı ve "şimdi haber paylaş" lokalde de çalışır.

## Deploy (Vercel) — adım adım

1. **GitHub'a it:** projeyi bir repoya push'la.
2. **Vercel'e import:** vercel.com → "Add New → Project" → repoyu seç → Deploy.
3. **Upstash Redis ekle:** Vercel proje → **Storage → Create Database → Redis (Upstash)** → projeye bağla.
   (Bu, `UPSTASH_REDIS_REST_URL` ve `_TOKEN` env'lerini otomatik ekler.)
4. **Env değişkenlerini gir** (Settings → Environment Variables): `KICK_CLIENT_ID`, `KICK_CLIENT_SECRET`,
   `KICK_CHANNEL_SLUG=sostevie`, `KICK_REDIRECT_URI=https://<proje>.vercel.app/api/kick/oauth/callback`,
   `GEMINI_API_KEY`, `ADMIN_PASSWORD`, `APP_SECRET`, `CRON_SECRET`,
   `PUBLIC_BASE_URL=https://<proje>.vercel.app` → **Redeploy**.
5. **Kick uygulaması** (kick.com/settings/developer):
   - Redirect URL: `https://<proje>.vercel.app/api/kick/oauth/callback`
   - Webhook: aç → `https://<proje>.vercel.app/api/kick/webhook`
   - Scope: `user:read`, `channel:read`, `chat:write`, `events:subscribe`
6. **Cron kur (haber için):** iki seçenekten biri —
   - **GitHub Actions** (dahil, `.github/workflows/news-cron.yml`): repo → Settings → Secrets → `APP_URL=https://<proje>.vercel.app` ve `CRON_SECRET=<aynı değer>` ekle. 5 dakikada bir tetikler.
   - **cron-job.org** (alternatif, daha güvenilir): ücretsiz üye ol → yeni cronjob → URL `https://<proje>.vercel.app/api/cron/news`, header `Authorization: Bearer <CRON_SECRET>`, her 5 dk.

   > Gerçek paylaşım sıklığını **admin paneldeki ayar** belirler; cron sadece "zamanı geldi mi" diye dürter.

## İlk bağlama

1. `https://<proje>.vercel.app/admin` → parolayla gir.
2. **Botu çalıştıracak Kick hesabıyla** "Bot hesabını bağla" → OAuth onayı.
3. "Test mesajı at" → kanala mesaj düşmeli.
4. Kanala başka hesapla `@SoStevieBot selam` yaz → cevap gelmeli.

## Test

```
npm test      # 350 char sınırı, "AI bot" notu, hakaret tespiti, haber biçimi
```

## Notlar / sınırlar

- Gemini ücretsiz kademe limitleri tek kanal için yeterlidir; hata olursa o tur atlanır.
- Hakaret modu nefret söylemi/tehdit üretmeyecek şekilde sınırlandırılmıştır; panelden kapatılabilir.
- Haber doğruluğu grounding kaynaklarına bağlıdır; uygun/güncel haber yoksa o tur atlanır.
- Vercel Hobby ücretsizdir ve serverless fonksiyonlar uyumaz (webhook her zaman yanıtlanır).
