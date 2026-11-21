// Integration of the actual application with an isolated DOM and in-memory API.
// No real Supabase accounts, sessions or records are used by this test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { jsPDF } from 'jspdf';
import { QUESTIONS } from '../js/domain/domain.js';
const { window, document } = parseHTML(
  await readFile(new URL('../html/index.html', import.meta.url), 'utf8'),
);
const user = { id: 'test-user', email: 'test@example.com' };
const session = { user, access_token: 'test-only-not-a-real-token' };
const records = {
  calmavial_cuestionarios: [{ id: 1, vigente: true, preguntas: QUESTIONS.map(([text]) => text) }],
  calmavial_evaluacion_version: [],
  calmavial_sugerencias: [],
  calmavial_respuestas: [],
  calmavial_gestion_auditoria: [],
  calmavial_avisos: [],
  calmavial_auditoria: [],
  perfiles: [
    {
      id: user.id,
      nombres: 'Prueba',
      apellido_paterno: 'Local',
      usuario: 'prueba',
      edad: 25,
      documento: 'TEST1234',
      correo: user.email,
      rol: 'usuario',
    },
  ],
  evaluaciones: [],
  diario: [],
};
let stallReads = false;
let failDiaryWrite = false;
const pendingReads = [];
const resumeReads = () => {
  stallReads = false;
  pendingReads.splice(0).forEach((resume) => resume());
};
class Query {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.op = 'read';
  }
  select() {
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  range() {
    return this;
  }
  eq(k, v) {
    this.filters.push([k, v]);
    return this;
  }
  insert(data) {
    this.op = 'insert';
    this.data = data;
    return this;
  }
  update(data) {
    this.op = 'update';
    this.data = data;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  single() {
    this.one = true;
    return this;
  }
  maybeSingle() {
    this.one = true;
    return this;
  }
  then(resolve, reject) {
    if (this.op === 'read' && stallReads)
      return new Promise((resume) => pendingReads.push(resume)).then(() =>
        this.then(resolve, reject),
      );
    if (this.table === 'diario' && this.op === 'insert' && failDiaryWrite) {
      failDiaryWrite = false;
      return Promise.resolve({
        data: null,
        error: new Error('TimeoutError: request timed out'),
      }).then(resolve, reject);
    }
    try {
      let rows = records[this.table].filter((row) => this.filters.every(([k, v]) => row[k] === v));
      if (this.op === 'read' && ['evaluaciones', 'diario'].includes(this.table))
        rows = rows.filter(
          (row) => !archiveMarkers.some((m) => m.tipo === this.table && m.id === String(row.id)),
        );
      if (this.op === 'insert') {
        const row = { id: 'test-' + Date.now(), creado_en: new Date().toISOString(), ...this.data };
        records[this.table].unshift(row);
        rows = [row];
      }
      if (this.op === 'update') rows.forEach((row) => Object.assign(row, this.data));
      if (this.op === 'delete')
        records[this.table] = records[this.table].filter((row) => !rows.includes(row));
      return Promise.resolve({ data: this.one ? (rows[0] ?? null) : rows, error: null }).then(
        resolve,
        reject,
      );
    } catch (e) {
      return Promise.reject(e).then(resolve, reject);
    }
  }
}
let loseEvaluationResponse = false;
const archiveMarkers = [];
const evaluationRequests = [];
const liveChanges = [];
let removedChannels = 0;
const fakeDB = {
  channel: () => ({
    on(type, filter, callback) {
      liveChanges.push({ type, filter, callback });
      return this;
    },
    subscribe() {
      return this;
    },
  }),
  removeChannel: () => {
    removedChannels++;
  },
  from: (table) => new Query(table),
  rpc: (_name, args) => {
    if (_name === 'calmavial_cuenta_activa') return Promise.resolve({ data: true, error: null });
    if (_name === 'calmavial_estado_usuarios') return Promise.resolve({ data: [], error: null });
    if (_name === 'calmavial_informe') {
      const rows = records.evaluaciones
        .filter(
          (row) =>
            !archiveMarkers.some((m) => m.tipo === 'evaluaciones' && m.id === String(row.id)),
        )
        .sort((a, b) => Date.parse(b.creado_en) - Date.parse(a.creado_en));
      return Promise.resolve({
        data: {
          version: 1,
          usuario_id: user.id,
          nombre: 'Prueba PDF',
          generado_en: new Date().toISOString(),
          total_evaluaciones: rows.length,
          evaluaciones: rows.slice(0, 3),
        },
        error: null,
      });
    }
    if (_name === 'calmavial_papelera')
      return Promise.resolve({ data: archiveMarkers.map((row) => ({ ...row })), error: null });
    if (_name === 'calmavial_archivar' || _name === 'calmavial_restaurar') {
      const index = archiveMarkers.findIndex(
        (row) => row.tipo === args.p_tipo && row.id === args.p_id,
      );
      if (_name === 'calmavial_archivar' && index < 0)
        archiveMarkers.push({
          tipo: args.p_tipo,
          id: args.p_id,
          detalle: 'Registro de prueba archivado',
          archivado_en: new Date().toISOString(),
        });
      if (_name === 'calmavial_restaurar' && index >= 0) archiveMarkers.splice(index, 1);
      return Promise.resolve({ data: true, error: null });
    }
    return {
      single: async () => {
        evaluationRequests.push(args.p_request_id);
        const existing = records.evaluaciones.find(
          (row) => row.testRequestId === args.p_request_id,
        );
        if (existing) return { data: existing, error: null };
        const row = {
          id: 'evaluation-' + args.p_request_id,
          testRequestId: args.p_request_id,
          usuario_id: user.id,
          creado_en: new Date().toISOString(),
          respuestas: args.p_respuestas,
          total: 42,
          prom_general: 3,
          prom_avance: 3,
          prom_temeraria: 3,
          prom_hostilidad: 3,
          nivel: 'Moderado',
          momento: args.p_momento,
          vehiculo: args.p_vehiculo,
          animo: args.p_animo,
        };
        records.evaluaciones.unshift(row);
        if (loseEvaluationResponse) {
          loseEvaluationResponse = false;
          return { data: null, error: new Error('Failed to fetch') };
        }
        return { data: row, error: null };
      },
    };
  },
  auth: {
    getSession: async () => ({ data: { session }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => ({ data: {}, error: null }),
  },
};
const modal = document.getElementById('modal');
modal.showModal = () => {
  modal.open = true;
};
modal.close = () => {
  modal.open = false;
};
document.hasFocus = () => true;
globalThis.window = window;
globalThis.document = document;
globalThis.location = { origin: 'http://test.local', pathname: '/', hash: '#inicio' };
globalThis.FormData = class {
  constructor(form) {
    this.fields = [...form.querySelectorAll('[name]')].map((e) => [e.name, e.value]);
  }
  [Symbol.iterator]() {
    return this.fields[Symbol.iterator]();
  }
};
window.supabase = { createClient: () => fakeDB };
const interval = globalThis.setInterval;
globalThis.setInterval = () => 1;
await import('../js/auth/auth-ui.js');
window.CalmaAuthUI.setServiceState('ready');
await import('../js/app.js');
await new Promise((resolve) => setImmediate(resolve));
globalThis.setInterval = interval;
const tick = () => new Promise((resolve) => setImmediate(resolve));
const click = (selector) => {
  const el = document.querySelector(selector);
  assert.ok(el, `Missing control: ${selector}`);
  el.dispatchEvent(new window.Event('click', { bubbles: true }));
};
const route = async (hash) => {
  location.hash = hash;
  window.dispatchEvent(new window.Event('hashchange'));
  await tick();
};
test('La interfaz completa trabaja con el contrato compartido de la API', async (t) => {
  await t.test('La sesión muestra el resumen y oculta administración al usuario', async () => {
    assert.equal(document.getElementById('authScreen').hidden, true);
    assert.match(document.getElementById('page').textContent, /Hola, Prueba/);
    assert.equal(document.getElementById('adminNav').hidden, true);
    await route('#admin');
    await route('#sistema');
    assert.doesNotMatch(document.getElementById('page').textContent, /encrypted_password/);
    assert.match(document.getElementById('page').textContent, /Hola, Prueba/);
  });
  await t.test('Las 14 respuestas crean una evaluación compatible con la app', async () => {
    await route('#evaluacion');
    const form = document.getElementById('evalContextForm');
    // Linkedom does not implement HTMLSelectElement.value setters.
    for (const el of form.querySelectorAll('select'))
      Object.defineProperty(el, 'value', {
        value:
          el.querySelector('option').getAttribute('value') ||
          el.querySelector('option').textContent,
      });
    form.dispatchEvent(new window.Event('submit', { bubbles: true }));
    await tick();
    loseEvaluationResponse = true;
    for (let i = 0; i < 14; i++) {
      click('[data-action="answer"][data-value="3"]');
      click('[data-action="eval-next"]');
      await tick();
    }
    assert.equal(records.evaluaciones.length, 1);
    assert.equal(modal.open, false);
    assert.match(document.getElementById('evalFeedback').textContent, /No se pudo conectar/);
    stallReads = true;
    click('[data-action="eval-next"]');
    await tick();
    await tick();
    assert.equal(evaluationRequests.length, 2);
    assert.equal(evaluationRequests[0], evaluationRequests[1]);
    assert.equal(records.evaluaciones.length, 1);
    assert.equal(records.evaluaciones[0].total, 42);
    assert.equal(records.evaluaciones[0].nivel, 'Moderado');
    assert.equal(records.evaluaciones[0].usuario_id, user.id);
    assert.equal(records.evaluaciones[0].respuestas.length, 14);
    assert.equal(records.evaluaciones[0].animo, 1);
    assert.equal(modal.open, true);
    assert.match(document.getElementById('modalBody').textContent, /42/);
    assert.ok(pendingReads.length, 'La recarga atascada no bloquea el resultado guardado');
    resumeReads();
    await tick();
    click('[data-action="close-modal"]');
  });
  await t.test('El historial requiere confirmación antes de eliminar una evaluación', async () => {
    await route('#historial');
    click('[data-action="delete-evaluation"]');
    assert.equal(records.evaluaciones.length, 1);
    click('[data-action="close-modal"]');
    assert.equal(records.evaluaciones.length, 1);
  });
  await t.test('El diario permite crear, editar y eliminar sin duplicar datos', async () => {
    await route('#diario');
    click('[data-action="new-diary"]');
    let form = document.getElementById('diaryForm');
    form.querySelector('[name=situacion]').value = 'Registro de prueba local';
    for (const [name, value] of [
      ['factor', 'AVANCE'],
      ['intensidad', '3'],
    ])
      Object.defineProperty(form.querySelector(`[name=${name}]`), 'value', { value });
    failDiaryWrite = true;
    form.dispatchEvent(new window.Event('submit', { bubbles: true }));
    await tick();
    assert.equal(records.diario.length, 0);
    assert.equal(form.querySelector('[type=submit]').disabled, false);
    assert.equal(form.querySelector('[name=situacion]').value, 'Registro de prueba local');
    assert.match(document.getElementById('diaryFeedback').textContent, /revisa el historial/);
    stallReads = true;
    form.dispatchEvent(new window.Event('submit', { bubbles: true }));
    await tick();
    await tick();
    assert.equal(records.diario.length, 1);
    assert.equal(records.diario[0].usuario_id, user.id);
    click('[data-action="data-status"]');
    assert.match(document.getElementById('modalBody').textContent, /Diario · Creado/);
    assert.match(document.getElementById('modalBody').textContent, /Referencia:/);
    assert.doesNotMatch(document.getElementById('modalBody').textContent, /encrypted_password/);
    click('#modalClose');
    assert.equal(modal.open, false, 'El diario se confirma antes de terminar la recarga');
    assert.match(document.getElementById('page').textContent, /Registro de prueba local/);
    resumeReads();
    await tick();
    click('[data-action="edit-diary"]');
    form = document.getElementById('diaryForm');
    form.querySelector('[name=situacion]').value = 'Reflexión editada';
    for (const [name, value] of [
      ['factor', 'AVANCE'],
      ['intensidad', '4'],
    ])
      Object.defineProperty(form.querySelector(`[name=${name}]`), 'value', { value });
    form.dispatchEvent(new window.Event('submit', { bubbles: true }));
    await tick();
    await tick();
    assert.equal(records.diario.length, 1);
    assert.equal(records.diario[0].situacion, 'Reflexión editada');
    assert.equal(records.diario[0].intensidad, 4);
    click('[data-action="delete-diary"]');
    assert.equal(records.diario.length, 1);
    click('[data-action="confirm-delete-diary"]');
    await tick();
    await tick();
    assert.equal(records.diario.length, 0);
  });
  await t.test('El perfil puede cambiarse sin permitir elevar el rol', async () => {
    await route('#perfil');
    const form = document.getElementById('profileForm');
    assert.ok(form);
    assert.equal(form.querySelector('[name=rol]'), null);
    form.querySelector('[name=nombres]').value = 'Nombre actualizado';
    Object.defineProperty(form.querySelector('[name=genero]'), 'value', { value: 'Otro' });
    form.dispatchEvent(new window.Event('submit', { bubbles: true }));
    await tick();
    await tick();
    assert.equal(records.perfiles[0].nombres, 'Nombre actualizado');
    assert.equal(records.perfiles[0].rol, 'usuario');
  });
  await t.test(
    'El administrador ve indicadores y actividad sin exponer el diario personal',
    async () => {
      records.perfiles[0].rol = 'admin';
      click('#refreshBtn');
      await tick();
      await tick();
      await route('#admin');
      await tick();
      await tick();
      assert.equal(document.getElementById('adminNav').hidden, false);
      assert.match(document.getElementById('page').textContent, /Factores de la comunidad/);
      assert.match(document.getElementById('page').textContent, /Tu comunidad/);
      assert.equal(document.getElementById('appScreen').classList.contains('is-admin'), true);
      await route('#usuarios');
      assert.match(document.getElementById('page').textContent, /Distribución de resultados/);
      assert.equal(document.querySelectorAll('.metric-card').length, 4);
      click('[data-action="manage-user"]');
      await tick();
      assert.match(document.getElementById('modalBody').textContent, /42 \/ 70/);
      assert.doesNotMatch(document.getElementById('modalBody').textContent, /Reflexión editada/);
      click('#modalClose');
      records.perfiles[0].rol = 'usuario';
      click('#refreshBtn');
      await tick();
      await tick();
      await route('#admin');
      assert.equal(document.getElementById('adminNav').hidden, true);
    },
  );
  await t.test(
    'El administrador gestiona avisos y el estudiante solo ve los publicados',
    async () => {
      records.perfiles[0].rol = 'admin';
      click('#refreshBtn');
      await tick();
      await tick();
      await route('#avisos');
      await tick();
      await tick();
      click('[data-action="new-notice"]');
      const form = document.getElementById('noticeForm');
      form.querySelector('[name="titulo"]').value = 'Aviso de prueba';
      form.querySelector('[name="mensaje"]').value =
        '<script>Texto que debe mostrarse sin ejecutar</script>';
      form.dispatchEvent(new window.Event('submit', { bubbles: true }));
      await tick();
      await tick();
      assert.equal(records.calmavial_avisos.length, 1);
      // El servidor real define activo=true. El doble no reproduce valores predeterminados.
      records.calmavial_avisos[0].activo = true;
      await route('#avisos');
      await tick();
      await tick();
      assert.equal(document.getElementById('page').querySelector('script'), null);
      assert.match(document.getElementById('page').textContent, /Texto que debe mostrarse/);
      click('[data-action="toggle-notice"]');
      await tick();
      await tick();
      assert.equal(records.calmavial_avisos[0].activo, false);
      records.perfiles[0].rol = 'usuario';
      click('#refreshBtn');
      await tick();
      await tick();
      await route('#avisos');
      await tick();
      await tick();
      assert.doesNotMatch(document.getElementById('page').textContent, /Aviso de prueba/);
      assert.equal(document.querySelector('[data-action="new-notice"]'), null);
      records.calmavial_avisos.length = 0;
    },
  );
  await t.test(
    'El informe se prepara con tres evaluaciones y la papelera permite restaurar sin borrado físico',
    async () => {
      const original = records.evaluaciones.slice();
      const fetchBefore = globalThis.fetch;
      const fonts = await Promise.all(
        ['Regular', 'Bold'].map((name) =>
          readFile(new URL(`../assets/fonts/Roboto-${name}.ttf`, import.meta.url)),
        ),
      );
      window.jspdf = { jsPDF };
      globalThis.fetch = async (url) => new Response(fonts[String(url).includes('Bold') ? 1 : 0]);
      try {
        records.evaluaciones = [1, 2, 3].map((n) => ({
          id: String(100 + n),
          usuario_id: user.id,
          creado_en: new Date(Date.now() + n * 10000).toISOString(),
          respuestas: Array(14).fill(n + 1),
          total: 14 * (n + 1),
          prom_general: n + 1,
          prom_avance: n + 1,
          prom_temeraria: n + 1,
          prom_hostilidad: n + 1,
          nivel: 'Moderado',
        }));
        click('#refreshBtn');
        await tick();
        await tick();
        await route('#informe');
        for (
          let n = 0;
          n < 20 && document.querySelector('[data-action="download-report"]').disabled;
          n++
        )
          await tick();
        assert.equal(document.querySelector('[data-action="download-report"]').disabled, false);
        assert.match(
          document.getElementById('page').textContent,
          /valoración médica o psicológica/,
        );
        await route('#historial');
        click('[data-action="archive-record"][data-id="101"]');
        assert.equal(archiveMarkers.length, 0);
        click('[data-action="confirm-archive"]');
        await tick();
        await tick();
        assert.equal(records.evaluaciones.length, 3, 'Archivar no borra la fila');
        assert.equal(archiveMarkers.length, 1);
        await route('#informe');
        await tick();
        assert.equal(document.querySelector('[data-action="download-report"]').disabled, true);
        await route('#papelera');
        await tick();
        click('[data-action="restore-record"]');
        await tick();
        await tick();
        assert.equal(archiveMarkers.length, 0);
        await route('#informe');
        for (
          let n = 0;
          n < 20 && document.querySelector('[data-action="download-report"]').disabled;
          n++
        )
          await tick();
        assert.equal(document.querySelector('[data-action="download-report"]').disabled, false);
      } finally {
        records.evaluaciones = original;
        archiveMarkers.length = 0;
        globalThis.fetch = fetchBefore;
        click('#refreshBtn');
        await tick();
        await tick();
      }
    },
  );
  await t.test('Eliminar una evaluación confirmada actualiza el historial', async () => {
    await route('#historial');
    click('[data-action="delete-evaluation"]');
    click('[data-action="confirm-delete-evaluation"]');
    await tick();
    await tick();
    assert.equal(records.evaluaciones.length, 0);
    assert.match(document.getElementById('page').textContent, /Aún no tienes evaluaciones/);
  });
  await t.test(
    'Un cambio externo actualiza el resumen y el canal se limita al propietario',
    async () => {
      await route('#inicio');
      const change = liveChanges.find((event) => event.filter.table === 'evaluaciones');
      assert.equal(change.filter.filter, `usuario_id=eq.${user.id}`);
      records.evaluaciones.push({
        id: 'android-simulado',
        usuario_id: user.id,
        total: 56,
        prom_general: 4,
        prom_avance: 4,
        prom_temeraria: 4,
        prom_hostilidad: 4,
        nivel: 'Elevado',
        creado_en: new Date().toISOString(),
      });
      change.callback();
      await tick();
      await tick();
      assert.match(document.getElementById('page').textContent, /56/);
      assert.equal(document.getElementById('syncState').textContent, 'Datos actualizados');
      records.evaluaciones = [];
      change.callback();
      await tick();
      await tick();
    },
  );
  await t.test(
    'Los tres ritmos avanzan, mantienen el volumen y completan ciclos sin foco',
    async () => {
      await route('#calma');
      const realPerformance = globalThis.performance;
      const realSetInterval = globalThis.setInterval;
      const realClearInterval = globalThis.clearInterval;
      let now = 0;
      let sequence = 0;
      const timers = new Map();
      globalThis.performance = { now: () => now };
      globalThis.setInterval = (callback) => {
        timers.set(++sequence, callback);
        return sequence;
      };
      globalThis.clearInterval = (id) => timers.delete(id);
      document.hasFocus = () => false;
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        writable: true,
        value: false,
      });
      try {
        for (const [pattern, phases] of [
          [
            'box',
            [
              ['Inhala', 4],
              ['Retén', 4],
              ['Exhala', 4],
              ['Pausa', 4],
            ],
          ],
          [
            'relax',
            [
              ['Inhala', 4],
              ['Retén', 7],
              ['Exhala', 8],
            ],
          ],
          [
            'gentle',
            [
              ['Inhala', 5],
              ['Exhala', 5],
            ],
          ],
        ]) {
          click(`[data-action="pattern"][data-value="${pattern}"]`);
          click('[data-action="breath-toggle"]');
          assert.equal(timers.size, 1);
          for (const [phase, seconds] of phases) {
            assert.equal(document.getElementById('breathPhase').textContent, phase);
            assert.equal(document.getElementById('breathCount').textContent, `${seconds} segundos`);
            assert.equal(
              document.getElementById('breathOrb').style.transform,
              ['Inhala', 'Retén'].includes(phase) ? 'scale(1.13)' : 'scale(.9)',
            );
            now += seconds * 1000;
            [...timers.values()][0]();
          }
          assert.match(document.getElementById('breathCycles').textContent, /1 ciclo completado/);
          click('[data-action="breath-toggle"]');
          assert.equal(timers.size, 0);
          assert.equal(document.getElementById('breathOrb').style.transform, 'scale(1)');
        }
        click('[data-action="breath-toggle"]');
        await route('#calma');
        assert.equal(document.getElementById('breathPhase').textContent, 'Inhala');
        document.hidden = true;
        document.dispatchEvent(new window.Event('visibilitychange'));
        assert.equal(timers.size, 0);
        assert.equal(document.getElementById('breathCount').textContent, 'Ejercicio detenido');
        document.hidden = false;
        click('[data-action="breath-toggle"]');
        click('[data-action="breath-reset"]');
        assert.equal(timers.size, 0);
        assert.equal(document.getElementById('breathPhase').textContent, 'A tu ritmo');
        click('[data-action="breath-toggle"]');
        await route('#inicio');
        assert.equal(timers.size, 0);
      } finally {
        document.hidden = false;
        document.hasFocus = () => true;
        globalThis.performance = realPerformance;
        globalThis.setInterval = realSetInterval;
        globalThis.clearInterval = realClearInterval;
      }
    },
  );
  await t.test('Modo calma y cierre de sesión están conectados a sus controles', async () => {
    await route('#calma');
    click('[data-action="pattern"][data-value="gentle"]');
    assert.equal(
      document.querySelector('[data-value="gentle"]').getAttribute('aria-pressed'),
      'true',
    );
    click('[data-action="privacy"]');
    assert.equal(modal.open, true);
    click('#modalClose');
    document
      .getElementById('logoutBtn')
      .dispatchEvent(new window.Event('click', { bubbles: true }));
    await tick();
    assert.equal(document.getElementById('authScreen').hidden, false);
    assert.equal(document.getElementById('appScreen').hidden, true);
    assert.equal(removedChannels, 1);
  });
  await t.test('Acceso muestra errores legibles y permite cambiar a registro', async () => {
    fakeDB.auth.signInWithPassword = async () => ({
      data: null,
      error: { message: 'Invalid login credentials' },
    });
    document.getElementById('authEmail').value = 'test@example.com';
    document.getElementById('authPass').value = 'test-only';
    document
      .getElementById('authForm')
      .dispatchEvent(new window.Event('submit', { bubbles: true }));
    await tick();
    assert.match(document.getElementById('authFeedback').textContent, /no coinciden/);
    click('#signupTab');
    assert.equal(document.getElementById('consentWrap').hidden, false);
    assert.equal(document.getElementById('signupTab').getAttribute('aria-selected'), 'true');
    const submitSignup = () =>
      document
        .getElementById('authForm')
        .dispatchEvent(new window.Event('submit', { bubbles: true }));
    document.getElementById('authPass').value = 'Una-clave-de-prueba9!';
    document.getElementById('authConfirmPass').value = 'otra-clave';
    document.getElementById('consent').checked = true;
    submitSignup();
    await tick();
    assert.match(document.getElementById('authConfirmValidation').textContent, /deben coincidir/);
    document.getElementById('authConfirmPass').value = 'Una-clave-de-prueba9!';
    document.getElementById('consent').checked = false;
    submitSignup();
    await tick();
    assert.match(document.getElementById('authFeedback').textContent, /acepta la política/);
    fakeDB.auth.signUp = async () => ({ data: { session: null }, error: null });
    document.getElementById('consent').checked = true;
    submitSignup();
    await tick();
    assert.match(document.getElementById('authFeedback').textContent, /Revisa tu correo/);
    click('#loginTab');
    assert.equal(document.getElementById('authConfirmPass').disabled, true);
    click('#forgotBtn');
    assert.equal(modal.open, true);
    assert.ok(document.getElementById('forgotForm'));
    click('#modalClose');
  });
  await t.test(
    'El inicio de sesión sin sesión devuelta informa fallo y conserva el acceso',
    async () => {
      fakeDB.auth.signInWithPassword = async () => ({ data: { session: null }, error: null });
      document.getElementById('authEmail').value = 'test@example.com';
      document.getElementById('authPass').value = 'clave-local';
      document
        .getElementById('authForm')
        .dispatchEvent(new window.Event('submit', { bubbles: true }));
      await tick();
      assert.match(document.getElementById('authFeedback').textContent, /No se pudo iniciar/);
      assert.equal(document.getElementById('authScreen').hidden, false);
      assert.equal(document.getElementById('authSubmit').disabled, false);
    },
  );
  await t.test(
    'Estudiante y administrador entran con el perfil autorizado y salen correctamente',
    async () => {
      for (const role of ['usuario', 'admin']) {
        records.perfiles[0].rol = role;
        click(`[data-action="login-role"][data-value="${role}"]`);
        let credentials;
        fakeDB.auth.signInWithPassword = async (input) => {
          credentials = input;
          return { data: { session }, error: null };
        };
        document.getElementById('authEmail').value = ' TEST@EXAMPLE.COM ';
        document.getElementById('authPass').value = 'clave-local';
        document
          .getElementById('authForm')
          .dispatchEvent(new window.Event('submit', { bubbles: true }));
        await tick();
        await tick();
        assert.equal(credentials.email, 'test@example.com');
        assert.equal(document.getElementById('authScreen').hidden, true);
        assert.equal(document.getElementById('appScreen').hidden, false);
        assert.equal(document.getElementById('adminNav').hidden, role !== 'admin');
        assert.equal(document.getElementById('authPass').value, '');
        if (role === 'admin') {
          await route('#sistema');
          assert.match(document.getElementById('page').textContent, /Comprobar ahora/);
          assert.match(document.getElementById('page').textContent, /Editar las 14 preguntas/);
          await route('#inicio');
          click('[data-action="data-status"]');
          assert.match(document.getElementById('modalBody').textContent, /auth.users/);
          assert.match(document.getElementById('modalBody').textContent, /public.evaluaciones/);
          assert.match(document.getElementById('modalBody').textContent, /Todavía no has guardado/);
          click('#modalClose');
        }
        if (role === 'admin') {
          fakeDB.auth.signOut = async () => ({ data: null, error: new Error('Failed to fetch') });
          click('#logoutBtn');
          await tick();
          assert.equal(document.getElementById('appScreen').hidden, false);
          assert.equal(document.getElementById('logoutBtn').disabled, false);
          assert.match(document.getElementById('toast').textContent, /No se pudo conectar/);
        }
        let scope;
        fakeDB.auth.signOut = async (options) => {
          scope = options.scope;
          return { data: {}, error: null };
        };
        click(role === 'admin' ? '[data-action="logout"]' : '#logoutBtn');
        await tick();
        assert.equal(scope, 'local');
        assert.equal(document.getElementById('authScreen').hidden, false);
        assert.equal(document.getElementById('appScreen').hidden, true);
        assert.equal(document.getElementById('page').textContent, '');
        assert.equal(document.getElementById('modalBody').textContent, '');
        assert.equal(document.getElementById('userName').textContent, '');
        assert.equal(document.getElementById('adminNav').hidden, true);
        assert.equal(location.hash, 'iniciar-sesion');
        await route('#admin');
        assert.equal(document.getElementById('appScreen').hidden, true);
      }
    },
  );
  await t.test(
    'El enlace de acceso cierra una sesión activa y permite entrar de nuevo',
    async () => {
      let exits = 0;
      fakeDB.auth.signInWithPassword = async () => ({ data: { session }, error: null });
      fakeDB.auth.signOut = async () => {
        exits++;
        return { data: {}, error: null };
      };
      const login = async () => {
        document.getElementById('authEmail').value = 'test@example.com';
        document.getElementById('authPass').value = 'clave-local';
        document
          .getElementById('authForm')
          .dispatchEvent(new window.Event('submit', { bubbles: true }));
        await tick();
        await tick();
      };
      await login();
      await route('#iniciar-sesion');
      await tick();
      assert.equal(exits, 1);
      assert.equal(document.getElementById('authScreen').hidden, false);
      assert.equal(document.getElementById('page').textContent, '');
      await login();
      assert.equal(document.getElementById('appScreen').hidden, false);
      assert.equal(exits, 1, 'No vuelve a cerrar la sesión recién iniciada');
      click('#logoutBtn');
      await tick();
    },
  );
  await t.test(
    'Login avisa de pocos caracteres y no permite elegir privilegios ajenos',
    async () => {
      const password = document.getElementById('authPass');
      password.value = 'abc';
      password.dispatchEvent(new window.Event('input', { bubbles: true }));
      assert.match(document.getElementById('authPasswordValidation').textContent, /al menos 6/);
      assert.equal(password.getAttribute('aria-invalid'), 'true');
      password.value = 'clave-local';
      password.dispatchEvent(new window.Event('input', { bubbles: true }));
      assert.equal(password.getAttribute('aria-invalid'), 'false');
      records.perfiles[0].rol = 'usuario';
      click('[data-action="login-role"][data-value="admin"]');
      document.getElementById('authEmail').value = 'test@example.com';
      document
        .getElementById('authForm')
        .dispatchEvent(new window.Event('submit', { bubbles: true }));
      await tick();
      await tick();
      assert.match(
        document.getElementById('authFeedback').textContent,
        /no tiene el rol seleccionado/,
      );
      assert.equal(document.getElementById('appScreen').hidden, true);
      assert.equal(records.perfiles[0].rol, 'usuario');
      click('[data-action="login-role"][data-value="usuario"]');
      password.value = 'clave-local';
      document
        .getElementById('authForm')
        .dispatchEvent(new window.Event('submit', { bubbles: true }));
      await tick();
      await tick();
      assert.equal(document.getElementById('appScreen').hidden, false);
      assert.equal(document.getElementById('adminNav').hidden, true);
      click('#logoutBtn');
      await tick();
    },
  );
  await t.test(
    'El registro muestra requisitos pendientes y cumplidos sin cambiar el login existente',
    async () => {
      click('#signupTab');
      const password = document.getElementById('authPass');
      const confirmation = document.getElementById('authConfirmPass');
      assert.equal(document.getElementById('passwordRequirements').hidden, false);
      password.value = 'Abcdef12!';
      password.dispatchEvent(new window.Event('input', { bubbles: true }));
      assert.equal(document.querySelectorAll('#passwordRequirements .met').length, 5);
      confirmation.value = password.value;
      confirmation.dispatchEvent(new window.Event('input', { bubbles: true }));
      assert.equal(document.querySelectorAll('#passwordRequirements .met').length, 6);
      confirmation.value = 'OtraClave1!';
      confirmation.dispatchEvent(new window.Event('input', { bubbles: true }));
      assert.equal(document.querySelector('[data-rule="match"]').classList.contains('met'), false);
      click('#loginTab');
      assert.equal(document.getElementById('passwordRequirements').hidden, true);
      password.value = '';
      confirmation.value = '';
    },
  );
  await t.test(
    'Una respuesta tardía de login no abre una sesión después de cambiar a registro',
    async () => {
      click('#loginTab');
      click('[data-action="login-role"][data-value="usuario"]');
      records.perfiles[0].rol = 'usuario';
      let resolveLogin;
      let discarded = 0;
      fakeDB.auth.signInWithPassword = () =>
        new Promise((resolve) => {
          resolveLogin = resolve;
        });
      fakeDB.auth.signOut = async () => {
        discarded++;
        return { data: {}, error: null };
      };
      document.getElementById('authEmail').value = 'test@example.com';
      document.getElementById('authPass').value = 'clave-local';
      document
        .getElementById('authForm')
        .dispatchEvent(new window.Event('submit', { bubbles: true }));
      await tick();
      assert.equal(document.getElementById('authSubmit').disabled, true);
      click('#signupTab');
      assert.equal(document.getElementById('signupTab').getAttribute('aria-selected'), 'true');
      resolveLogin({ data: { session }, error: null });
      await tick();
      await tick();
      assert.equal(discarded, 1);
      assert.equal(document.getElementById('appScreen').hidden, true);
      assert.equal(document.getElementById('signupTab').getAttribute('aria-selected'), 'true');
      assert.equal(document.getElementById('authSubmit').disabled, false);
      assert.equal(document.getElementById('authSubmit').textContent, 'Crear mi cuenta');
      assert.match(document.getElementById('authFeedback').textContent, /Cambiaste la opción/);
    },
  );
});
