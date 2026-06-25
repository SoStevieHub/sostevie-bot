import { NextResponse } from "next/server";
import { login } from "@/lib/auth";

export async function POST(req: Request) {
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  const ok = await login(password ?? "");
  if (!ok) return NextResponse.json({ error: "Hatalı parola" }, { status: 401 });
  return NextResponse.json({ ok: true });
}
