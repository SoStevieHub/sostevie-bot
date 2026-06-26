// Groq (OpenAI uyumlu) — ücretsiz, hızlı LLM. Sohbet ve haber seçimi için.
import { config } from "@/lib/config";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export async function chat(
  system: string,
  user: string,
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  if (!config.groq.apiKey) throw new Error("GROQ_API_KEY tanımlı değil.");
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.groq.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.groq.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: opts.temperature ?? 0.9,
      max_tokens: opts.maxTokens ?? 400,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Groq ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return (json.choices?.[0]?.message?.content ?? "").trim();
}
