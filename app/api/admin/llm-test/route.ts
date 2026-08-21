// Teşhis: LLM zincirindeki her sağlayıcıyı tek tek test eder.
// Panelde giriş yaptıktan sonra tarayıcıda /api/admin/llm-test aç.
import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { testAllProviders } from "@/lib/ai/llm";

export const maxDuration = 60;

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "yetkisiz" }, { status: 401 });
  const results = await testAllProviders();
  const working = results.filter((r) => r.ok).map((r) => r.name);
  return NextResponse.json({ working, results }, { status: 200 });
}
