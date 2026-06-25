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
  gemini: {
    apiKey: req("GEMINI_API_KEY"),
    model: req("GEMINI_MODEL", "gemini-2.5-flash"),
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
