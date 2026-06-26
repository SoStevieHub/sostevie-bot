import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { getToken, getLogs, getBroadcasterId } from "@/lib/store";
import { config } from "@/lib/config";

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "yetkisiz" }, { status: 401 });

  const [reader, writer, broadcasterId, logs] = await Promise.all([
    getToken("reader"),
    getToken("writer"),
    getBroadcasterId(),
    getLogs(60),
  ]);

  return NextResponse.json({
    readerConnected: !!reader,
    readerUsername: reader?.botUsername ?? "",
    writerConnected: !!writer,
    writerUsername: writer?.botUsername ?? "",
    broadcasterReady: !!broadcasterId,
    channelSlug: config.kick.channelSlug,
    groqConfigured: !!config.groq.apiKey,
    searchConfigured: !!config.tavily.apiKey,
    kickConfigured: !!config.kick.clientId && !!config.kick.clientSecret,
    publicBaseUrl: config.publicBaseUrl,
    logs,
  });
}
