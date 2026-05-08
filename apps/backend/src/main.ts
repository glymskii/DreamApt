import * as path from "path";
import * as dotenv from "dotenv";

// Load .env from monorepo root (only in development)
if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
}

import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { AppModule } from "./app.module";

// CommonJS interop: `compression` ships as a CJS module and ESM `import * as`
// produces a namespace object that isn't directly callable. require() avoids
// that and matches what the package expects.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compression = require("compression");

async function bootstrap() {
  // Log startup diagnostics
  const dbUrl = process.env.DATABASE_URL;
  console.log(`[Bootstrap] NODE_ENV=${process.env.NODE_ENV}`);
  console.log(`[Bootstrap] DATABASE_URL=${dbUrl ? dbUrl.replace(/\/\/.*@/, '//***@') : 'NOT SET'}`);
  console.log(`[Bootstrap] PORT=${process.env.PORT}`);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false, // we set our own json body limit below
  });

  // Cap request bodies at 256 KB. Largest legitimate POST is the interview
  // answers (~5 KB). Anything bigger is an attack or a bug.
  const bodyParser = require("body-parser");
  app.use(bodyParser.json({ limit: "256kb" }));
  app.use(bodyParser.urlencoded({ limit: "256kb", extended: true }));

  // Trust proxy so throttler sees real client IPs from Render's load balancer.
  // Without this every request looks like it's from the same proxy IP and
  // throttling becomes useless (or blocks all users at once).
  app.set("trust proxy", 1);

  // Security headers — XSS Protection / nosniff / frameguard / HSTS.
  // CSP is disabled here because Next.js frontend is on a different origin
  // and the API responses are JSON; CSP belongs on the frontend.
  app.use(helmet({ contentSecurityPolicy: false }));

  // Gzip everything except already-compressed payloads (images via CDN, etc).
  // Brings the ~430 KB map-data response down to ~80 KB on the wire.
  app.use(
    compression({
      threshold: 1024, // skip <1KB responses
    }),
  );

  app.setGlobalPrefix("api");

  app.enableCors({
    origin: (origin, callback) => {
      // No origin → curl/mobile/server-side. Always allow; these don't
      // carry user JWTs to other origins anyway.
      if (!origin) return callback(null, true);

      const allowed = (process.env.FRONTEND_URL || "http://localhost:3002")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      // Match against the explicit allowlist + previews on Vercel for our project.
      const ok = allowed.some((a) => origin === a || origin.startsWith(a))
        || /^https:\/\/dreamapt(?:-[a-z0-9]+)?-glymskiis-projects\.vercel\.app$/i.test(origin)
        || origin === "https://dreamapt.kz"
        || origin === "https://www.dreamapt.kz";

      if (ok) return callback(null, true);
      // Reject by sending false (CORS error on the client) rather than throw —
      // throwing dumps a stack into logs on every preflight from a bot.
      callback(null, false);
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 3003;
  await app.listen(port);
  console.log(`Backend running on http://localhost:${port}`);
}
bootstrap();
