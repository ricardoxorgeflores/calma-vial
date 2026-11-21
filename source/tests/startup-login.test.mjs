import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';

test('Abrir el enlace de acceso elimina la sesión guardada antes de cargar datos privados', async () => {
  const { window, document } = parseHTML(
    await readFile(new URL('../html/index.html', import.meta.url), 'utf8'),
  );
  const oldSession = { user: { id: 'previous-account', email: 'test@example.com' } };
  let exits = 0;
  let completeExit;
  let privateReads = 0;
  window.supabase = {
    createClient: () => ({
      from: () => {
        privateReads++;
        throw new Error('No se deben leer datos privados');
      },
      auth: {
        onAuthStateChange: (callback) => callback('INITIAL_SESSION', oldSession),
        getSession: () => {
          throw new Error('No se debe restaurar la sesión anterior');
        },
        signOut: async ({ scope }) => {
          assert.equal(scope, 'local');
          exits++;
          await new Promise((resolve) => {
            completeExit = resolve;
          });
          return { data: {}, error: null };
        },
      },
    }),
  };
  const modal = document.getElementById('modal');
  modal.close = () => {
    modal.open = false;
  };
  globalThis.window = window;
  globalThis.document = document;
  let hash = '#iniciar-sesion';
  globalThis.location = {
    origin: 'https://test.local',
    pathname: '/',
    get hash() {
      return hash;
    },
    set hash(value) {
      hash = '#' + value.replace(/^#/, '');
    },
  };
  const interval = globalThis.setInterval;
  globalThis.setInterval = () => 1;
  try {
    await import('../js/auth/auth-ui.js');
    window.CalmaAuthUI.setServiceState('ready');
    await import('../js/app.js');
    document
      .getElementById('signupTab')
      .dispatchEvent(new window.Event('click', { bubbles: true }));
    assert.equal(document.getElementById('signupTab').getAttribute('aria-selected'), 'true');
    completeExit();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(exits, 1);
    assert.equal(privateReads, 0);
    assert.equal(document.getElementById('authScreen').hidden, false);
    assert.equal(document.getElementById('appScreen').hidden, true);
    assert.equal(document.getElementById('page').textContent, '');
    assert.equal(document.getElementById('authSubmit').disabled, false);
    assert.equal(location.hash, '#iniciar-sesion');
    assert.equal(
      document.getElementById('signupTab').getAttribute('aria-selected'),
      'true',
      'La salida pendiente no pisa la opción recién elegida',
    );
  } finally {
    globalThis.setInterval = interval;
  }
});
