import { describe, expect, it } from 'vitest';
import { RetryPolicy } from '../src/retry-policy.js';
import { FetchTransport, type AttemptResult } from '../src/transport.js';
import type { Envelope } from '../src/types.js';

/**
 * Test double: scripts a sequence of attempt results instead of making real HTTP
 * calls, and records the bodies seen + delays "slept" (without real timers).
 */
class ScriptedTransport extends FetchTransport {
  bodiesSeen: string[] = [];
  delays: number[] = [];
  calls = 0;

  constructor(
    private readonly script: AttemptResult[],
    policy: RetryPolicy,
  ) {
    super(policy);
  }

  protected async attempt(_url: string, body: string): Promise<AttemptResult> {
    this.bodiesSeen.push(body);
    const i = this.calls++;
    return this.script[i] ?? { status: 0, retryAfterSec: null };
  }

  protected sleepMs(ms: number): Promise<void> {
    this.delays.push(ms); // never actually sleep in tests
    return Promise.resolve();
  }
}

const envelope = { event_id: 'fixed-id', exception: { type: 'E' } } as unknown as Envelope;

describe('FetchTransport retry loop', () => {
  it('does not retry on a successful first attempt', async () => {
    const t = new ScriptedTransport([{ status: 202, retryAfterSec: null }], new RetryPolicy(3));
    await t.send('http://api', 'k', envelope, 1);

    expect(t.calls).toBe(1);
    expect(t.delays).toEqual([]);
  });

  it('retries on 5xx then stops on success, reusing the same body each attempt', async () => {
    const t = new ScriptedTransport(
      [
        { status: 503, retryAfterSec: null },
        { status: 500, retryAfterSec: null },
        { status: 202, retryAfterSec: null },
      ],
      new RetryPolicy(5),
    );
    await t.send('http://api', 'k', envelope, 1);

    expect(t.calls).toBe(3);
    expect(t.delays).toHaveLength(2);

    // Idempotency depends on the event_id being identical across retries.
    expect(t.bodiesSeen).toHaveLength(3);
    expect(t.bodiesSeen[0]).toBe(t.bodiesSeen[1]);
    expect(t.bodiesSeen[1]).toBe(t.bodiesSeen[2]);
    expect(t.bodiesSeen[0]).toContain('fixed-id');
  });

  it('retries a transport error (status 0)', async () => {
    const t = new ScriptedTransport(
      [
        { status: 0, retryAfterSec: null },
        { status: 202, retryAfterSec: null },
      ],
      new RetryPolicy(3),
    );
    await t.send('http://api', 'k', envelope, 1);

    expect(t.calls).toBe(2);
    expect(t.delays).toHaveLength(1);
  });

  it('gives up after maxRetries on persistent failure', async () => {
    const t = new ScriptedTransport(
      [
        { status: 500, retryAfterSec: null },
        { status: 500, retryAfterSec: null },
        { status: 500, retryAfterSec: null },
        { status: 500, retryAfterSec: null },
      ],
      new RetryPolicy(2),
    );
    await t.send('http://api', 'k', envelope, 1);

    expect(t.calls).toBe(3); // 1 initial + 2 retries
    expect(t.delays).toHaveLength(2);
  });

  it('does not retry a non-retryable 4xx', async () => {
    const t = new ScriptedTransport([{ status: 400, retryAfterSec: null }], new RetryPolicy(5));
    await t.send('http://api', 'k', envelope, 1);

    expect(t.calls).toBe(1);
    expect(t.delays).toEqual([]);
  });

  it('honours a Retry-After header on 429', async () => {
    const t = new ScriptedTransport(
      [
        { status: 429, retryAfterSec: 2 },
        { status: 202, retryAfterSec: null },
      ],
      new RetryPolicy(3, 100, 5000),
    );
    await t.send('http://api', 'k', envelope, 1);

    expect(t.calls).toBe(2);
    expect(t.delays).toEqual([2000]); // 2s from the header
  });

  it('never throws even if an attempt rejects', async () => {
    class ThrowingTransport extends FetchTransport {
      protected attempt(): Promise<AttemptResult> {
        return Promise.reject(new Error('boom'));
      }

      protected sleepMs(): Promise<void> {
        return Promise.resolve();
      }
    }
    const t = new ThrowingTransport(new RetryPolicy(2));
    await expect(t.send('http://api', 'k', envelope, 1)).resolves.toBeUndefined();
  });
});

describe('FetchTransport Retry-After header parsing', () => {
  // Drive the real attempt() through a stubbed global fetch to exercise header parsing.
  class HeaderTransport extends FetchTransport {
    captured: (number | null)[] = [];
    delays: number[] = [];

    protected async attempt(url: string, body: string, key: string, timeout: number): Promise<AttemptResult> {
      const r = await super.attempt(url, body, key, timeout);
      this.captured.push(r.retryAfterSec);
      return r;
    }

    protected sleepMs(ms: number): Promise<void> {
      this.delays.push(ms);
      return Promise.resolve();
    }
  }

  function withFetch(impl: () => Response, run: (t: HeaderTransport) => Promise<void>) {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => impl()) as typeof fetch;
    const t = new HeaderTransport(new RetryPolicy(1, 100, 5000));
    return run(t).finally(() => {
      globalThis.fetch = original;
    });
  }

  it('parses a numeric Retry-After (seconds) from the response', async () => {
    let first = true;
    await withFetch(
      () => {
        if (first) {
          first = false;
          return new Response(null, { status: 429, headers: { 'Retry-After': '3' } });
        }
        return new Response(null, { status: 202 });
      },
      async (t) => {
        await t.send('http://api', 'k', envelope, 1);
        expect(t.captured[0]).toBe(3);
        expect(t.delays).toEqual([3000]);
      },
    );
  });

  it('ignores a non-numeric (HTTP-date) Retry-After', async () => {
    await withFetch(
      () => new Response(null, { status: 429, headers: { 'Retry-After': 'Wed, 21 Oct 2025 07:28:00 GMT' } }),
      async (t) => {
        await t.send('http://api', 'k', envelope, 1);
        expect(t.captured[0]).toBeNull(); // falls back to exponential backoff
      },
    );
  });
});
