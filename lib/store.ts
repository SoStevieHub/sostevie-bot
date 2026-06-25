// Serverless uyumlu kalıcı depo — Upstash Redis (REST).
// Vercel'de "Storage → Redis (Upstash)" eklenince env değişkenleri otomatik gelir.
import { Redis } from "@upstash/redis";

export type Settings = {
  botEnabled: boolean;
  newsIntervalMinutes: number;
  newsCategories: string[];
  newsRecencyHours: number;
  randomReplyPercent: number;
  toxicModeEnabled: boolean;
  persona: string;
};

export type OAuthToken = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
  scope: string;
  botUserId: string;
  botUsername: string;
} | null;

export type PostedNews = {
  hash: string;
  title: string;
  url: string;
  category: string;
  createdAt: number;
};

export type LogKind = "reply" | "news" | "insult" | "incoming";
export type MessageLog = {
  id: number;
  direction: "in" | "out";
  kind: LogKind;
  username: string;
  content: string;
  createdAt: number;
};

const DEFAULT_PERSONA = [
  "Sen 'sostevie' Kick kanalının sohbet botusun. Türkçe, kısa, esprili ve sokak ağzına yakın konuşursun.",
  "Yayıncıya ve izleyicilere doğal bir chat arkadaşı gibi davranırsın; robotik cevaplardan kaçınırsın.",
].join(" ");

const DEFAULT_SETTINGS: Settings = {
  botEnabled: true,
  newsIntervalMinutes: 30,
  newsCategories: ["gundem", "sondakika"],
  newsRecencyHours: 6,
  randomReplyPercent: 5,
  toxicModeEnabled: true,
  persona: DEFAULT_PERSONA,
};

const MAX_LOG = 200;
const MAX_NEWS = 500;

const K = {
  settings: "sostevie:settings",
  oauth: "sostevie:oauth",
  newsHashes: "sostevie:news:hashes",
  newsList: "sostevie:news:list",
  log: "sostevie:log",
  logSeq: "sostevie:log:seq",
  lastNewsRun: "sostevie:lastNewsRun",
} as const;

let redis: Redis | null = null;
function db(): Redis {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error("Redis env tanımlı değil (UPSTASH_REDIS_REST_URL / _TOKEN).");
  }
  redis = new Redis({ url, token });
  return redis;
}

// ---- Settings ----
export async function getSettings(): Promise<Settings> {
  const stored = await db().get<Partial<Settings>>(K.settings);
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await db().set(K.settings, next);
  return next;
}

// ---- OAuth ----
export async function getToken(): Promise<OAuthToken> {
  return (await db().get<OAuthToken>(K.oauth)) ?? null;
}

export async function setToken(token: OAuthToken): Promise<void> {
  await db().set(K.oauth, token);
}

// ---- PostedNews (dedupe) ----
export async function hasPostedNews(hash: string): Promise<boolean> {
  return (await db().sismember(K.newsHashes, hash)) === 1;
}

export async function getRecentPostedNews(limit = 25): Promise<PostedNews[]> {
  return (await db().lrange<PostedNews>(K.newsList, 0, limit - 1)) ?? [];
}

export async function addPostedNews(n: Omit<PostedNews, "createdAt">): Promise<void> {
  const item: PostedNews = { ...n, createdAt: Date.now() };
  await db().sadd(K.newsHashes, n.hash);
  await db().lpush(K.newsList, item);
  await db().ltrim(K.newsList, 0, MAX_NEWS - 1);
}

// ---- Mesaj logları ----
export async function addLog(entry: Omit<MessageLog, "id" | "createdAt">): Promise<void> {
  const id = await db().incr(K.logSeq);
  const item: MessageLog = { ...entry, id, createdAt: Date.now() };
  await db().lpush(K.log, item);
  await db().ltrim(K.log, 0, MAX_LOG - 1);
}

export async function getLogs(limit = 100): Promise<MessageLog[]> {
  return (await db().lrange<MessageLog>(K.log, 0, limit - 1)) ?? [];
}

// ---- Cron: son haber turu zamanı ----
export async function getLastNewsRun(): Promise<number> {
  return (await db().get<number>(K.lastNewsRun)) ?? 0;
}

export async function setLastNewsRun(ts: number): Promise<void> {
  await db().set(K.lastNewsRun, ts);
}
