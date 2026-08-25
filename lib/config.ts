// Ortam değişkenleri ve sabitler — tek yerden okunur.
function req(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

export const config = {
  kick: {
    clientId: req("KICK_CLIENT_ID"),
    clientSecret: req("KICK_CLIENT_SECRET"),
    redirectUri: req("KICK_REDIRECT_URI", "http://localhost:3000/api/kick/oauth/callback"),
    channelSlug: req("KICK_CHANNEL_SLUG", "sostevie").toLowerCase(),
  },
  // Sohbet için sağlayıcı zinciri — sırayla denenir, biri limit yerse diğerine geçer.
  groq: {
    apiKey: req("GROQ_API_KEY"),
    // Not: eski llama-3.3-70b / 3.1-8b Groq'ta 17 Haz 2026'da kaldırıldı → gpt-oss.
    model: req("GROQ_MODEL", "openai/gpt-oss-120b"),
    // Yüksek limitli yedek (ana model limite vurunca devralır).
    fallbackModel: req("GROQ_FALLBACK_MODEL", "openai/gpt-oss-20b"),
  },
  cerebras: {
    apiKey: req("CEREBRAS_API_KEY"),
    // Cerebras ücretsiz kademesinde mevcut. Model değişirse CEREBRAS_MODEL ile ayarla.
    model: req("CEREBRAS_MODEL", "gpt-oss-120b"),
  },
  openrouter: {
    apiKey: req("OPENROUTER_API_KEY"),
    // :free slug'lar zaman zaman değişir; sorun olursa OPENROUTER_MODEL ile güncelle.
    model: req("OPENROUTER_MODEL", "deepseek/deepseek-chat-v3-0324:free"),
  },
  // Gemini (OpenAI uyumlu uç) — kotası kısıtlı, zincirde son yedek olarak.
  gemini: {
    apiKey: req("GEMINI_API_KEY"),
    model: req("GEMINI_MODEL", "gemini-2.0-flash"),
  },
  // Opsiyonel: kendi sunucundaki Ollama (OpenAI uyumlu uç). Vercel'in erişebilmesi için public URL olmalı.
  ollama: {
    url: req("OLLAMA_URL"),
    model: req("OLLAMA_MODEL", "llama3.1"),
  },
  // Sorular için ücretsiz web arama (opsiyonel). Yoksa model kendi bilgisinden cevaplar.
  tavily: {
    apiKey: req("TAVILY_API_KEY"),
  },
  // Azure Speech (opsiyonel) — key varsa nöral Emel; yoksa Google Türkçe TTS'e düşer.
  azure: {
    key: req("AZURE_SPEECH_KEY"),
    region: req("AZURE_SPEECH_REGION", "westeurope"),
  },
  admin: {
    password: req("ADMIN_PASSWORD", "degistir-beni"),
  },
  appSecret: req("APP_SECRET", "dev-secret"),
  publicBaseUrl: req("PUBLIC_BASE_URL", "http://localhost:3000"),
  // Cron endpoint'ini korumak için gizli anahtar
  cronSecret: req("CRON_SECRET", "dev-cron-secret"),
} as const;

// Tüm bot mesajları bu sınırı aşamaz.
export const MAX_MESSAGE_LENGTH = 350;

// Kick OAuth uç noktaları
export const KICK_OAUTH = {
  authorize: "https://id.kick.com/oauth/authorize",
  token: "https://id.kick.com/oauth/token",
} as const;

export const KICK_API_BASE = "https://api.kick.com/public/v1";

// İstediğimiz izinler (scope)
export const KICK_SCOPES = ["user:read", "channel:read", "chat:write", "events:subscribe"];

// Admin panelde seçilebilecek haber kategorileri
export const NEWS_CATEGORIES: { id: string; label: string }[] = [
  { id: "gundem", label: "Gündem" },
  { id: "sondakika", label: "Son Dakika" },
  { id: "dunya", label: "Dünya" },
  { id: "ekonomi", label: "Ekonomi" },
  { id: "spor", label: "Spor" },
  { id: "teknoloji", label: "Teknoloji" },
  { id: "magazin", label: "Magazin" },
  { id: "saglik", label: "Sağlık" },
  { id: "bilim", label: "Bilim" },
  { id: "oyun", label: "Oyun / Espor" },
];
