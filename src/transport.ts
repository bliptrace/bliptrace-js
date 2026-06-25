import { RetryPolicy } from './retry-policy.js';
import type { Envelope } from './types.js';

/** Ships an envelope to the ingest API. Implementations must never throw. */
export interface Transport {
  send(endpoint: string, key: string, envelope: Envelope, timeout: number): void | Promise<void>;
}

/** Outcome of a single HTTP attempt: the status (0 on transport error/timeout) and any Retry-After seconds. */
export interface AttemptResult {
  status: number;
  retryAfterSec: number | null;
}

/**
 * Dependency-free transport using the global fetch (Node 18+, all modern browsers).
 *
 * Retries on a briefly-down or load-shedding ingest API (transport error, 408, 429, 5xx)
 * with exponential backoff + jitter, bounded by {@link RetryPolicy}. The same serialised
 * body — hence the same event_id — is replayed on every attempt, so the ingest API's
 * idempotency dedupe makes this safe: a retry never creates a duplicate occurrence (spec §10).
 */
export class FetchTransport implements Transport {
  private readonly policy: RetryPolicy;

  constructor(policy: RetryPolicy = new RetryPolicy()) {
    this.policy = policy;
  }

  async send(endpoint: string, key: string, envelope: Envelope, timeout: number): Promise<void> {
    try {
      const url = endpoint.replace(/\/+$/, '') + '/v1/ingest';
      const body = JSON.stringify(envelope);

      let attempt = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { status, retryAfterSec } = await this.attempt(url, body, key, timeout);
        if (!this.policy.shouldRetry(status, attempt)) {
          return;
        }
        await this.sleepMs(this.policy.delayMs(attempt, retryAfterSec));
        attempt++;
      }
    } catch {
      // Capturing must never break the monitored app.
    }
  }

  /**
   * Perform one HTTP attempt. Returns the status (0 on a transport error/timeout) and
   * the parsed numeric Retry-After header in seconds (null if absent/non-numeric).
   * Protected so tests can script status sequences without real network.
   */
  protected async attempt(url: string, body: string, key: string, timeout: number): Promise<AttemptResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1, timeout));
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Ingest-Key': key },
        body,
        signal: controller.signal,
        keepalive: true,
      });
      return { status: res.status, retryAfterSec: parseRetryAfter(res.headers.get('Retry-After')) };
    } catch {
      // Transport error or timeout: represent as status 0 so the policy can retry it.
      return { status: 0, retryAfterSec: null };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Sleep between attempts. Protected so tests can run without real timers. */
  protected sleepMs(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/** Parse a numeric Retry-After header (seconds). Ignores HTTP-date form. */
function parseRetryAfter(value: string | null): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === '' || !/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}
