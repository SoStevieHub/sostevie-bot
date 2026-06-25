import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { getSettings, updateSettings, type Settings } from "@/lib/store";
import { NEWS_CATEGORIES } from "@/lib/config";

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "yetkisiz" }, { status: 401 });
  return NextResponse.json(await getSettings());
}

export async function PUT(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "yetkisiz" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Partial<Settings>;

  const patch: Partial<Settings> = {};
  if (typeof body.botEnabled === "boolean") patch.botEnabled = body.botEnabled;
  if (typeof body.toxicModeEnabled === "boolean") patch.toxicModeEnabled = body.toxicModeEnabled;
  if (typeof body.persona === "string") patch.persona = body.persona.slice(0, 2000);
  if (Number.isFinite(body.newsIntervalMinutes))
    patch.newsIntervalMinutes = clamp(Number(body.newsIntervalMinutes), 1, 1440);
  if (Number.isFinite(body.newsRecencyHours))
    patch.newsRecencyHours = clamp(Number(body.newsRecencyHours), 1, 72);
  if (Number.isFinite(body.randomReplyPercent))
    patch.randomReplyPercent = clamp(Number(body.randomReplyPercent), 0, 100);
  if (Array.isArray(body.newsCategories)) {
    const valid = new Set(NEWS_CATEGORIES.map((c) => c.id));
    patch.newsCategories = body.newsCategories.filter((c) => valid.has(c));
  }

  return NextResponse.json(await updateSettings(patch));
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}
