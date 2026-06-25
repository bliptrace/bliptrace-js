/** The language-neutral g8scope error envelope (schema v1). */
export interface Frame {
  file: string;
  line: number;
  function: string;
  in_app: boolean;
  context?: { pre?: string[]; line?: string; post?: string[] };
}

export interface Envelope {
  schema_version: string;
  event_id: string;
  occurred_at: string;
  runtime: { name: string; version?: string };
  sdk?: { name: string; version: string };
  environment?: string;
  release?: string | null;
  level: 'debug' | 'info' | 'warning' | 'error' | 'fatal';
  exception: { type: string; message: string; frames: Frame[] };
  fingerprint_hint?: string | null;
  context?: {
    request?: Record<string, unknown>;
    user?: Record<string, unknown>;
    custom?: Record<string, unknown>;
    [k: string]: unknown;
  };
  breadcrumbs?: Array<Record<string, unknown>>;
  tags?: Record<string, string>;
  trace?: { trace_id?: string; span_id?: string };
}

export type Context = Record<string, unknown>;
