// Kick OAuth 2.1 + PKCE akışı.
import crypto from "node:crypto";
import { config, KICK_OAUTH, KICK_SCOPES } from "@/lib/config";

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function createPkce() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  const state = base64url(crypto.randomBytes(16));
  return { verifier, challenge, state };
}

export function buildAuthorizeUrl(challenge: string, state: string): string {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: config.kick.clientId,
    redirect_uri: config.kick.redirectUri,
    scope: KICK_SCOPES.join(" "),
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });
  return `${KICK_OAUTH.authorize}?${p.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number; // saniye
  scope?: string;
  token_type?: string;
};

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(KICK_OAUTH.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Kick token isteği başarısız (${res.status}): ${txt}`);
  }
  return (await res.json()) as TokenResponse;
}

export function exchangeCode(code: string, verifier: string) {
  return tokenRequest({
    grant_type: "authorization_code",
    client_id: config.kick.clientId,
    client_secret: config.kick.clientSecret,
    redirect_uri: config.kick.redirectUri,
    code_verifier: verifier,
    code,
  });
}

export function refreshToken(refresh: string) {
  return tokenRequest({
    grant_type: "refresh_token",
    client_id: config.kick.clientId,
    client_secret: config.kick.clientSecret,
    refresh_token: refresh,
  });
}
