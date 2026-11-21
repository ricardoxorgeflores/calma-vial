import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('dist/release.json', root), 'utf8'));
const origin = process.argv[3] || 'https://ricardoxorgeflores.github.io/calma-vial/';
const version = process.argv[2] || 'verificacion';
const results = await Promise.allSettled(
  [...manifest.files, 'release.json']
    .filter((file) => file !== '.nojekyll')
    .map(async (file) => {
      const url = new URL(file, origin);
      url.searchParams.set('v', version);
      const response = await fetch(url, {
        headers: { 'Cache-Control': 'no-cache' },
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
      const live = Buffer.from(await response.arrayBuffer());
      const local = await readFile(new URL('dist/' + file, root));
      const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
      const matches = sha(live) === sha(local);
      if (!matches) throw new Error(`${file}: el contenido publicado todavía no coincide`);
      return { file, status: response.status, sha256: sha(live), matches };
    }),
);
const failed = results.filter((result) => result.status === 'rejected');
const report = {
  site: origin,
  revision: version,
  checked_at: new Date().toISOString(),
  verified: failed.length === 0,
  files: results.filter((result) => result.status === 'fulfilled').map((result) => result.value),
  errors: failed.map((result) => String(result.reason.message)),
};
await mkdir(new URL('output/', root), { recursive: true });
await writeFile(
  new URL('output/publicacion-verificada.json', root),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(
  `${report.files.length} recursos públicos verificados por SHA-256; ${failed.length} incidencias.`,
);
for (const error of report.errors) console.error(error);
process.exitCode = failed.length ? 1 : 0;
