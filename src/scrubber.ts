import type { Context } from './types.js';

/** Client-side PII scrub: redact sensitive keys before sending. Recurses into nested objects. */
export class Scrubber {
  private readonly keys: string[];

  constructor(keys: string[] = []) {
    this.keys = keys.map((k) => k.toLowerCase());
  }

  scrub<T>(data: T): T {
    return this.walk(data, new WeakSet()) as T;
  }

  private walk(value: unknown, seen: WeakSet<object>): unknown {
    if (Array.isArray(value)) {
      return value.map((v) => this.walk(v, seen));
    }
    if (value !== null && typeof value === 'object') {
      if (seen.has(value as object)) return '[Circular]';
      seen.add(value as object);
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = this.keys.includes(k.toLowerCase()) ? '[REDACTED]' : this.walk(v, seen);
      }
      return out;
    }
    return value;
  }
}
