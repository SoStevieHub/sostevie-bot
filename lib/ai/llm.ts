// Çok sağlayıcılı LLM zinciri. Sırayla denenir; biri limit/hatasında diğerine geçilir.
// Hepsi OpenAI uyumlu uç (chat/completions) kullanır. Tanımlı olanlar otomatik devreye girer.
import { config } from "@/lib/config";

type Provider = { name: string; url: string; key?: string; model: string };

function providers(): Provider[] {
  const p: Provider[] = [];
  const groqUrl = "https://api.groq.com/openai/v1/chat/completions";
  // Yüksek limitli/hızlı model ÖNCE (yoğun kanalda güvenilirlik), büyük model yedek.
  if (config.groq.apiKey && config.groq.fallbackModel)
    p.push({ name: "groq-fast", url: groqUrl, key: config.groq.apiKey, model: config.groq.fallbackModel });
  if (config.groq.apiKey)
    p.push({ name: "groq-big", url: groqUrl, key: config.groq.apiKey, model: config.groq.model });
  if (config.cerebras.apiKey)
    p.push({ name: "cerebras", url: "https://api.cerebras.ai/v1/chat/completions", key: config.cerebras.apiKey, model: config.cerebras.model });
  if (config.openrouter.apiKey)
    p.push({ name: "openrouter", url: "https://openrouter.ai/api/v1/chat/completions", key: config.openrouter.apiKey, model: config.openrouter.model });
  if (config.gemini.apiKey)
    p.push({ name: "gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", key: config.gemini.apiKey, model: config.gemini.model });
  if (config.ollama.url)
    p.push({ name: "ollama", url: `${config.ollama.url.replace(/\/$/, "")}/v1/chat/completions`, model: config.ollama.model });
  return p;
}

export function configuredProviders(): string[] {
  return providers().map((p) => p.name);
}

// Teşhis: her sağlayıcıyı tek tek dener, kim çalışıyor kim değil gösterir.
export async function testAllProviders(): Promise<{ name: string; model: string; ok: boolean; detail: string }[]> {
  const list = providers();
  const results: { name: string; model: string; ok: boolean; detail: string }[] = [];
  for (const p of list) {
    try {
      const out = await callOne(p, "Türkçe, tek kısa cümle cevap ver.", "Selam, çalışıyor musun?", { maxTokens: 80 });
      results.push({ name: p.name, model: p.model, ok: true, detail: out.slice(0, 120) });
    } catch (e) {
      results.push({ name: p.name, model: p.model, ok: false, detail: String(e).slice(0, 220) });
    }
  }
  return results;
}

async function callOne(
  p: Provider,
  system: string,
  user: string,
  opts: { temperature?: number; maxTokens?: number },
): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (p.key) headers.Authorization = `Bearer ${p.key}`;

  // gpt-oss reasoning modelleri: düşünme token'ları content'i yiyip boş bırakabiliyor.
  // reasoning_effort=low + bol token ile son cevabı garanti et.
  const isReasoning = /gpt-oss|qwen3|deepseek-r1|:thinking/i.test(p.model);
  const body: Record<string, unknown> = {
    model: p.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: opts.temperature ?? 0.9,
    max_tokens: isReasoning ? Math.max(opts.maxTokens ?? 300, 900) : opts.maxTokens ?? 300,
  };
  if (isReasoning) body.reasoning_effort = "low";

  const res = await fetch(p.url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${p.name} ${res.status}: ${t.slice(0, 150)}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string; reasoning?: string } }[];
  };
  const msg = json.choices?.[0]?.message;
  const content = (msg?.content || msg?.reasoning || "").trim();
  if (!content) throw new Error(`${p.name}: boş yanıt`);
  return content;
}

export async function chat(
  system: string,
  user: string,
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  const list = providers();
  if (list.length === 0) {
    throw new Error("Hiç LLM sağlayıcısı yapılandırılmadı (GROQ_API_KEY / CEREBRAS_API_KEY / OPENROUTER_API_KEY).");
  }
  const errors: string[] = [];
  for (const p of list) {
    try {
      return await callOne(p, system, user, opts);
    } catch (e) {
      errors.push(String(e));
      // Bu bir HATA değil, normal zincir davranışı (biri dolunca diğerine geçilir).
      console.warn(`[llm] ${p.name} atlandı (${String(e).slice(0, 80)}), sıradakine geçiliyor`);
    }
  }
  throw new Error("Tüm LLM sağlayıcıları başarısız: " + errors.join(" | "));
}
