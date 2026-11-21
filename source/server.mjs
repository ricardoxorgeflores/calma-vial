import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicFiles, sourceFile, canonicalHtml } from './scripts/public-files.mjs';
const development = process.argv.includes('--dev');
const project = path.dirname(fileURLToPath(import.meta.url));
const root = development ? project : path.join(project, 'dist');
const allowed = new Set([...publicFiles, '.nojekyll', 'release.json']);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};
const port = Number(process.env.PORT || (development ? 4174 : 4173));
const base = '/' + (process.env.BASE_PATH || '').split('/').filter(Boolean).join('/');
const basePath = base === '/' ? '/' : base + '/';
const security = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cache-Control': 'no-cache',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data: blob: https://wezudavlgzyevhlchuww.supabase.co; connect-src 'self' https://wezudavlgzyevhlchuww.supabase.co wss://wezudavlgzyevhlchuww.supabase.co; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
};
const server = http.createServer(async (req, res) => {
  let incoming;
  try {
    incoming = new URL(req.url, 'http://localhost').pathname;
  } catch {
    res.writeHead(400);
    return res.end();
  }
  if (base !== '/' && incoming === base) {
    res.writeHead(308, { Location: basePath });
    return res.end();
  }
  if (!incoming.startsWith(basePath)) {
    res.writeHead(404, security);
    return res.end('Página no encontrada');
  }
  const pathname = incoming.slice(basePath.length);
  if (pathname === 'health') {
    res.writeHead(200, { ...security, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok', app: 'Calma Vial', version: '3.1.0' }));
  }
  if (pathname === 'html/index.html') {
    res.writeHead(308, { ...security, Location: basePath });
    return res.end();
  }
  const name = pathname || 'index.html';
  if (!allowed.has(name)) {
    res.writeHead(404, security);
    return res.end('Página no encontrada');
  }
  const file = path.resolve(root, development ? sourceFile(name) : name);
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403, security);
    return res.end();
  }
  try {
    let body = await readFile(file);
    if (development && name === 'index.html') body = canonicalHtml(body.toString('utf8'));
    res.writeHead(200, {
      ...security,
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
    });
    res.end(body);
  } catch {
    res.writeHead(404, security);
    res.end('Página no encontrada');
  }
});
server.listen(port, '127.0.0.1', () =>
  console.log(`Calma Vial: http://localhost:${server.address().port}${basePath}`),
);
server.on('error', (error) => {
  console.error(
    error.code === 'EADDRINUSE'
      ? `El puerto ${port} está ocupado. Cierra el servidor anterior de Calma Vial o elige otro puerto con PORT.`
      : error.message,
  );
  process.exitCode = 1;
});
