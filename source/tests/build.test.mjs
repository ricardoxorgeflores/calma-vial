import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { publicFiles } from '../scripts/public-files.mjs';
test('La publicación conserva rutas relativas y versiona toda la cadena de módulos', async () => {
  await import('../scripts/build.mjs');
  const revisions = new Set();
  let references = 0;
  for (const file of publicFiles.filter(
    (name) => /\.(html|js|css)$/.test(name) && !name.startsWith('vendor/'),
  )) {
    const target = new URL('../dist/' + file, import.meta.url);
    const source = await readFile(target, 'utf8');
    for (const match of source.matchAll(
      /(["'])((?:\.\.\/|\.\/)+[^"'?#]+\.(?:js|css|svg|ttf|png))(\?v=([a-f0-9]{12}))?\1/g,
    )) {
      references++;
      assert.ok(match[4], `Recurso sin versión en ${file}: ${match[2]}`);
      revisions.add(match[4]);
      const isDocumentAsset = /^(?:\.\/)?assets\/images\//.test(match[2]) && file === 'js/app.js';
      const dependency = new URL(
        match[2],
        isDocumentAsset ? new URL('../dist/index.html', import.meta.url) : target,
      );
      assert.ok(dependency.href.includes('/dist/'), 'La dependencia permanece en dist');
      await access(dependency);
    }
  }
  assert.ok(references > 0, 'Se comprobaron las referencias entre recursos públicos');
  assert.equal(revisions.size, 1);
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.match(html, /js\/auth\/auth-ui.js/);
  assert.doesNotMatch(html, /src="\.\.\//);
});
