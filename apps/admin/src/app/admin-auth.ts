import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const cookieName = "task-platform-admin";

function expectedSessionToken(apiKey: string) {
  return createHmac("sha256", apiKey).update("task-platform-admin-session").digest("hex");
}

export async function isAdminSessionValid() {
  const apiKey = process.env.API_ADMIN_KEY;
  if (!apiKey) return false;

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(cookieName)?.value;
  if (!sessionToken) return false;

  const expected = expectedSessionToken(apiKey);
  const suppliedBytes = Buffer.from(sessionToken);
  const expectedBytes = Buffer.from(expected);
  return suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
}

export async function createAdminSession(apiKey: string) {
  const cookieStore = await cookies();
  cookieStore.set(cookieName, expectedSessionToken(apiKey), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(cookieName);
}
