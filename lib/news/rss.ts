// Türk haber RSS akışları — gerçek, ücretsiz, sınırsız haber kaynağı.
import { XMLParser } from "fast-xml-parser";

// Kategori -> RSS feed URL'leri (birden fazla; biri çökerse diğeri devreye girer).
const FEEDS: Record<string, string[]> = {
  gundem: ["https://www.hurriyet.com.tr/rss/gundem", "https://www.ntv.com.tr/gundem.rss"],
  sondakika: ["https://www.hurriyet.com.tr/rss/anasayfa", "https://www.ntv.com.tr/son-dakika.rss"],
  dunya: ["https://www.hurriyet.com.tr/rss/dunya", "https://www.ntv.com.tr/dunya.rss"],
  ekonomi: ["https://www.hurriyet.com.tr/rss/ekonomi", "https://www.ntv.com.tr/ekonomi.rss"],
  spor: ["https://www.hurriyet.com.tr/rss/spor", "https://www.ntv.com.tr/spor.rss"],
  teknoloji: ["https://www.hurriyet.com.tr/rss/teknoloji", "https://www.ntv.com.tr/teknoloji.rss"],
  magazin: ["https://www.hurriyet.com.tr/rss/magazin"],
  saglik: ["https://www.hurriyet.com.tr/rss/saglik", "https://www.ntv.com.tr/saglik.rss"],
  bilim: ["https://www.ntv.com.tr/teknoloji.rss"],
  oyun: ["https://www.ntv.com.tr/teknoloji.rss"],
};

export type RssItem = { title: string; link: string; date: number; desc: string; category: string };

const parser = new XMLParser({ ignoreAttributes: false });

function clean(s: unknown): string {
  return String(s ?? "")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchFeed(url: string, category: string, cutoff: number): Promise<RssItem[]> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (sostevie-bot)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const doc = parser.parse(xml) as { rss?: { channel?: { item?: unknown } } };
    const raw = doc?.rss?.channel?.item;
    const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const out: RssItem[] = [];
    for (const it of items as Record<string, unknown>[]) {
      const title = clean(it.title);
      if (!title) continue;
      const date = it.pubDate ? Date.parse(String(it.pubDate)) : Date.now();
      const when = Number.isNaN(date) ? Date.now() : date;
      if (when < cutoff) continue;
      out.push({
        title,
        link: clean(it.link),
        date: when,
        desc: clean(it.description).slice(0, 220),
        category,
      });
    }
    return out;
  } catch {
    return [];
  }
}

// Seçili kategorilerden, son `recencyHours` içindeki haberleri toplar (yeni->eski).
export async function fetchNews(categories: string[], recencyHours: number): Promise<RssItem[]> {
  const cutoff = Date.now() - recencyHours * 3_600_000;
  const jobs = categories.flatMap((c) => (FEEDS[c] ?? []).map((u) => fetchFeed(u, c, cutoff)));
  const results = await Promise.all(jobs);
  const all = results.flat();

  // Aynı başlığı tekille (farklı kaynaklarda aynı haber).
  const seen = new Set<string>();
  const unique = all.filter((i) => {
    const key = i.title.toLocaleLowerCase("tr").slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.sort((a, b) => b.date - a.date);
}
