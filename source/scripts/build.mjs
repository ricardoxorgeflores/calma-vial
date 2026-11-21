import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { publicFiles, sourceFile, canonicalHtml } from './public-files.mjs';
const contents = new Map(
  await Promise.all(
    publicFiles.map(async (file) => [
      file,
      await readFile(new URL('../' + sourceFile(file), import.meta.url)),
    ]),
  ),
);
const digest = createHash('sha256');
for (const [file, content] of contents) digest.update(file).update(content);
const release = digest.digest('hex').slice(0, 12);
for (const [file, original] of contents) {
  const destination = new URL('../dist/' + file, import.meta.url);
  await mkdir(new URL('.', destination), { recursive: true });
  let content = original;
  if (/\.(html|js|css)$/.test(file) && !file.startsWith('vendor/')) {
    content =
      file === 'index.html' ? canonicalHtml(original.toString('utf8')) : original.toString('utf8');
    content = content.replace(
      /(["'])((?:\.\.\/|\.\/)+[^"'?#]+\.(?:js|css|svg|ttf|png))\1/g,
      (_match, quote, dependency) => `${quote}${dependency}?v=${release}${quote}`,
    );
  }
  await writeFile(destination, content);
}
await writeFile(new URL('../dist/.nojekyll', import.meta.url), '');
await writeFile(
  new URL('../dist/release.json', import.meta.url),
  JSON.stringify({ version: '3.2.0', release, files: publicFiles }, null, 2) + '\n',
);
console.log(`Calma Vial 3.2.0 preparada en dist/ · recursos ${release}`);
