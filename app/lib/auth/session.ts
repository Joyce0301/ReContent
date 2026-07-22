import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AuthConfigurationError, AuthStorageUnavailableError } from "./errors";
import {
  createSessionRecord,
  deleteExpiredSessions,
  deleteSessionRecordById,
  findSessionRecordById
} from "./session-store";
import { findUserById } from "./user-store";
import type { AuthSession, AuthSessionPayload } from "./types";
export const AUTH_COOKIE_NAME = "recontent_session";
const AUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

function getSessionSecret() {
  const configuredSecret = process.env.AUTH_SESSION_SECRET;

  if (configuredSecret && configuredSecret.length > 0) {
    return configuredSecret;
  }

  if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
    return "recontent-dev-session-secret";
  }

  return null;
}

function signValue(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function requireSessionSecret() {
  const secret = getSessionSecret();

  if (!secret) {
    throw new AuthConfigurationError();
  }

  return secret;
}

export function assertSessionConfiguration() {
  requireSessionSecret();
}

function encodePayload(payload: AuthSessionPayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function buildAuthSession(sessionId: string): AuthSessionPayload {
  return {
    sessionId,
    expiresAt: new Date(
      Date.now() + AUTH_SESSION_MAX_AGE_SECONDS * 1000
    ).toISOString()
  };
}

export function createSessionToken(session: AuthSessionPayload) {
  const secret = requireSessionSecret();
  const payload = encodePayload(session);
  const signature = signValue(payload, secret);
  return `${payload}.${signature}`;
}

export function verifySessionToken(token: string) {
  const secret = getSessionSecret();

  if (!secret) {
    return null;
  }

  const [payload, signature] = token.split(".");

  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = signValue(payload, secret);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodePayload(payload)) as AuthSessionPayload;

    if (!parsed?.sessionId || !parsed?.expiresAt) {
      return null;
    }

    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export async function getAuthSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const payload = verifySessionToken(token);

  if (!payload) {
    return null;
  }

  await deleteExpiredSessions();

  const sessionRecord = await findSessionRecordById(payload.sessionId);

  if (!sessionRecord) {
    return null;
  }

  if (new Date(sessionRecord.expiresAt).getTime() <= Date.now()) {
    await deleteSessionRecordById(sessionRecord.id);
    return null;
  }

  const user = await findUserById(sessionRecord.userId);

  if (!user || typeof user.displayName !== "string" || user.displayName.length === 0) {
    return null;
  }

  const session: AuthSession = {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName
    },
    expiresAt: payload.expiresAt
  };

  return session;
}

export function attachSessionCookie(
  response: NextResponse,
  session: AuthSessionPayload
) {
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: createSessionToken(session),
    httpOnly: true,
    maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: "",
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
}

export async function attachSessionCookieForUser(
  response: NextResponse,
  userId: string
) {
  const sessionId = randomUUID();
  const sessionPayload = buildAuthSession(sessionId);

  createSessionToken(sessionPayload);

  await createSessionRecord({
    id: sessionId,
    userId,
    expiresAt: sessionPayload.expiresAt
  });

  attachSessionCookie(response, sessionPayload);
}

export async function clearCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return;
  }

  const payload = verifySessionToken(token);

  if (!payload) {
    return;
  }

  await deleteSessionRecordById(payload.sessionId);
}

export function isAuthServiceError(error: unknown) {
  return (
    error instanceof AuthConfigurationError ||
    error instanceof AuthStorageUnavailableError
  );
}
