// Kick webhook imza doğrulaması (RSA-SHA256, Kick public key ile).
import crypto from "node:crypto";
import { KICK_API_BASE } from "@/lib/config";

let cachedKey: string | null = null;

async function getPublicKey(): Promise<string | null> {
  if (cachedKey) return cachedKey;
  try {
    const res = await fetch(`${KICK_API_BASE}/public-key`);
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { public_key?: string } };
    cachedKey = json.data?.public_key ?? null;
    return cachedKey;
  } catch {
    return null;
  }
}

// İmzayı doğrular. Public key alınamazsa null döner (çağıran karar verir).
export async function verifyKickSignature(headers: {
  messageId: string | null;
  timestamp: string | null;
  signature: string | null;
}, rawBody: string): Promise<boolean | null> {
  const { messageId, timestamp, signature } = headers;
  if (!messageId || !timestamp || !signature) return false;

  const key = await getPublicKey();
  if (!key) return null;

  try {
    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(`${messageId}.${timestamp}.${rawBody}`);
    verifier.end();
    return verifier.verify(key, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}
