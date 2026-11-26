# @bliptrace/js

Runtime JavaScript/TypeScript SDK for [Bliptrace](https://bliptrace.com) — build, scrub and ship
error envelopes to the ingest API. Works in **Node 18+** and the **browser** (uses the global
`fetch`). Framework SDKs like [`bliptrace-express`](../bliptrace-express) and
[`bliptrace-nextjs`](../bliptrace-nextjs) are thin adapters on top of this.

## Install

```bash
npm install @bliptrace/js
```

## Usage

```ts
import { Client, Config } from '@bliptrace/js';

const g8 = new Client(new Config({
  key: 'your-ingest-key',
  endpoint: 'https://ingest.bliptrace.com',
  environment: 'production',
  release: 'my-app@1.0.0',
  basePath: process.cwd(),          // for in-app frame detection (Node)
  scrubKeys: ['password', 'token'],
  ignoreExceptions: ['AbortError'], // error .name values to skip
}));

try {
  // ...
} catch (e) {
  g8.capture(e as Error, { user: { id: '123' } });
}
```

- `capture()` builds + scrubs + ships immediately (guard-wrapped — never throws into your app).
- `buildEnvelope()` / `sendEnvelope()` let adapters defer the send (e.g. after an HTTP response).
- Transport is pluggable (`Transport` interface); the default is the dependency-free `FetchTransport`.

The envelope conforms to the `bliptrace-contracts` schema (v1). The project is resolved **server-side**
from the ingest key — it is never sent in the payload, so a client cannot spoof another tenant.

## Develop

```bash
npm install
npm test        # vitest
npm run build   # tsup -> dist (esm + cjs + d.ts)
```

---

_Developers Hub Sdn Bhd · @bliptrace/js_
