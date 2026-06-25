// Haber turu cron endpoint'i. Harici bir cron (cron-job.org / GitHub Actions)
// veya Vercel Cron tarafından düzenli çağrılır. Ayardaki sıklığa göre haber paylaşır.
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { getSettings, getLastNewsRun, setLastNewsRun } from "@/lib/store";
import { runNewsTick } from "@/lib/bot";

export const maxDuration = 60;

function authorized(req: Request): boolean {
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${config.cronSecret}`) return true;
  const key = new URL(req.url).searchParams.get("key");
  return key === config.cronSecret;
}

async function run(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "yetkisiz" }, { status: 401 });
  }

  const settings = await getSettings();
  if (!settings.botEnabled) return NextResponse.json({ posted: false, reason: "bot kapalı" });

  // Ayardaki sıklık dolmadıysa atla (sık çağrılsa bile yalnız zamanı gelince paylaşır).
  const intervalMs = Math.max(1, settings.newsIntervalMinutes) * 60_000;
  const last = await getLastNewsRun();
  if (Date.now() - last < intervalMs) {
    return NextResponse.json({ posted: false, reason: "henüz zamanı değil" });
  }

  await setLastNewsRun(Date.now());
  const r = await runNewsTick();
  return NextResponse.json(r);
}

export async function GET(req: Request) {
  return run(req);
}
export async function POST(req: Request) {
  return run(req);
}
