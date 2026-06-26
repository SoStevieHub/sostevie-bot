// Ücretsiz web arama (Tavily). Anahtar yoksa boş döner; model kendi bilgisinden cevaplar.
import { config } from "@/lib/config";

export async function webSearch(query: string): Promise<string> {
  if (!config.tavily.apiKey) return "";
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: config.tavily.apiKey,
        query,
        max_results: 4,
        search_depth: "basic",
        include_answer: true,
      }),
    });
    if (!res.ok) return "";
    const json = (await res.json()) as {
      answer?: string;
      results?: { title?: string; content?: string }[];
    };
    const lines = (json.results ?? [])
      .map((r) => `- ${r.title}: ${r.content}`)
      .join("\n");
    return [json.answer ? `Özet: ${json.answer}` : "", lines]
      .filter(Boolean)
      .join("\n")
      .slice(0, 2000);
  } catch {
    return "";
  }
}
