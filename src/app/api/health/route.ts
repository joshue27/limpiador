import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { redisConnection } from '@/modules/queue/queues';

export const runtime = 'nodejs';

export async function GET() {
  const checks: Record<string, boolean> = {};

  // Check DB
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch {
    checks.database = false;
  }

  // Check Redis
  try {
    const Redis = (await import('ioredis')).default;
    const redis = new Redis(redisConnection());
    await redis.ping();
    await redis.quit();
    checks.redis = true;
  } catch {
    checks.redis = false;
  }

  const healthy = Object.values(checks).every(Boolean);

  return NextResponse.json(
    { status: healthy ? 'ok' : 'degraded', checks },
    { status: healthy ? 200 : 503 },
  );
}
