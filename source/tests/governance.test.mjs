// API aislada y DOM sintético; la autorización PostgreSQL se prueba aparte con rollback.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { QUESTIONS, validateProfile } from '../js/domain/domain.js';
import { validateQuestionnaire, questionsFor } from '../js/domain/questionnaire.js';
import { createGovernanceApi } from '../js/services/governance-api.js';
import { createGovernance } from '../js/features/governance.js';
const original = QUESTIONS.map(([text]) => text);

test('El cuestionario conserva 14 textos distintos y exige un motivo', () => {
  assert.throws(() => validateQuestionnaire(original.slice(1), 'Motivo de actualización'));
  assert.throws(() =>
    validateQuestionnaire(
      [...Array(14)].map(() => original[0]),
      'Motivo de actualización',
    ),
  );
  assert.throws(() => validateQuestionnaire(original, 'corto'));
  const texts = [...original];
  texts[0] = '<script>alert(1)</script>';
  assert.throws(() => validateQuestionnaire(texts, 'Motivo de actualización'));
  assert.deepEqual(validateQuestionnaire(original, 'Motivo de actualización').questions, original);
});
test('El historial utiliza el texto registrado aunque cambie la versión vigente', () => {
  const catalog = [
    { id: 1, preguntas: original },
    { id: 2, preguntas: original.map((q) => q + ' Nueva redacción.') },
  ];
  assert.equal(
    questionsFor({ id: 10 }, catalog, [{ evaluacion_id: 10, cuestionario_id: 1 }]).preguntas[0],
    original[0],
  );
  assert.equal(
    questionsFor({ id: 11 }, catalog, [{ evaluacion_id: 11, cuestionario_id: 2 }]).id,
    2,
  );
  const embedded = { id: 3, preguntas: original.map((q) => q + ' Versión de la consulta.') };
  assert.equal(
    questionsFor(
      { id: 12, calmavial_evaluacion_version: { calmavial_cuestionarios: embedded } },
      catalog,
    ).id,
    3,
  );
});
test('El perfil rechaza nombres numéricos, apellidos cortos y documentos y direcciones inválidos', () => {
  const base = { nombres: 'María José', edad: 25 };
  for (const invalid of [
    { nombres: 'Pedro123' },
    { apellido_materno: 't' },
    { documento: 'ABCD' },
    { direccion: '12345' },
    { genero: 'Inventado' },
  ])
    assert.throws(() => validateProfile({ ...base, ...invalid }));
  assert.doesNotThrow(() =>
    validateProfile({
      ...base,
      apellido_paterno: "O'Connor",
      documento: '6904924',
      telefono: '+591 76558972',
      direccion: 'Avenida Busch',
      genero: '',
    }),
  );
});
test('La API no envía cambios de cuenta inválidos ni informa éxito ante un rechazo', async () => {
  const calls = [];
  const api = createGovernanceApi({
    rpc: async (name, values) => {
      calls.push({ name, values });
      return { error: new Error('Operación rechazada por el servidor') };
    },
  });
  await assert.rejects(api.changeAccount('incorrecto', true, 'Motivo suficientemente largo'));
  assert.equal(calls.length, 0);
  await assert.rejects(api.changeAccount('00000000-0000-4000-8000-000000000001', true, 'corto'));
  assert.equal(calls.length, 0);
  await assert.rejects(
    api.changeAccount('00000000-0000-4000-8000-000000000001', true, 'Motivo suficientemente largo'),
    /rechazada/,
  );
  assert.equal(calls[0].values.p_eliminar, true);
});

test('El control administrativo revisa/publica preguntas, retira/restaura acceso y ejecuta diagnóstico', async (t) => {
  const { window, document } = parseHTML(
    '<html><body><main id="page"></main><dialog id="modal"><h2 id="title"></h2><div id="body"></div></dialog></body></html>',
  );
  globalThis.document = document;
  globalThis.window = window;
  globalThis.FormData = class {
    constructor(form) {
      this.entries = [...form.querySelectorAll('[name]')].map((el) => [el.name, el.value]);
    }
    [Symbol.iterator]() {
      return this.entries[Symbol.iterator]();
    }
  };
  const uid = '00000000-0000-4000-8000-000000000001';
  const state = {
    revision: 1,
    session: { user: { id: 'admin' } },
    profile: { rol: 'admin' },
    catalog: [{ id: 1, vigente: true, preguntas: original }],
    removedUsers: [],
    deletedUsers: [],
    admin: {
      profiles: [
        { id: uid, rol: 'usuario', nombres: 'Persona de prueba', correo: 'qa@example.invalid' },
      ],
    },
  };
  const notices = [],
    published = [],
    changes = [];
  let failPublish = false;
  let failDelete = false;
  const deleteCalls = [];
  const deletionApi = createGovernanceApi({
    rpc: async (rpc, args) => {
      deleteCalls.push({ rpc, args });
      return failDelete ? { error: new Error('Baja rechazada por el servidor') } : { data: true };
    },
  });
  const api = {
    deleteAccount: async (id, restore, reason, confirmation) => {
      await deletionApi.deleteAccount(id, restore, reason, confirmation);
      state.deletedUsers = restore
        ? []
        : [{ usuario_id: id, motivo: reason, creado_en: new Date().toISOString() }];
    },
    publishQuestions: async (...args) => {
      if (failPublish) throw new Error('Conflicto de publicación');
      published.push(args);
    },
    changeAccount: async (id, removed, reason) => {
      if (reason.length < 10) throw new Error('Motivo demasiado corto');
      changes.push({ id, removed });
      state.removedUsers = removed ? [{ usuario_id: id }] : [];
    },
    diagnostics: async () => ({
      comprobado_en: new Date().toISOString(),
      hashes_bcrypt: 2,
      cuentas_con_password: 2,
      tablas_rls: 7,
      usuarios_eliminados: 0,
      auditoria: [],
    }),
  };
  const openModal = (title, body) => {
    document.getElementById('title').textContent = title;
    document.getElementById('body').innerHTML = body;
    document.getElementById('modal').open = true;
  };
  let controller;
  const render = () => {
    document.getElementById('page').innerHTML = controller.view();
  };
  controller = createGovernance({
    state,
    api,
    render,
    openModal,
    closeModal: () => {
      document.getElementById('modal').open = false;
    },
    toast: (msg) => notices.push(msg),
    errorText: (error) => error.message,
    reload: async () => {
      render();
    },
  });
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  const click = async (selector) => {
    const el = document.querySelector(selector);
    assert.ok(el, selector);
    el.dispatchEvent(new window.Event('click', { bubbles: true }));
    await tick();
  };
  const submit = async (id) => {
    document.getElementById(id).dispatchEvent(new window.Event('submit', { bubbles: true }));
    await tick();
  };
  render();
  await t.test('El diagnóstico permanece cerrado y sin resultados hasta solicitarlo', () => {
    assert.equal(document.querySelector('.diagnostic-panel').hasAttribute('open'), false);
    assert.match(document.getElementById('page').textContent, /Sin comprobar en esta sesión/);
    assert.equal(document.querySelector('.diagnostic-result'), null);
  });
  await t.test('La edición presenta comparación antes de publicar y conserva errores', async () => {
    await click('[data-action="govern-questions"]');
    assert.equal(document.querySelectorAll('[name^="question-"]').length, 14);
    document.getElementById('question-0').value = original[0] + ' Redacción actualizada.';
    document.getElementById('questionReason').value = 'Aclaración sintética del texto.';
    await submit('governQuestions');
    assert.equal(published.length, 0);
    assert.match(document.getElementById('body').textContent, /Anterior:/);
    failPublish = true;
    await click('[data-action="govern-publish"]');
    assert.match(document.getElementById('governFeedback').textContent, /Conflicto/);
    assert.equal(published.length, 0);
    failPublish = false;
    await click('[data-action="govern-publish"]');
    assert.equal(published.length, 1);
    assert.equal(published[0][2], 1);
  });
  await t.test('Suspender exige motivo y permite reactivar', async () => {
    document
      .getElementById('page')
      .insertAdjacentHTML(
        'beforeend',
        `<button data-action="govern-account" data-id="${uid}">Cuenta</button>`,
      );
    await click('[data-action="govern-account"]');
    assert.match(document.getElementById('title').textContent, /Suspender acceso/);
    document.getElementById('accountReason').value = 'corto';
    await submit('governAccount');
    assert.equal(changes.length, 0);
    document.getElementById('accountReason').value = 'Retirada de prueba recuperable';
    await submit('governAccount');
    assert.equal(changes[0].removed, true);
    document
      .getElementById('page')
      .insertAdjacentHTML(
        'beforeend',
        `<button data-action="govern-account" data-id="${uid}">Cuenta</button>`,
      );
    await click('[data-action="govern-account"]');
    assert.match(document.getElementById('title').textContent, /Reactivar acceso/);
    document.getElementById('accountReason').value = 'Restauración de prueba recuperable';
    await submit('governAccount');
    assert.equal(changes[1].removed, false);
  });
  await t.test(
    'La baja exige motivo y palabra de confirmación, conserva errores y permite restaurar',
    async () => {
      document
        .getElementById('page')
        .insertAdjacentHTML(
          'beforeend',
          `<button data-action="govern-delete" data-id="${uid}">Eliminar usuario</button>`,
        );
      await click('[data-action="govern-delete"]');
      assert.match(document.getElementById('body').textContent, /baja es recuperable/);
      document.getElementById('deleteReason').value = 'corto';
      document.getElementById('deleteConfirmation').value = 'ELIMINAR';
      await submit('governDelete');
      assert.equal(deleteCalls.length, 0);
      document.getElementById('deleteReason').value = 'Baja sintética de prueba';
      document.getElementById('deleteConfirmation').value = 'NO';
      await submit('governDelete');
      assert.equal(deleteCalls.length, 0);
      document.getElementById('deleteConfirmation').value = 'ELIMINAR';
      failDelete = true;
      await submit('governDelete');
      assert.equal(state.deletedUsers.length, 0);
      assert.match(document.getElementById('governFeedback').textContent, /rechazada/);
      assert.equal(document.querySelector('#governDelete [type="submit"]').disabled, false);
      failDelete = false;
      await submit('governDelete');
      assert.equal(state.deletedUsers.length, 1);
      document
        .getElementById('page')
        .insertAdjacentHTML('beforeend', '<button data-action="govern-deleted">Bajas</button>');
      await click('[data-action="govern-deleted"]');
      assert.match(document.getElementById('body').textContent, /Baja sintética de prueba/);
      await click('[data-action="govern-restore-user"]');
      document.getElementById('deleteReason').value = 'Restauración sintética de prueba';
      document.getElementById('deleteConfirmation').value = 'RESTAURAR';
      await submit('governDelete');
      assert.equal(state.deletedUsers.length, 0);
      assert.equal(deleteCalls.at(-1).args.p_restaurar, true);
    },
  );
  await t.test(
    'El diagnóstico consulta datos reales de la API y descarta respuestas tras salir',
    async () => {
      await click('[data-action="govern-check"]');
      assert.match(document.getElementById('page').textContent, /2 de 2 con formato bcrypt/);
      assert.equal(document.querySelector('.diagnostic-panel').hasAttribute('open'), true);
      api.diagnostics = async () => {
        throw new Error('Sin conexión de prueba');
      };
      await click('[data-action="govern-check"]');
      assert.match(document.querySelector('[role="alert"]').textContent, /Sin conexión/);
      assert.equal(document.querySelector('[data-action="govern-check"]').disabled, false);
      let resolve;
      api.diagnostics = () =>
        new Promise((done) => {
          resolve = done;
        });
      await click('[data-action="govern-check"]');
      state.session = null;
      state.revision++;
      controller.reset();
      document.getElementById('page').replaceChildren();
      resolve({ hashes_bcrypt: 999 });
      await tick();
      assert.equal(document.getElementById('page').textContent, '');
      assert.doesNotMatch(controller.view(), /999/);
    },
  );
});
