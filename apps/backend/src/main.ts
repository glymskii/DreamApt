import * as path from "path";
import * as dotenv from "dotenv";

// Load .env from monorepo root (only in development)
if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
}

import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  // Log startup diagnostics
  const dbUrl = process.env.DATABASE_URL;
  console.log(`[Bootstrap] NODE_ENV=${process.env.NODE_ENV}`);
  console.log(`[Bootstrap] DATABASE_URL=${dbUrl ? dbUrl.replace(/\/\/.*@/, '//***@') : 'NOT SET'}`);
  console.log(`[Bootstrap] PORT=${process.env.PORT}`);

  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix("api");
  app.enableCors({
    origin: (origin, callback) => {
      const allowed = (process.env.FRONTEND_URL || "http://localhost:3002")
        .split(",")
        .map((s) => s.trim());
      // Allow requests with no origin (mobile, curl, etc.)
      if (!origin || allowed.some((a) => origin.startsWith(a) || origin.includes("vercel.app"))) {
        callback(null, true);
      } else {
        callback(null, true); // permissive in early stage
      }
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
