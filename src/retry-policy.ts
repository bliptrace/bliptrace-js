import type { Config } from './config.js';

/** Returns a float in [0, 1). Injectable so tests can make jitter deterministic. */
export type JitterSource = () => number;

/**
 * Decides whether a failed ingest attempt should be retried, and how long to wait.
 *
 * The SDK owns "the backend might be briefly down or shedding (429)". Strategy:
 * exponential backoff (base × 2^attempt), ±25% jitter to avoid a synchronised
 * thundering herd, and a hard cap on both attempts and delay so capturing can never
 * block the monitored app for long. Retries are only safe because the envelope's
 * event_id is reused across attempts and the ingest API dedupes on it (spec §10).
 *
 * Pure and immutable: no I/O, no sleeping — that lives in the transport.
 */
export class RetryPolicy {
  readonly maxRetries: number;
  readonly baseMs: number;
  readonly capMs: number;

  constructor(maxRetries = 2, baseMs = 100, capMs = 2000) {
    this.maxRetries = maxRetries;
    this.baseMs = baseMs;
    this.capMs = capMs;
  }

  /** Build from the SDK config (framework adapters pass their own values). */
  static fromConfig(config: Config): RetryPolicy {
    return new RetryPolicy(config.maxRetries, config.retryBaseMs, config.retryCapMs);
  }

  /**
   * Should we retry after seeing `status`, having already done `attempt` retries?
   *
   * Retryable: transport errors / timeouts (status 0), 408, 429, and any 5xx.
   * Never retry a 2xx (success) or other 4xx (the request itself is bad).
   */
  shouldRetry(status: number, attempt: number): boolean {
    if (attempt >= this.maxRetries) {
      return false;
    }

    return this.isRetryable(status);
  }

  isRetryable(status: number): boolean {
    return status === 0 || status === 408 || status === 429 || status >= 500;
  }

  /**
   * Delay before the next attempt, in milliseconds.
   *
   * A server-sent Retry-After (seconds) wins, capped to capMs so a hostile or
   * misconfigured header can't stall the app. Otherwise: exponential backoff with
   * ±25% jitter, capped at capMs. `jitter` returns a float in [0,1) and is injectable
   * for deterministic tests; it defaults to a uniform random draw.
   */
  delayMs(attempt: number, retryAfterSec?: number | null, jitter?: JitterSource): number {
    if (retryAfterSec != null && retryAfterSec > 0) {
      return Math.min(this.capMs, retryAfterSec * 1000);
    }

    const exp = Math.min(this.capMs, this.baseMs * 2 ** Math.max(0, attempt));
    const rand = jitter ? jitter() : Math.random();
    const delta = Math.round(exp * 0.25 * (2 * rand - 1)); // ±25%

    return Math.max(0, Math.min(this.capMs, exp + delta));
  }
}
