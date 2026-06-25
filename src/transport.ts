import type { Envelope } from './types.js';

/** Ships an envelope to the ingest API. Implementations must never throw. */
export interface Transport {
  send(endpoint: string, key: string, envelope: Envelope, timeout: number): void | Promise<void>;
}

/** Dependency-free transport using the global fetch (Node 18+, all modern browsers). */
export class FetchTransport implements Transport {
  async send(endpoint: string, key: string, envelope: Envelope, timeout: number): Promise<void> {
    try {
      const url = endpoint.replace(/\/+$/, '') + '/v1/ingest';
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(1, timeout));
      try {
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Ingest-Key': key },
          body: JSON.stringify(envelope),
          signal: controller.signal,
          keepalive: true,
        });
      } finally {
        clearTimeout(timer);
      }
    } catch {
      // Capturing must never break the monitored app.
    }
  }
}
