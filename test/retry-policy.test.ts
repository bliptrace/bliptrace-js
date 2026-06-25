import { describe, expect, it } from 'vitest';
import { Config } from '../src/config.js';
import { RetryPolicy } from '../src/retry-policy.js';

describe('RetryPolicy.shouldRetry', () => {
  const p = new RetryPolicy(2, 100, 2000);

  it('classifies retryable statuses (0, 408, 429, >=500)', () => {
    for (const status of [0, 408, 429, 500, 503, 504, 599]) {
      expect(p.isRetryable(status)).toBe(true);
    }
  });

  it('never retries 2xx or other 4xx', () => {
    for (const status of [200, 202, 204, 400, 401, 403, 404, 422]) {
      expect(p.isRetryable(status)).toBe(false);
    }
  });

  it('retries only while attempt < maxRetries', () => {
    expect(p.shouldRetry(500, 0)).toBe(true);
    expect(p.shouldRetry(500, 1)).toBe(true);
    expect(p.shouldRetry(500, 2)).toBe(false); // exhausted
    expect(p.shouldRetry(500, 3)).toBe(false);
  });

  it('does not retry a non-retryable status even with attempts left', () => {
    expect(p.shouldRetry(400, 0)).toBe(false);
    expect(p.shouldRetry(200, 0)).toBe(false);
  });
});

describe('RetryPolicy.delayMs', () => {
  // jitter pinned to 0.5 -> (2*0.5 - 1) = 0 delta, so we see the raw exponential value.
  const noJitter = () => 0.5;

  it('grows exponentially: base * 2^attempt', () => {
    const p = new RetryPolicy(5, 100, 100000);
    expect(p.delayMs(0, null, noJitter)).toBe(100); // 100 * 1
    expect(p.delayMs(1, null, noJitter)).toBe(200); // 100 * 2
    expect(p.delayMs(2, null, noJitter)).toBe(400); // 100 * 4
    expect(p.delayMs(3, null, noJitter)).toBe(800); // 100 * 8
  });

  it('caps the exponential growth at capMs', () => {
    const p = new RetryPolicy(20, 100, 2000);
    expect(p.delayMs(10, null, noJitter)).toBe(2000); // would be 102400 uncapped
  });

  it('applies jitter within +/-25% of the exponential base', () => {
    const p = new RetryPolicy(5, 1000, 100000);
    const base = 1000; // attempt 0
    // jitter at 0 -> -25%, at ~1 -> +25%.
    expect(p.delayMs(0, null, () => 0)).toBe(750);
    expect(p.delayMs(0, null, () => 0.999999)).toBeCloseTo(1250, -1);
    for (let r = 0; r < 1; r += 0.05) {
      const d = p.delayMs(0, null, () => r);
      expect(d).toBeGreaterThanOrEqual(base * 0.75);
      expect(d).toBeLessThanOrEqual(base * 1.25);
    }
  });

  it('clamps the jittered result to [0, capMs]', () => {
    const p = new RetryPolicy(5, 100, 2000);
    for (let r = 0; r < 1; r += 0.1) {
      const d = p.delayMs(8, null, () => r); // exp would cap at 2000
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(2000);
    }
  });

  it('honours a Retry-After (seconds) over the exponential schedule', () => {
    const p = new RetryPolicy(5, 100, 5000);
    expect(p.delayMs(0, 2, noJitter)).toBe(2000);
    expect(p.delayMs(3, 1, noJitter)).toBe(1000);
  });

  it('caps Retry-After at capMs', () => {
    const p = new RetryPolicy(5, 100, 2000);
    expect(p.delayMs(0, 60, noJitter)).toBe(2000); // 60s would be 60000ms
  });

  it('ignores a zero / negative Retry-After and falls back to backoff', () => {
    const p = new RetryPolicy(5, 100, 5000);
    expect(p.delayMs(1, 0, noJitter)).toBe(200);
    expect(p.delayMs(1, -5, noJitter)).toBe(200);
  });
});

describe('RetryPolicy.fromConfig', () => {
  it('threads the SDK config knobs (with defaults)', () => {
    const p = RetryPolicy.fromConfig(new Config({ key: 'k' }));
    expect(p.maxRetries).toBe(2);
    expect(p.baseMs).toBe(100);
    expect(p.capMs).toBe(2000);
  });

  it('uses overridden config values', () => {
    const p = RetryPolicy.fromConfig(new Config({ key: 'k', maxRetries: 4, retryBaseMs: 50, retryCapMs: 1000 }));
    expect(p.maxRetries).toBe(4);
    expect(p.baseMs).toBe(50);
    expect(p.capMs).toBe(1000);
  });
});
