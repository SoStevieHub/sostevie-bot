// Çok sağlayıcılı LLM zinciri. Sırayla denenir; biri limit/hatasında diğerine geçilir.
// Hepsi OpenAI uyumlu uç (chat/completions) kullanır. Tanımlı olanlar otomatik devreye girer.
import { config } from "@/lib/config";

type Provider = { name: string; url: string; key?: string; model: string };

function providers(): Provider[] {
  const p: Provider[] = [];
  const groqUrl = "https://api.groq.com/openai/v1/chat/completions";
  if (config.groq.apiKey)
    p.push({ name: "groq-70b", url: groqUrl, key: config.groq.apiKey, model: config.groq.model });
  // Groq'un yüksek limitli yedek modeli (70b dolunca devralır, ayrı kota).
  if (config.groq.apiKey && config.groq.fallbackModel)
    p.push({ name: "groq-8b", url: groqUrl, key: config.groq.apiKey, model: config.groq.fallbackModel });
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
      console.error(`[llm] ${p.name} başarısız, sıradakine geçiliyor:`, e);
    }
  }
  throw new Error("Tüm LLM sağlayıcıları başarısız: " + errors.join(" | "));
}
