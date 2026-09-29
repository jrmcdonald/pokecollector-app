/**
 * The fake PokeCollector: every read the app makes, answered from the
 * fixtures. Writes are refused, since the walkthrough only looks; a test
 * that starts writing should get a clear error, not a silent success.
 *
 * Pure, so the tests can call it without a socket; `fake-server.ts` puts it
 * behind HTTPS.
 */
import { buildFixtures, PASSWORD, USER, USERNAME } from './fixtures.ts';
import { avatarPlaceholder, cardPlaceholder } from './png.ts';

export const TOKEN = 'fake-session-token';

export type Reply =
  { status: number; json: unknown } | { status: number; png: Buffer } | { status: 204 };

export interface Request {
  method: string;
  /** Path and query, as the request line has it. */
  url: string;
  headers: Record<string, string | undefined>;
  body: string;
}

const ok = (json: unknown): Reply => ({ status: 200, json });
const notFound = (): Reply => ({ status: 404, json: { detail: 'Not Found' } });

export function createRouter(origin: string) {
  const fixtures = buildFixtures(origin);
  const images = new Map<string, Buffer>();
  const cached = (key: string, draw: () => Buffer) => {
    let png = images.get(key);
    if (!png) {
      png = draw();
      images.set(key, png);
    }
    return png;
  };

  return function route(request: Request): Reply {
    const url = new URL(request.url, origin);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    // Images need no PokeCollector login, as upstream's don't.
    const cardImage = path.match(/^\/images\/cards\/([^/]+)\/(small|large)\.png$/);
    if (method === 'GET' && cardImage) {
      const [, id = '', size] = cardImage;
      const key = decodeURIComponent(id);
      if (!fixtures.card(key)) return notFound();
      const which = size === 'large' ? 'large' : 'small';
      return { status: 200, png: cached(`${key}/${which}`, () => cardPlaceholder(key, which)) };
    }
    const artwork = path.match(/^\/api\/pokedex\/images\/artwork\/(\d+)\.png$/);
    if (method === 'GET' && artwork) {
      const id = Number(artwork[1]);
      return { status: 200, png: cached(`avatar/${id}`, () => avatarPlaceholder(id)) };
    }

    if (method === 'GET' && path === '/api/auth/mode')
      return ok({ multi_user: true, locked: false });
    if (method === 'POST' && path === '/api/auth/login') {
      const form = new URLSearchParams(request.body);
      if (form.get('username') !== USERNAME || form.get('password') !== PASSWORD) {
        return { status: 401, json: { detail: 'Incorrect username or password' } };
      }
      return ok({ access_token: TOKEN, token_type: 'bearer', user: USER });
    }

    if (request.headers.authorization !== `Bearer ${TOKEN}`) {
      return { status: 401, json: { detail: 'Not authenticated' } };
    }
    if (method !== 'GET') {
      return { status: 501, json: { detail: 'The fake server is read-only.' } };
    }

    if (path === '/api/auth/me') return ok(USER);
    if (path === '/api/dashboard/') return ok(fixtures.dashboard);
    if (path === '/api/collection/') return ok(fixtures.collection);
    if (path === '/api/collection/printing-detail-tags') return ok(fixtures.printingDetailTags);
    if (path === '/api/wishlist/') return ok(fixtures.wishlist);
    if (path === '/api/sets/') return ok(fixtures.sets);
    if (path === '/api/binders/') return ok(fixtures.binders);
    if (path === '/api/decks/') return ok(fixtures.decks);
    if (path === '/api/cards/recognize/jobs') return ok({ jobs: fixtures.scanJobs });
    if (path === '/api/cards/search') {
      const page = Number(url.searchParams.get('page') ?? '1') || 1;
      const pageSize = Number(url.searchParams.get('page_size') ?? '30') || 30;
      return ok(fixtures.search(url.searchParams.get('q') ?? '', page, pageSize));
    }

    const scanJob = path.match(/^\/api\/cards\/recognize\/jobs\/(\d+)$/);
    if (scanJob) {
      const found = fixtures.scanJob(Number(scanJob[1]));
      return found ? ok(found) : notFound();
    }
    const checklist = path.match(/^\/api\/sets\/([^/]+)\/checklist$/);
    if (checklist) {
      const found = fixtures.checklist(decodeURIComponent(checklist[1] ?? ''));
      return found ? ok(found) : notFound();
    }
    const binder = path.match(/^\/api\/binders\/(\d+)\/cards$/);
    if (binder) {
      const found = fixtures.binderCards(Number(binder[1]));
      return found ? ok(found) : notFound();
    }
    const deck = path.match(/^\/api\/decks\/(\d+)$/);
    if (deck) {
      const found = fixtures.deck(Number(deck[1]));
      return found ? ok(found) : notFound();
    }
    const card = path.match(/^\/api\/cards\/([^/]+)$/);
    if (card) {
      const found = fixtures.card(decodeURIComponent(card[1] ?? ''));
      return found ? ok(found) : notFound();
    }
    return notFound();
  };
}
