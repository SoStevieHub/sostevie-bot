// Basit admin oturumu — imzalı çerez (HMAC), tek parola.
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { config } from "./config";

const COOKIE = "sostevie_admin";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 gün

function sign(value: string): string {
  return crypto.createHmac("sha256", config.appSecret).update(value).digest("hex");
}

function makeToken(): string {
  const issued = Date.now().toString();
  return `${issued}.${sign(issued)}`;
}

function valid(token: string | undefined): boolean {
  if (!token) return false;
  const [issued, mac] = token.split(".");
  if (!issued || !mac) return false;
  const expected = sign(issued);
  if (mac.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return false;
  return Date.now() - Number(issued) < MAX_AGE * 1000;
}

export async function login(password: string): Promise<boolean> {
  if (password !== config.admin.password) return false;
  const jar = await cookies();
  jar.set(COOKIE, makeToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
  return true;
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function isAuthed(): Promise<boolean> {
  const jar = await cookies();
  return valid(jar.get(COOKIE)?.value);
}
