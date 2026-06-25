import type { Config } from './config.js';
import type { Context, Envelope, Frame } from './types.js';

/** Builds the language-neutral g8scope error envelope from an Error. */
export function buildEnvelope(err: Error, config: Config, context: Context = {}): Envelope {
  const level = err instanceof RangeError || err instanceof EvalError ? 'fatal' : 'error';

  return {
    schema_version: '1.0',
    event_id: uuid4(),
    occurred_at: new Date().toISOString(),
    runtime: { name: 'javascript', version: runtimeVersion() },
    sdk: { name: config.sdkName, version: config.sdkVersion },
    environment: config.environment,
    release: config.release,
    level,
    exception: {
      type: err.name || 'Error',
      message: limit(String(err.message ?? ''), config.maxMessage),
      frames: frames(err, config),
    },
    context: normaliseContext(context),
  };
}

function normaliseContext(context: Context): Context {
  const out: Context = { ...context };
  if (out.custom == null || (typeof out.custom === 'object' && Object.keys(out.custom).length === 0)) {
    out.custom = {};
  }
  return out;
}

/** Parse a V8/Node/Chromium stack trace into frames (innermost-first). */
function frames(err: Error, config: Config): Frame[] {
  const stack = err.stack ?? '';
  const lines = stack.split('\n').slice(1); // drop the "Name: message" header
  const out: Frame[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith('at ')) continue;
    const parsed = parseFrameLine(line.slice(3));
    if (parsed) {
      out.push({ ...parsed, in_app: inApp(parsed.file, config.basePath) });
    }
    if (out.length >= config.maxFrames) break;
  }

  return out;
}

/** Handles "func (file:line:col)" and bare "file:line:col". */
function parseFrameLine(s: string): Omit<Frame, 'in_app'> | null {
  const withFn = s.match(/^(.*?)\s+\((.*):(\d+):(\d+)\)$/);
  if (withFn) {
    return { function: withFn[1] || '<anonymous>', file: withFn[2], line: Number(withFn[3]) };
  }
  const bare = s.match(/^(.*):(\d+):(\d+)$/);
  if (bare) {
    return { function: '<anonymous>', file: bare[1], line: Number(bare[2]) };
  }
  return null;
}

function inApp(file: string, basePath: string): boolean {
  if (!file) return false;
  const clean = file.replace(/^file:\/\//, '');
  if (clean.includes('node_modules')) return false;
  if (basePath !== '') return clean.startsWith(basePath);
  return !clean.startsWith('node:') && !clean.startsWith('internal/');
}

function limit(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function runtimeVersion(): string {
  if (typeof process !== 'undefined' && process.versions?.node) {
    return `node ${process.versions.node}`;
  }
  if (typeof navigator !== 'undefined') {
    return navigator.userAgent;
  }
  return 'unknown';
}

function uuid4(): string {
  const g: { crypto?: Crypto } =
    (typeof globalThis !== 'undefined' ? (globalThis as unknown as { crypto?: Crypto }) : {});
  if (g.crypto?.randomUUID) {
    return g.crypto.randomUUID();
  }
  const b = new Uint8Array(16);
  if (g.crypto?.getRandomValues) {
    g.crypto.getRandomValues(b);
  } else {
    for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  }
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0'));
  return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
}
