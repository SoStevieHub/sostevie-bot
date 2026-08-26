// Sesli "BotStevie ..." komutu buraya gelir. Admin oturumu ile korunur.
import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { answerOwnerVoice } from "@/lib/bot";

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "yetkisiz" }, { status: 401 });
  const { text, history, postToChat } = (await req.json().catch(() => ({}))) as {
    text?: string;
    history?: { who: string; text: string }[];
    postToChat?: boolean;
  };
  if (!text || !text.trim()) return NextResponse.json({ error: "metin yok" }, { status: 400 });
  const r = await answerOwnerVoice(text, Array.isArray(history) ? history : [], { postToChat: !!postToChat });
  return NextResponse.json(r);
}
