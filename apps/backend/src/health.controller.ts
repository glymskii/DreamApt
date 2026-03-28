import { Controller, Get, Logger, OnModuleInit } from "@nestjs/common";

const KEEP_ALIVE_INTERVAL = 14 * 60 * 1000; // 14 minutes

@Controller()
export class HealthController implements OnModuleInit {
  private readonly logger = new Logger("KeepAlive");

  @Get()
  health() {
    return {
      status: "ok",
      service: "DreamApt API",
      timestamp: new Date().toISOString(),
    };
  }

  onModuleInit() {
    if (process.env.NODE_ENV === "production" && process.env.RENDER_EXTERNAL_URL) {
      const url = process.env.RENDER_EXTERNAL_URL;
      this.logger.log(`Starting keep-alive ping every 14 min → ${url}`);

      setInterval(async () => {
        try {
          const res = await fetch(`${url}/api`);
          this.logger.log(`Keep-alive ping: ${res.status}`);
        } catch (err) {
          this.logger.warn(`Keep-alive ping failed: ${err}`);
        }
      }, KEEP_ALIVE_INTERVAL);
    }
  }
}
