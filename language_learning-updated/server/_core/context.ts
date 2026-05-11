import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { verifySessionToken } from "./authRoutes";
import { COOKIE_NAME } from "@shared/const";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

const DEV_USER_ID = process.env.DEV_USER_ID ? parseInt(process.env.DEV_USER_ID, 10) : null;

function isLocalhost(req: CreateExpressContextOptions["req"]): boolean {
  const host = req.hostname ?? "";
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

// Inline getUserById so we don't depend on the export
async function getUserById(id: number): Promise<User | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return (result[0] as User) ?? null;
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const { req } = opts;
  let user: User | null = null;

  // ── Dev-only localhost bypass ─────────────────────────────────────────────
  if (
    DEV_USER_ID !== null &&
    process.env.NODE_ENV !== "production" &&
    isLocalhost(req)
  ) {
    console.warn(
      `[Auth] DEV bypass active – treating every request as userId=${DEV_USER_ID}. ` +
        "Remove DEV_USER_ID from .env before deploying."
    );
    user = {
      id: DEV_USER_ID,
      openId: `dev-user-${DEV_USER_ID}`,
      name: "Dev User",
      email: "dev@localhost",
      username: null,
      passwordHash: null,
      loginMethod: "dev",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as User;
    return { req, res: opts.res, user };
  }

  // ── JWT cookie auth ───────────────────────────────────────────────────────
  try {
    const cookieHeader = req.headers.cookie ?? "";
    const match = cookieHeader
      .split(";")
      .map(c => c.trim())
      .find(c => c.startsWith(COOKIE_NAME + "="));
    const token = match ? match.slice(COOKIE_NAME.length + 1) : null;

    if (token) {
      const payload = await verifySessionToken(token);
      if (payload) {
        user = await getUserById(payload.userId);
      }
    }
  } catch {
    user = null;
  }

  // ── OAuth fallback ────────────────────────────────────────────────────────
  if (!user) {
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      user = null;
    }
  }

  return { req, res: opts.res, user };
}