import Redis from 'ioredis';

declare global {
  // eslint-disable-next-line no-var
  var _redis: Redis | undefined;
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
