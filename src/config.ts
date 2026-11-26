export interface ConfigOptions {
  /** Ingest key. The server resolves the project from this — never sent in the payload. */
  key?: string | null;
  endpoint?: string;
  environment?: string;
  release?: string | null;
  /** Request timeout in milliseconds. */
  timeout?: number;
  maxFrames?: number;
  maxMessage?: number;
  /** Error class names (constructor names) to ignore. */
  ignoreExceptions?: string[];
  /** Context keys to redact before sending. */
  scrubKeys?: string[];
  /** Marks frames whose file path starts with this base as in-app. */
  basePath?: string;
  enabled?: boolean;
  sdkName?: string;
  sdkVersion?: string;
  /** Max transport retries after the first attempt (transport errors, 408, 429, 5xx). */
  maxRetries?: number;
  /** Base backoff delay in milliseconds for exponential retry. */
  retryBaseMs?: number;
  /** Hard cap on any single retry delay in milliseconds. */
  retryCapMs?: number;
}

/** Immutable SDK configuration. Framework adapters build this from their config. */
export class Config {
  readonly key: string | null;
  readonly endpoint: string;
  readonly environment: string;
  readonly release: string | null;
  readonly timeout: number;
  readonly maxFrames: number;
  readonly maxMessage: number;
  readonly ignoreExceptions: string[];
  readonly scrubKeys: string[];
  readonly basePath: string;
  readonly enabled: boolean;
  readonly sdkName: string;
  readonly sdkVersion: string;
  readonly maxRetries: number;
  readonly retryBaseMs: number;
  readonly retryCapMs: number;

  constructor(opts: ConfigOptions = {}) {
    this.key = opts.key ?? null;
    this.endpoint = opts.endpoint ?? 'https://ingest.scope.g8suite.com';
    this.environment = opts.environment ?? 'production';
    this.release = opts.release ?? null;
    this.timeout = opts.timeout ?? 3000;
    this.maxFrames = opts.maxFrames ?? 30;
    this.maxMessage = opts.maxMessage ?? 2000;
    this.ignoreExceptions = opts.ignoreExceptions ?? [];
    this.scrubKeys = opts.scrubKeys ?? [];
    this.basePath = opts.basePath ?? '';
    this.enabled = opts.enabled ?? true;
    this.sdkName = opts.sdkName ?? 'bliptrace-js';
    this.sdkVersion = opts.sdkVersion ?? '1.0.0';
    this.maxRetries = opts.maxRetries ?? 2;
    this.retryBaseMs = opts.retryBaseMs ?? 100;
    this.retryCapMs = opts.retryCapMs ?? 2000;
  }
}
