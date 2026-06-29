// Haftalık topluluk ödülleri cron endpoint'i. Harici cron haftada bir (veya sık) çağırır;
// 7 gün dolmadan paylaşmaz.
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { getLastAwardsRun, setLastAwardsRun } from "@/lib/store";
import { runAwardsTick } from "@/lib/bot";

export const maxDuration = 60;

function authorized(req: Request): boolean {
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${config.cronSecret}`) return true;
  return new URL(req.url).searchParams.get("key") === config.cronSecret;
}

async function run(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "yetkisiz" }, { status: 401 });

  const WEEK = 7 * 24 * 60 * 60_000;
  const last = await getLastAwardsRun();
  if (Date.now() - last < WEEK) {
    return NextResponse.json({ posted: false, reason: "henüz haftası dolmadı" });
  }
  await setLastAwardsRun(Date.now());
  const r = await runAwardsTick();
  return NextResponse.json(r);
}

export async function GET(req: Request) {
  return run(req);
}
export async function POST(req: Request) {
  return run(req);
}
