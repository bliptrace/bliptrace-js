import { describe, expect, it } from 'vitest';
import { Client } from '../src/client.js';
import { Config } from '../src/config.js';
import type { Transport } from '../src/transport.js';
import type { Envelope } from '../src/types.js';

class FakeTransport implements Transport {
  sent: Array<{ endpoint: string; key: string; envelope: Envelope; timeout: number }> = [];
  send(endpoint: string, key: string, envelope: Envelope, timeout: number): void {
    this.sent.push({ endpoint, key, envelope, timeout });
  }
}

describe('Client', () => {
  it('builds and ships a valid envelope', () => {
    const t = new FakeTransport();
    new Client(new Config({ key: 'k', endpoint: 'http://api' }), t).capture(new RangeError('boom'));

    expect(t.sent).toHaveLength(1);
    const env = t.sent[0].envelope;
    expect(env.schema_version).toBe('1.0');
    expect(env.event_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(env.runtime.name).toBe('javascript');
    expect(env.sdk?.name).toBe('g8scope-js');
    expect(env.exception.type).toBe('RangeError');
    expect(env.exception.message).toBe('boom');
    expect(env.exception.frames.length).toBeGreaterThan(0);
    expect(env.exception.frames[0]).toHaveProperty('in_app');
  });

  it('marks RangeError as fatal and a plain Error as error', () => {
    const t = new FakeTransport();
    const c = new Client(new Config({ key: 'k' }), t);
    c.capture(new RangeError('x'));
    c.capture(new Error('y'));
    expect(t.sent[0].envelope.level).toBe('fatal');
    expect(t.sent[1].envelope.level).toBe('error');
  });

  it('ignores configured error types', () => {
    const t = new FakeTransport();
    new Client(new Config({ key: 'k', ignoreExceptions: ['TypeError'] }), t).capture(new TypeError('noise'));
    expect(t.sent).toHaveLength(0);
  });

  it('does nothing without a key or when disabled', () => {
    const t = new FakeTransport();
    new Client(new Config({ key: null }), t).capture(new Error('x'));
    new Client(new Config({ key: 'k', enabled: false }), t).capture(new Error('x'));
    expect(t.sent).toHaveLength(0);
  });

  it('scrubs sensitive context before sending', () => {
    const t = new FakeTransport();
    new Client(new Config({ key: 'k', scrubKeys: ['password'] }), t).capture(new Error('x'), {
      user: { password: 'hunter2', id: '7' },
    });
    const ctx = t.sent[0].envelope.context as { user: { password: string; id: string } };
    expect(ctx.user.password).toBe('[REDACTED]');
    expect(ctx.user.id).toBe('7');
  });

  it('never throws even on circular context', () => {
    const t = new FakeTransport();
    const c = new Client(new Config({ key: 'k' }), t);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => c.capture(new Error('x'), circular)).not.toThrow();
  });
});
