import type { LlmProvider } from '@sds360/types';

const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 60_000; // 60s

interface BreakerState {
  state: 'closed' | 'open' | 'half_open';
  failureCount: number;
  cooldownUntil: number;
}

const breakerMap = new Map<LlmProvider, BreakerState>();

function getBreaker(provider: LlmProvider): BreakerState {
  if (!breakerMap.has(provider)) {
    breakerMap.set(provider, { state: 'closed', failureCount: 0, cooldownUntil: 0 });
  }
  return breakerMap.get(provider)!;
}

export const circuitBreaker = {
  isOpen(provider: LlmProvider): boolean {
    const b = getBreaker(provider);
    if (b.state === 'open') {
      if (Date.now() >= b.cooldownUntil) {
        b.state = 'half_open';
        return false;
      }
      return true;
    }
    return false;
  },

  recordSuccess(provider: LlmProvider): void {
    const b = getBreaker(provider);
    b.state = 'closed';
    b.failureCount = 0;
    b.cooldownUntil = 0;
  },

  recordFailure(provider: LlmProvider): void {
    const b = getBreaker(provider);
    b.failureCount += 1;
    if (b.failureCount >= FAILURE_THRESHOLD) {
      b.state = 'open';
      b.cooldownUntil = Date.now() + COOLDOWN_MS;
    }
  },

  getState(provider: LlmProvider): BreakerState {
    return { ...getBreaker(provider) };
  },

  getAllStates(): Record<LlmProvider, BreakerState> {
    const providers: LlmProvider[] = ['claude', 'gpt', 'ollama'];
    return providers.reduce(
      (acc, p) => ({ ...acc, [p]: { ...getBreaker(p) } }),
      {} as Record<LlmProvider, BreakerState>
    );
  },
};
