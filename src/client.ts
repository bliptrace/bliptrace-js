import { Config, type ConfigOptions } from './config.js';
import { buildEnvelope } from './envelope.js';
import { Scrubber } from './scrubber.js';
import { FetchTransport, type Transport } from './transport.js';
import type { Context, Envelope } from './types.js';

/**
 * The runtime JS/TS client: decide whether to capture, build + scrub the envelope, and ship it.
 * Framework adapters call capture() directly, or split buildEnvelope()/sendEnvelope() to defer
 * the send (e.g. after the HTTP response has flushed).
 */
export class Client {
  private readonly config: Config;
  private readonly transport: Transport;
  private readonly scrubber: Scrubber;

  constructor(config: Config | ConfigOptions, transport?: Transport, scrubber?: Scrubber) {
    this.config = config instanceof Config ? config : new Config(config);
    this.transport = transport ?? new FetchTransport();
    this.scrubber = scrubber ?? new Scrubber(this.config.scrubKeys);
  }

  /** Capture and ship immediately. Guard-wrapped — never throws into your app. */
  capture(err: Error, context: Context = {}): void | Promise<void> {
    const envelope = this.buildEnvelope(err, context);
    if (envelope) return this.sendEnvelope(envelope);
  }

  /** Build the envelope, or null when capture is disabled, unconfigured, or the error is ignored. */
  buildEnvelope(err: Error, context: Context = {}): Envelope | null {
    try {
      if (!this.config.enabled || !this.config.key) return null;
      if (this.shouldIgnore(err)) return null;
      return buildEnvelope(err, this.config, this.scrubber.scrub(context));
    } catch {
      return null; // never break the app
    }
  }

  sendEnvelope(envelope: Envelope): void | Promise<void> {
    if (this.config.key) {
      return this.transport.send(this.config.endpoint, this.config.key, envelope, this.config.timeout);
    }
  }

  private shouldIgnore(err: Error): boolean {
    return this.config.ignoreExceptions.includes(err.name);
  }
}
