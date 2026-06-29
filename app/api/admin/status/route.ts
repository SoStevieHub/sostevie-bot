import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { getToken, getLogs, getBroadcasterId, getTopChatters, getMood } from "@/lib/store";
import { config } from "@/lib/config";
import { configuredProviders } from "@/lib/ai/llm";

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "yetkisiz" }, { status: 401 });

  const [reader, writer, broadcasterId, logs, chatters, mood] = await Promise.all([
    getToken("reader"),
    getToken("writer"),
    getBroadcasterId(),
    getLogs(60),
    getTopChatters(15),
    getMood(),
  ]);

  return NextResponse.json({
    readerConnected: !!reader,
    readerUsername: reader?.botUsername ?? "",
    writerConnected: !!writer,
    writerUsername: writer?.botUsername ?? "",
    broadcasterReady: !!broadcasterId,
    channelSlug: config.kick.channelSlug,
    llmProviders: configuredProviders(),
    searchConfigured: !!config.tavily.apiKey,
    kickConfigured: !!config.kick.clientId && !!config.kick.clientSecret,
    publicBaseUrl: config.publicBaseUrl,
    logs,
    chatters,
    moodScore: mood.score,
  });
}
