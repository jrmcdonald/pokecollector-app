/**
 * Serves the fake PokeCollector over HTTPS, for the app on the iOS
 * simulator. The app only accepts https addresses, so CI makes a throwaway
 * certificate authority, adds it to the simulator's trust store, and starts
 * this with a certificate for localhost signed by it.
 *
 *   node e2e/server/fake-server.ts --port 8443 --cert server.pem --key server-key.pem
 *
 * Needs Node 22.18 or later, which runs TypeScript directly.
 */
import { readFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { parseArgs } from 'node:util';

import { createRouter, type Reply } from './routes.ts';

const { values } = parseArgs({
  options: {
    port: { type: 'string', default: '8443' },
    cert: { type: 'string' },
    key: { type: 'string' },
  },
});
if (!values.cert || !values.key) {
  console.error('Usage: fake-server.ts --port 8443 --cert server.pem --key server-key.pem');
  process.exit(2);
}

const port = Number(values.port);
const route = createRouter(`https://localhost:${port}`);

const server = createServer(
  { cert: readFileSync(values.cert), key: readFileSync(values.key) },
  (req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const headers: Record<string, string | undefined> = {};
      for (const [name, value] of Object.entries(req.headers)) {
        headers[name] = Array.isArray(value) ? value.join(', ') : value;
      }
      // A request the routes cannot handle (a malformed %-escape, say) is a
      // 500 for that request, not the end of the server for the whole run.
      let reply: Reply;
      try {
        reply = route({
          method: req.method ?? 'GET',
          url: req.url ?? '/',
          headers,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      } catch (error) {
        console.error(error);
        reply = { status: 500, json: { detail: String(error) } };
      }
      console.log(`${req.method} ${req.url} ${reply.status}`);
      if ('png' in reply) {
        res.writeHead(reply.status, {
          'content-type': 'image/png',
          'cache-control': 'max-age=3600',
        });
        res.end(reply.png);
      } else if ('json' in reply) {
        res.writeHead(reply.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(reply.json));
      } else {
        res.writeHead(reply.status);
        res.end();
      }
    });
  },
);

// iOS keeps idle connections open and reuses them. Node's default of five
// seconds closes them sooner, and a request sent as one closes fails in the
// app with "connection lost": a sign-in is never retried. Keep them longer
// than iOS does.
server.keepAliveTimeout = 120_000;
server.headersTimeout = 125_000;

server.listen(port, () => console.log(`Fake PokeCollector on https://localhost:${port}`));
