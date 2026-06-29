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
  ownerProfile: string; // kanal sahibi hakkında bilinecek/övülecek bilgiler
  defendOwner: boolean; // sahibine saldırana karşılık ver + onu savun
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
  "Sen 'sostevie' Kick kanalının zeki ve ELİT üsluplu sohbet botusun.",
  "Konuşman kültürlü, kıvrak, az ve öz, özgüvenli ve hafif iğneleyici olur.",
  "Klişe ve sıradan selamlaşmalardan ('aleyküm selam', 'naber', 'merhaba millet', 'reis', 'kanka') NEFRET edersin ve bunları asla kullanmazsın.",
  "Robotik veya yapışkan-nazik kalıplara girmezsin; havalı, net ve sofistike konuşursun.",
].join(" ");

const DEFAULT_OWNER_PROFILE = [
  "Kanal sahibi / yayıncı: SoStevie.",
  "En sevdiği grup: Pink Floyd. En sevdiği müzik tarzı: Grunge.",
].join(" ");

const DEFAULT_SETTINGS: Settings = {
  botEnabled: true,
  newsIntervalMinutes: 30,
  newsCategories: ["gundem", "sondakika"],
  newsRecencyHours: 6,
  randomReplyPercent: 5,
  toxicModeEnabled: true,
  persona: DEFAULT_PERSONA,
  ownerProfile: DEFAULT_OWNER_PROFILE,
  defendOwner: true,
};

const MAX_LOG = 200;
const MAX_NEWS = 500;

const K = {
  settings: "sostevie:settings",
  oauthReader: "sostevie:oauth:reader", // yayıncı (SoStevie) — sohbeti dinler
  oauthWriter: "sostevie:oauth:writer", // bot (BotStevie) — mesaj atar
  broadcasterId: "sostevie:broadcasterId",
  newsHashes: "sostevie:news:hashes",
  newsList: "sostevie:news:list",
  log: "sostevie:log",
  logSeq: "sostevie:log:seq",
  lastNewsRun: "sostevie:lastNewsRun",
  chatterIndex: "sostevie:chatters", // sorted set: score=mesaj sayısı
  botMood: "sostevie:botMood",
  lastMoodAnnounce: "sostevie:lastMoodAnnounce",
  lastAwardsRun: "sostevie:lastAwardsRun",
} as const;

const chatterKey = (u: string) => `sostevie:chatter:${u.toLowerCase()}`;

export type Role = "reader" | "writer";

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

// ---- OAuth (rol bazlı: reader = yayıncı, writer = bot) ----
export async function getToken(role: Role): Promise<OAuthToken> {
  return (await db().get<OAuthToken>(role === "reader" ? K.oauthReader : K.oauthWriter)) ?? null;
}

export async function setToken(role: Role, token: OAuthToken): Promise<void> {
  await db().set(role === "reader" ? K.oauthReader : K.oauthWriter, token);
}

// Yayıncı kanalının broadcaster id'si (mesaj göndermek + abonelik için).
export async function getBroadcasterId(): Promise<number | null> {
  return (await db().get<number>(K.broadcasterId)) ?? null;
}

export async function setBroadcasterId(id: number): Promise<void> {
  await db().set(K.broadcasterId, id);
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

// ---- Chatter hafızası (bot kullanıcıları tanır, zamanla öğrenir) ----
export type Chatter = {
  username: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
  recent: string[]; // son birkaç mesajı
  notes: string; // botun çıkardığı kısa profil
};

const CHATTER_RECENT_MAX = 8;

export async function getChatter(username: string): Promise<Chatter | null> {
  return (await db().get<Chatter>(chatterKey(username))) ?? null;
}

// Gelen her mesajı kaydeder (sayaç + son mesajlar + index). Güncel kaydı döner.
export async function recordChatterMessage(username: string, content: string): Promise<Chatter> {
  const now = Date.now();
  const c = (await getChatter(username)) ?? {
    username,
    count: 0,
    firstSeen: now,
    lastSeen: now,
    recent: [],
    notes: "",
  };
  c.count += 1;
  c.lastSeen = now;
  c.recent = [...c.recent, content].slice(-CHATTER_RECENT_MAX);
  await db().set(chatterKey(username), c);
  await db().zadd(K.chatterIndex, { score: c.count, member: username.toLowerCase() });
  return c;
}

export async function updateChatterNotes(username: string, notes: string): Promise<void> {
  const c = await getChatter(username);
  if (!c) return;
  c.notes = notes.slice(0, 400);
  await db().set(chatterKey(username), c);
}

export async function getTopChatters(limit = 15): Promise<Chatter[]> {
  const names = (await db().zrange<string[]>(K.chatterIndex, 0, limit - 1, { rev: true })) ?? [];
  const items = await Promise.all(names.map((n) => getChatter(n)));
  return items.filter((x): x is Chatter => !!x);
}

// ---- Bot ruh hali (chat onu şekillendirir) ----
export type BotMood = { score: number; updatedAt: number };

// Zamanla nötre çeker (decay: saatte ~5 puan); -100..100.
export async function getMood(): Promise<BotMood> {
  const m = await db().get<BotMood>(K.botMood);
  if (!m) return { score: 0, updatedAt: Date.now() };
  const hours = (Date.now() - m.updatedAt) / 3_600_000;
  const decayed =
    m.score > 0 ? Math.max(0, m.score - hours * 5) : Math.min(0, m.score + hours * 5);
  return { score: Math.round(decayed), updatedAt: m.updatedAt };
}

export async function nudgeMood(delta: number): Promise<BotMood> {
  const cur = await getMood();
  const score = Math.max(-100, Math.min(100, cur.score + delta));
  const m: BotMood = { score, updatedAt: Date.now() };
  await db().set(K.botMood, m);
  return m;
}

// ---- Cron: son haber turu zamanı ----
export async function getLastNewsRun(): Promise<number> {
  return (await db().get<number>(K.lastNewsRun)) ?? 0;
}

export async function setLastNewsRun(ts: number): Promise<void> {
  await db().set(K.lastNewsRun, ts);
}

export async function getLastMoodAnnounce(): Promise<number> {
  return (await db().get<number>(K.lastMoodAnnounce)) ?? 0;
}
export async function setLastMoodAnnounce(ts: number): Promise<void> {
  await db().set(K.lastMoodAnnounce, ts);
}

export async function getLastAwardsRun(): Promise<number> {
  return (await db().get<number>(K.lastAwardsRun)) ?? 0;
}
export async function setLastAwardsRun(ts: number): Promise<void> {
  await db().set(K.lastAwardsRun, ts);
}
