import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { attachLiveServer } from "./server/live-service.ts";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const port = parseInt(process.env.PORT || "3000", 10);
  const httpServer = http.createServer(app);

  // Attach Gemini Live WebSocket and API endpoints
  attachLiveServer(httpServer, app);

  // Ensure Node HTTP server doesn't prematurely drop long-running WebSocket connections
  httpServer.keepAliveTimeout = 650000;
  httpServer.headersTimeout = 660000;
  httpServer.timeout = 0;

  const isProduction = process.env.NODE_ENV === "production";

  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static build files in production
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));

    // Fallback to index.html for SPA routing
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

startServer();
