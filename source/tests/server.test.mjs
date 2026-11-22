import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

for (const basePath of ['/', '/calma-vial/'])
  test(`El servidor y los recursos funcionan en ${basePath} sin exponer archivos internos`, async (t) => {
    const child = spawn(process.execPath, ['server.mjs', '--dev'], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, PORT: '0', BASE_PATH: basePath },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    t.after(() => child.kill());
    const origin = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error('El servidor no inició.'));
      }, 10000);
      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.stderr.on('data', (data) => {
        clearTimeout(timeout);
        reject(new Error(String(data)));
      });
      child.stdout.on('data', (data) => {
        const match = String(data).match(/http:\/\/localhost:(\d+)/);
        if (match) {
          clearTimeout(timeout);
          resolve(`http://127.0.0.1:${match[1]}${basePath.slice(0, -1)}`);
        }
      });
    });
    const home = await fetch(origin + '/');
    assert.equal(home.status, 200);
    assert.match(await home.text(), /PLATAFORMA DE BIENESTAR VIAL/);
    for (const route of [
      '/js/bootstrap.js',
      '/js/app.js',
      '/js/services/api.js',
      '/js/features/avatar.js',
      '/js/services/dto.js',
      '/js/features/report.js',
      '/vendor/jspdf.umd.min.js',
      '/assets/fonts/Roboto-Regular.ttf',
      '/assets/fonts/Roboto-Bold.ttf',
      '/js/domain/domain.js',
      '/js/config/config.js',
      '/css/base.css',
      '/css/tokens.css',
      '/css/motion.css',
      '/css/racing.css',
      '/assets/images/calma-f1.jpeg',
      '/vendor/supabase.js',
    ])
      assert.equal((await fetch(origin + route)).status, 200, route);
    assert.match(home.headers.get('content-security-policy'), /font-src 'self'/);
    const car = await fetch(`${origin}/assets/images/calma-f1.jpeg`);
    assert.equal(car.headers.get('content-type'), 'image/jpeg');
    assert.deepEqual([...Buffer.from(await car.arrayBuffer()).subarray(0, 3)], [255, 216, 255]);
    const font = await fetch(`${origin}/assets/fonts/Roboto.ttf`);
    assert.equal(font.status, 200);
    assert.equal(font.headers.get('content-type'), 'font/ttf');
    assert.ok((await font.arrayBuffer()).byteLength > 100000);
    for (const route of [
      '/README.md',
      '/database/propuesta-seguridad.sql',
      '/.git/config',
      '/tests/ui.test.mjs',
      '/..%2fREADME.md',
    ])
      assert.equal((await fetch(origin + route)).status, 404, route);
    const health = await fetch(origin + '/health');
    assert.equal((await health.json()).status, 'ok');
  });
