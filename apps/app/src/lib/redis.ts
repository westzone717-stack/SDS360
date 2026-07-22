import Redis from 'ioredis';

declare global {
  // eslint-disable-next-line no-var
  var _redis: Redis | undefined;
}

// BullMQ's `Queue`/`Worker` constructors take a connection *options object*,
// not a raw URL string — unlike passing a URL straight to `new Redis(...)`
// (which ioredis parses natively, TLS scheme included), so callers have to
// build this themselves. Managed Redis (e.g. ElastiCache Serverless) requires
// TLS and is reached via a `rediss://` URL; dropping that during host/port
// extraction silently produces a plaintext connection attempt that just
// hangs/fails against a TLS-only endpoint.
export function bullmqConnectionOptions(redisUrl?: string) {
  const url = new URL(redisUrl ?? process.env.REDIS_URL ?? 'redis://localhost:6379');
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

export function getRedis(): Redis {
  if (!global._redis) {
    global._redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
    });
  }
  return global._redis;
}

export const OTP_TTL = 600;
export const OTP_RATE_LIMIT = 3;
export const OTP_RATE_WINDOW = 300;

export async function storeOtp(email: string, otp: string): Promise<void> {
  await getRedis().setex(`otp:app:${email}`, OTP_TTL, otp);
}

export async function verifyOtp(email: string, otp: string): Promise<boolean> {
  const redis = getRedis();
  const stored = await redis.get(`otp:app:${email}`);
  if (stored === otp) {
    await redis.del(`otp:app:${email}`);
    return true;
  }
  return false;
}

export async function checkRateLimit(email: string): Promise<boolean> {
  const redis = getRedis();
  const key = `otp_rate:app:${email}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, OTP_RATE_WINDOW);
  return count <= OTP_RATE_LIMIT;
}
