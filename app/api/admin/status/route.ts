import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { getToken, getLogs } from "@/lib/store";
import { config } from "@/lib/config";

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "yetkisiz" }, { status: 401 });

  const token = await getToken();
  const logs = await getLogs(60);

  return NextResponse.json({
    connected: !!token,
    botUsername: token?.botUsername ?? "",
    channelSlug: config.kick.channelSlug,
    geminiConfigured: !!config.gemini.apiKey,
    kickConfigured: !!config.kick.clientId && !!config.kick.clientSecret,
    publicBaseUrl: config.publicBaseUrl,
    logs,
  });
}
