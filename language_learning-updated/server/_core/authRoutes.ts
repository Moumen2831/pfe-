import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { eq, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { SignJWT, jwtVerify } from "jose";

// ── Cookie options ────────────────────────────────────────────────────────────

function getSessionCookieOptions(_req: Request) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}

// ── Password hashing (Node built-in crypto, no extra packages) ────────────────

async function hashPassword(password: string): Promise<string> {
  const { scrypt, randomBytes } = await import("crypto");
  const salt = randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(`${salt}:${key.toString("hex")}`);
    });
  });
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const { scrypt } = await import("crypto");
  const [salt, hash] = stored.split(":");
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(key.toString("hex") === hash);
    });
  });
}

// ── JWT ───────────────────────────────────────────────────────────────────────

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set in .env");
  return new TextEncoder().encode(secret);
}

async function signSessionToken(userId: number, name: string): Promise<string> {
  return new SignJWT({ userId, name })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("365d")
    .sign(getJwtSecret());
}

export async function verifySessionToken(
  token: string
): Promise<{ userId: number; name: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return { userId: payload.userId as number, name: payload.name as string };
  } catch {
    return null;
  }
}

// ── Route registration ────────────────────────────────────────────────────────

export function registerAuthRoutes(app: Express) {
  // POST /api/auth/register
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    const { name, email, username, password } = req.body ?? {};

    if (!email || !password || !username) {
      res.status(400).json({ error: "email, username and password are required" });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }

    const db = await getDb();
    if (!db) {
      res.status(503).json({ error: "Database not available" });
      return;
    }

    try {
      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(or(eq(users.email, email), eq(users.username, username)))
        .limit(1);

      if (existing.length > 0) {
        res.status(409).json({ error: "Email or username already taken" });
        return;
      }

      const passwordHash = await hashPassword(password);
      const openId = `local:${nanoid(21)}`;

      const [inserted] = await db
        .insert(users)
        .values({
          openId,
          name: name ?? username,
          email,
          username,
          passwordHash,
          loginMethod: "password",
          lastSignedIn: new Date(),
        })
        .returning();

      const token = await signSessionToken(inserted.id, inserted.name ?? username);
      res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
      res.json({ success: true, user: { id: inserted.id, name: inserted.name, email: inserted.email } });
    } catch (err) {
      console.error("[Auth] Register error:", err);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  // POST /api/auth/login
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { emailOrUsername, password } = req.body ?? {};

    if (!emailOrUsername || !password) {
      res.status(400).json({ error: "emailOrUsername and password are required" });
      return;
    }

    const db = await getDb();
    if (!db) {
      res.status(503).json({ error: "Database not available" });
      return;
    }

    try {
      const [found] = await db
        .select()
        .from(users)
        .where(or(eq(users.email, emailOrUsername), eq(users.username, emailOrUsername)))
        .limit(1);

      if (!found || !found.passwordHash) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      const valid = await verifyPassword(password, found.passwordHash);
      if (!valid) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, found.id));

      const token = await signSessionToken(found.id, found.name ?? found.username ?? "");
      res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
      res.json({ success: true, user: { id: found.id, name: found.name, email: found.email } });
    } catch (err) {
      console.error("[Auth] Login error:", err);
      res.status(500).json({ error: "Login failed" });
    }
  });
}