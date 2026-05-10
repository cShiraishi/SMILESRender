import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import type { Request, Response, NextFunction } from 'express';

async function bootstrap() {
  // bodyParser: false is critical — NestJS must not consume the request body
  // before http-proxy-middleware can forward it to the chemistry service.
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  const chemistryUrl = process.env.CHEMISTRY_URL ?? 'http://chemistry:3000';
  const port = Number(process.env.PORT ?? 4000);

  // Prisma — persistent telemetry storage. Fails silently if DB is unavailable.
  const prisma = new PrismaClient({ log: ['error'] });
  prisma.$connect().catch(() =>
    console.warn('[api] Prisma could not connect — telemetry will be Redis-only'),
  );

  // Redis — real-time telemetry buffer for the admin panel (last 10k events).
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://redis:6379/0', {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });

  // Telemetry: logs to stdout, writes to Redis (real-time) and Postgres (persistent).
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - start;
      const ip = req.ip ?? req.socket?.remoteAddress ?? null;

      process.stdout.write(
        JSON.stringify({
          ts: new Date().toISOString(),
          method: req.method,
          path: req.path,
          status: res.statusCode,
          ms: durationMs,
          ip,
        }) + '\n',
      );

      // Redis — fire and forget.
      redis
        .pipeline()
        .lpush(
          'telemetry:events',
          JSON.stringify({ ts: new Date().toISOString(), method: req.method, path: req.path, status: res.statusCode, ms: durationMs, ip }),
        )
        .ltrim('telemetry:events', 0, 9999)
        .exec()
        .catch(() => {});

      // Postgres — fire and forget.
      prisma.usageEvent
        .create({
          data: {
            method: req.method,
            path: req.path,
            status_code: res.statusCode,
            duration_ms: durationMs,
            ip,
          },
        })
        .catch(() => {});
    });
    next();
  });

  // Health check — answered by the gateway itself, never proxied.
  app.use('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'smilerender-api',
      chemistry: chemistryUrl,
      ts: new Date().toISOString(),
    });
  });

  // Pass-through proxy — forwards everything else to the chemistry service.
  const proxy = createProxyMiddleware({
    target: chemistryUrl,
    changeOrigin: true,
    on: {
      error: (_err, _req, res) => {
        (res as Response).writeHead(502, { 'Content-Type': 'application/json' });
        (res as Response).end(
          JSON.stringify({ error: 'Chemistry service unavailable' }),
        );
      },
    },
  });

  app.use(proxy);

  await app.listen(port, '0.0.0.0');
  console.log(`[api] gateway listening on port ${port}`);
  console.log(`[api] proxying → ${chemistryUrl}`);
}

bootstrap();
