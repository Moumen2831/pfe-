import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerAuthRoutes } from "./authRoutes";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => { server.close(() => resolve(true)); });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app    = express();
  const server = createServer(app);

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // ── OAuth callback ──────────────────────────────────────────────────────────
  registerOAuthRoutes(app);

  // ── Password auth (register / login) ────────────────────────────────────────
  registerAuthRoutes(app);

  // ── IELTS Backend Proxy ─────────────────────────────────────────────────────
  // Forwards /api/ielts-questions → IELTS_BACKEND_URL (default: http://localhost:3001)
  const IELTS_BACKEND_URL = (process.env.IELTS_BACKEND_URL ?? "http://localhost:3001").replace(/\/$/, "");
  const IELTS_PROXY_PATHS = ["/api/ielts-questions", "/api/texts", "/api/generate", "/api/health"];

  async function proxyToIelts(req: express.Request, res: express.Response) {
    const targetUrl = `${IELTS_BACKEND_URL}${req.url}`;
    console.log(`[IELTS Proxy] ${req.method} ${req.url} → ${targetUrl}`);
    try {
      const fetchRes = await fetch(targetUrl, {
        method: req.method,
        headers: {
          "content-type": req.headers["content-type"] ?? "application/json",
          ...(req.headers["x-generate-secret"]
            ? { "x-generate-secret": req.headers["x-generate-secret"] as string }
            : {}),
        },
        body: ["POST", "PUT", "PATCH"].includes(req.method) ? JSON.stringify(req.body) : undefined,
      });
      const contentType = fetchRes.headers.get("content-type") ?? "application/json";
      res.status(fetchRes.status).setHeader("content-type", contentType);
      res.send(await fetchRes.text());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[IELTS Proxy] Unreachable:`, msg);
      res.status(502).json({ error: "IELTS backend unavailable", detail: msg });
    }
  }

  for (const path of IELTS_PROXY_PATHS) {
    app.all(`${path}*`, proxyToIelts);
  }

  // ── SpeechBrain Proxy ───────────────────────────────────────────────────────
  // Forwards /api/sb-speech (multipart audio) → SpeechBrain service (default: http://localhost:8000)
  //
  // Why proxy instead of calling from the browser directly?
  //   - Avoids CORS issues when SpeechBrain runs on a different host/port
  //   - Hides the SpeechBrain internal URL from the client
  //   - Allows adding auth headers in the future
  //
  // Set SPEECHBRAIN_URL in .env to override the default.
  const SPEECHBRAIN_URL = (process.env.SPEECHBRAIN_URL ?? "http://localhost:8000").replace(/\/$/, "");

  app.post("/api/sb-speech", async (req: express.Request, res: express.Response) => {
    console.log(`[SpeechBrain Proxy] POST /api/sb-speech → ${SPEECHBRAIN_URL}/speech`);
    try {
      // We need to forward the raw multipart body — express.json() doesn't parse it,
      // so we pipe the raw request stream directly to SpeechBrain.
      const contentType = req.headers["content-type"] ?? "multipart/form-data";

      // Collect raw body chunks
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const rawBody = Buffer.concat(chunks);

      const fetchRes = await fetch(`${SPEECHBRAIN_URL}/speech`, {
        method: "POST",
        headers: { "content-type": contentType },
        body: rawBody,
      });

      const responseText = await fetchRes.text();
      res.status(fetchRes.status)
         .setHeader("content-type", fetchRes.headers.get("content-type") ?? "application/json")
         .send(responseText);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[SpeechBrain Proxy] Unreachable (${SPEECHBRAIN_URL}): ${msg}`);
      // Return a structured 503 so the frontend can gracefully fall back
      res.status(503).json({
        error: "SpeechBrain service unavailable",
        detail: msg,
        hint: `Start the SpeechBrain service: cd speechbrain-service && uvicorn main:app --port 8000`,
      });
    }
  });

  app.get("/api/sb-health", async (_req, res) => {
    try {
      const r = await fetch(`${SPEECHBRAIN_URL}/health`, { signal: AbortSignal.timeout(3000) });
      const body = await r.json();
      res.json({ speechbrain: body });
    } catch {
      res.status(503).json({ speechbrain: { status: "offline" } });
    }
  });

  // ── tRPC API ────────────────────────────────────────────────────────────────
  app.use(
    "/api/trpc",
    createExpressMiddleware({ router: appRouter, createContext })
  );

  // ── Static / Vite ───────────────────────────────────────────────────────────
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port          = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`\n🎓 Language Learning App  →  http://localhost:${port}/`);
    console.log(`   IELTS backend proxy    →  ${IELTS_BACKEND_URL}`);
    console.log(`   SpeechBrain proxy      →  ${SPEECHBRAIN_URL}`);
  });
}

startServer().catch(console.error);
