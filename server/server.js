/* =========================================================
   Mölkky local server

   Serves the dashboard as static files and exposes the past
   match store over a small REST API. No dependencies: the
   only requirement is a Node build with node:sqlite (22.5+).
   ========================================================= */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DB_PATH,
  HttpError,
  clearMatches,
  closeDatabase,
  countMatches,
  deleteMatch,
  insertMatch,
  listMatches,
  openDatabase,
} from './db.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '127.0.0.1';

const MAX_BODY_BYTES = 1_000_000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'payload too large');
    chunks.push(chunk);
  }

  if (chunks.length === 0) throw new HttpError(400, 'request body is empty');

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'request body is not valid JSON');
  }
}

/* ---------- API --------------------------------------------------------- */

async function handleApi(req, res, url) {
  const segments = url.pathname.split('/').filter(Boolean); // ['api', 'matches', ':id?']

  if (segments[1] !== 'matches') throw new HttpError(404, 'unknown endpoint');

  const idSegment = segments[2];

  if (segments.length > 3) throw new HttpError(404, 'unknown endpoint');

  // GET /api/matches?limit=&offset=
  if (req.method === 'GET' && !idSegment) {
    const limit = clampInt(url.searchParams.get('limit'), 100, 1, 1000);
    const offset = clampInt(url.searchParams.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);
    return sendJson(res, 200, { matches: listMatches({ limit, offset }), total: countMatches() });
  }

  // POST /api/matches
  if (req.method === 'POST' && !idSegment) {
    const body = await readJsonBody(req);
    const entry = insertMatch(body);
    return sendJson(res, 201, { match: entry });
  }

  // DELETE /api/matches
  if (req.method === 'DELETE' && !idSegment) {
    return sendJson(res, 200, { deleted: clearMatches() });
  }

  // DELETE /api/matches/:id
  if (req.method === 'DELETE' && idSegment) {
    const id = Number(idSegment);
    if (!Number.isInteger(id)) throw new HttpError(400, 'match id must be an integer');
    if (!deleteMatch(id)) throw new HttpError(404, `no match with id ${id}`);
    return sendJson(res, 200, { deleted: id });
  }

  throw new HttpError(405, `${req.method} is not allowed on ${url.pathname}`);
}

// Note: an absent param arrives as null and Number(null) is 0, which would
// otherwise clamp to `min` instead of falling back — hence the explicit check.
function clampInt(raw, fallback, min, max) {
  if (raw === null || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

/* ---------- static ------------------------------------------------------ */

async function handleStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    throw new HttpError(405, `${req.method} is not allowed`);
  }

  const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);

  // Resolve inside ROOT only — refuse anything that escapes via ../
  const filePath = normalize(join(ROOT, requested));
  if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) {
    throw new HttpError(403, 'forbidden');
  }

  let file;
  try {
    file = await readFile(filePath);
  } catch {
    throw new HttpError(404, 'not found');
  }

  res.writeHead(200, {
    'Content-Type': MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': file.length,
    // The dashboard is edited live during an event; never serve a stale script.
    'Cache-Control': 'no-cache',
  });
  res.end(req.method === 'HEAD' ? undefined : file);
}

/* ---------- wiring ------------------------------------------------------ */

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? HOST}`);

  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else await handleStatic(req, res, url);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error(`[molkky] ${req.method} ${url.pathname}`, error);
    sendJson(res, status, { error: error.message });
  }
});

openDatabase();

server.listen(PORT, HOST, () => {
  console.log('  Mölkky dashboard');
  console.log(`  → http://${HOST}:${PORT}`);
  console.log(`  DB: ${DB_PATH} (${countMatches()} 試合)`);
});

// Close the SQLite handle before exiting: it checkpoints the WAL back into
// matches.db, so the file left on disk is complete and safe to copy.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      closeDatabase();
      process.exit(0);
    });
  });
}
