// Las pruebas UI de este archivo usan una API en memoria. Las políticas reales se
// comprueban aparte con database/verificacion-gestion.sql sobre PostgreSQL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { parseHTML } from 'linkedom';
import {
  validateThread,
  validateReply,
  composeReaction,
  diaryEmotion,
  evolution,
} from '../js/domain/management.js';
import { createManagementApi } from '../js/services/management-api.js';
import { createManagementController } from '../js/features/management-controller.js';
import { threadDetail, adminUserDetail } from '../js/features/management-views.js';
import { evolutionChart } from '../js/features/evolution.js';

const owner = '00000000-0000-4000-8000-000000000001';
const administrator = '00000000-0000-4000-8000-000000000002';
test('Sugerencias y respuestas rechazan textos insuficientes y tipos inventados', () => {
  assert.throws(
    () => validateThread({ asunto: 'abc', mensaje: 'Un mensaje suficiente.' }),
    /5 a 120/,
  );
  assert.throws(() => validateThread({ asunto: 'Asunto válido', mensaje: 'corto' }), /10 a 3000/);
  assert.throws(
    () =>
      validateThread({
        asunto: 'Asunto válido',
        mensaje: 'Un mensaje suficiente.',
        tipo: 'rol_admin',
      }),
    /tipo/,
  );
  assert.throws(() => validateReply('abc'), /5 a 3000/);
  assert.equal(
    validateThread({ asunto: ' Mi consulta ', mensaje: ' Este es mi mensaje. ' }).asunto,
    'Mi consulta',
  );
});
test('La emoción del diario se conserva en el contrato textual sin duplicarse al editar', () => {
  const saved = composeReaction('triste', 'Me detuve en un lugar seguro.');
  assert.deepEqual(diaryEmotion(saved), {
    emotion: 'triste',
    reaction: 'Me detuve en un lugar seguro.',
  });
  const decoded = diaryEmotion(saved);
  assert.equal(composeReaction(decoded.emotion, decoded.reaction), saved);
  assert.equal(diaryEmotion('Un registro anterior.').emotion, '');
  assert.throws(() => composeReaction('diagnostico', 'Texto'), /emoción válida/);
});
test('El gráfico ordena por fecha, conserva extremos y ofrece todos los datos en tabla', () => {
  const rows = Array.from({ length: 52 }, (_, i) => ({
    id: i + 1,
    creado_en: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
    prom_general: 1 + (i % 5),
    total: 14 * (1 + (i % 5)),
  }));
  assert.equal(evolution([...rows].reverse())[0].id, 1);
  const { document } = parseHTML(evolutionChart(rows));
  assert.equal(document.querySelectorAll('circle').length, 40);
  assert.equal(document.querySelectorAll('tbody tr').length, 52);
  assert.match(document.querySelector('svg').getAttribute('aria-label'), /52 evaluaciones/);
  assert.equal(evolution([{ creado_en: 'invalido', prom_general: 4 }]).length, 0);
});
test('Los textos de conversación y los títulos del gráfico no ejecutan etiquetas HTML', () => {
  const attack = '<img src=x onerror=alert(1)>';
  const row = {
    id: randomUUID(),
    usuario_id: owner,
    creado_por: owner,
    asunto: attack,
    mensaje: attack,
    estado: 'abierta',
    creado_en: '2026-11-19T12:00:00Z',
  };
  const { document } = parseHTML(
    threadDetail(row, [], { id: owner }, false) + evolutionChart([], attack),
  );
  assert.equal(document.querySelectorAll('img,script').length, 0);
  assert.ok(
    [...document.querySelectorAll('p,h2,h3')].some((node) => node.textContent.includes(attack)),
  );
});
test('La API administrativa solo permite los campos de perfil previstos y exige UUID válidos', async () => {
  let payload;
  const query = {
    update(data) {
      payload = data;
      return this;
    },
    eq() {
      return this;
    },
    select() {
      return this;
    },
    single: async () => ({ data: { id: owner }, error: null }),
  };
  const api = createManagementApi({ from: () => query });
  await api.editProfile(owner, {
    nombres: 'Usuario editado',
    edad: '25',
    telefono: '+591 71234567',
    rol: 'admin',
    correo: 'forjado@example.invalid',
    id: administrator,
  });
  assert.equal(payload.edad, 25);
  assert.equal(payload.rol, undefined);
  assert.equal(payload.correo, undefined);
  assert.equal(payload.id, undefined);
  assert.throws(
    () => api.editProfile('inventado', { nombres: 'Usuario', edad: '25' }),
    /identificador/,
  );
  assert.throws(() => api.status(owner, 'privilegiado'), /estado/);
});
test('Una edición rechazada por el servidor nunca se transforma en un guardado exitoso', async () => {
  const query = {
    update() {
      return this;
    },
    eq() {
      return this;
    },
    select() {
      return this;
    },
    single: async () => ({ data: null, error: new Error('Acceso denegado por RLS') }),
  };
  await assert.rejects(
    createManagementApi({ from: () => query }).editReply(owner, 'Una respuesta válida.'),
    /RLS/,
  );
});

test('La bandeja completa permite sugerir, responder, moderar, archivar y restaurar', async (t) => {
  const { window, document } = parseHTML(
    '<html><body><main id="page"></main><dialog id="modal"><h2 id="modalTitle"></h2><div id="modalBody"></div></dialog></body></html>',
  );
  globalThis.window = window;
  globalThis.document = document;
  globalThis.FormData = class {
    constructor(form) {
      this.data = [...form.querySelectorAll('[name]')].map((input) => [input.name, input.value]);
    }
    [Symbol.iterator]() {
      return this.data[Symbol.iterator]();
    }
  };
  const profiles = [
    {
      id: owner,
      nombres: 'Usuario de prueba',
      edad: 25,
      rol: 'usuario',
      correo: 'uno@example.invalid',
    },
    {
      id: administrator,
      nombres: 'Administración de prueba',
      edad: 30,
      rol: 'admin',
      correo: 'admin@example.invalid',
    },
  ];
  const ctx = {
    session: { user: { id: owner } },
    profile: profiles[0],
    revision: 1,
    view: 'sugerencias',
  };
  const threads = [],
    responses = [],
    notices = [];
  const now = () => new Date().toISOString();
  const api = {
    threads: async () =>
      threads
        .filter((row) => ctx.profile.rol === 'admin' || row.usuario_id === ctx.session.user.id)
        .map((row) => ({ ...row })),
    replies: async (id) =>
      responses.filter((row) => row.sugerencia_id === id).map((row) => ({ ...row })),
    createThread: async (actor, fields, user) => {
      const row = {
        id: randomUUID(),
        ...validateThread(fields),
        usuario_id: user,
        creado_por: actor,
        estado: 'abierta',
        eliminado: false,
        creado_en: now(),
        actualizado_en: now(),
      };
      threads.push(row);
      return { ...row };
    },
    updateThread: async (id, fields) => {
      const row = threads.find((item) => item.id === id);
      Object.assign(row, validateThread(fields), {
        moderado: ctx.session.user.id !== row.creado_por,
      });
      return { ...row };
    },
    archiveThread: async (id, eliminado) => {
      const row = threads.find((item) => item.id === id);
      row.eliminado = eliminado;
      return { ...row };
    },
    reply: async (actor, id, message) => {
      const row = {
        id: randomUUID(),
        ...validateReply(message),
        sugerencia_id: id,
        autor_id: actor,
        creado_en: now(),
        eliminado: false,
      };
      responses.push(row);
      return { ...row };
    },
    editReply: async (id, message) => {
      const row = responses.find((item) => item.id === id);
      Object.assign(row, validateReply(message), {
        moderado: ctx.session.user.id !== row.autor_id,
      });
      return { ...row };
    },
    archiveReply: async (id, eliminado) => {
      const row = responses.find((item) => item.id === id);
      row.eliminado = eliminado;
      return { ...row };
    },
    status: async (id, estado) => {
      const row = threads.find((item) => item.id === id);
      row.estado = estado;
      return { ...row };
    },
    editProfile: async (id, fields) => ({ ...profiles.find((row) => row.id === id), ...fields }),
  };
  const evaluations = [
    {
      id: 1,
      usuario_id: owner,
      creado_en: '2026-11-17T12:00:00Z',
      respuestas: Array(14).fill(3),
      total: 42,
      prom_general: 3,
      nivel: 'Moderado',
    },
    {
      id: 2,
      usuario_id: owner,
      creado_en: '2026-11-19T12:00:00Z',
      respuestas: Array(14).fill(2),
      total: 28,
      prom_general: 2,
      nivel: 'Moderado',
    },
  ];
  let controller, editedProfile;
  const render = () => {
    document.getElementById('page').innerHTML = controller.render();
  };
  const modal = document.getElementById('modal');
  const openModal = (title, html) => {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = html;
    modal.open = true;
  };
  const feedback = (id, text) => {
    const node = document.getElementById(id);
    if (node) {
      node.textContent = text;
      node.hidden = !text;
    }
  };
  controller = createManagementController({
    api,
    context: () => ctx,
    adminData: () => ({ profiles, evaluations }),
    ensureAdmin: async () => {},
    openModal,
    closeModal: () => {
      modal.open = false;
    },
    render,
    toast: (text) => notices.push(text),
    errorText: (error) => error.message,
    feedback,
    busy: async (button, action) => {
      button.disabled = true;
      try {
        await action();
      } finally {
        button.disabled = false;
      }
    },
    profileChanged: async (row) => {
      editedProfile = row;
    },
  });
  const settle = async () => {
    for (let i = 0; i < 4; i++) await new Promise((resolve) => setImmediate(resolve));
  };
  const click = async (selector) => {
    const node = document.querySelector(selector);
    assert.ok(node, selector);
    node.dispatchEvent(new window.Event('click', { bubbles: true }));
    await settle();
  };
  const submit = async (id) => {
    document.getElementById(id).dispatchEvent(new window.Event('submit', { bubbles: true }));
    await settle();
  };
  await controller.load();
  await t.test('El usuario envía una sugerencia privada y recibe confirmación', async () => {
    await click('[data-action="manage-new"]');
    document.getElementById('threadSubject').value = 'Mi sugerencia de prueba';
    document.getElementById('threadMessage').value =
      'Me gustaría tener un recordatorio de respiración.';
    await submit('managementThreadForm');
    assert.equal(threads.length, 1);
    assert.equal(threads[0].usuario_id, owner);
    assert.ok(document.getElementById('managementReplyForm'));
    assert.match(notices.at(-1), /guardado en Supabase/);
  });
  await t.test(
    'Puede responder, editar su respuesta y ver errores sin perder el formulario',
    async () => {
      document.getElementById('replyMessage').value = 'Esta es mi respuesta de prueba.';
      await submit('managementReplyForm');
      await click('[data-action="manage-edit-reply"]');
      document.getElementById('editReply').value = 'Esta es mi respuesta actualizada.';
      await submit('managementEditReplyForm');
      assert.equal(responses[0].mensaje, 'Esta es mi respuesta actualizada.');
      document.getElementById('replyMessage').value = 'abc';
      await submit('managementReplyForm');
      assert.match(document.getElementById('managementFeedback').textContent, /5 a 3000/);
      assert.equal(document.getElementById('replyMessage').value, 'abc');
      assert.equal(responses.length, 1);
    },
  );
  await t.test('Edita el mensaje, lo elimina de la bandeja y puede restaurarlo', async () => {
    await click('[data-action="manage-edit-thread"]');
    document.getElementById('threadMessage').value = 'La sugerencia del usuario está actualizada.';
    await submit('managementThreadForm');
    await click('[data-action="manage-archive-thread"]');
    await click('[data-action="manage-confirm-archive"]');
    assert.equal(threads[0].eliminado, true);
    await click('[data-action="manage-filter"][data-value="archivadas"]');
    await click('[data-action="manage-thread"]');
    await click('[data-action="manage-archive-thread"]');
    await click('[data-action="manage-confirm-archive"]');
    assert.equal(threads[0].eliminado, false);
  });
  await t.test(
    'Administración responde, modera y restaura comentarios manteniendo autoría',
    async () => {
      ctx.session = { user: { id: administrator } };
      ctx.profile = profiles[1];
      ctx.revision++;
      controller.reset();
      await controller.load();
      await click('[data-action="manage-thread"]');
      document.getElementById('replyMessage').value = 'Gracias por tu sugerencia. La revisaremos.';
      await submit('managementReplyForm');
      assert.equal(responses[1].autor_id, administrator);
      await click('[data-action="manage-edit-thread"]');
      document.getElementById('threadMessage').value =
        'Contenido moderado con identificación de administración.';
      await submit('managementThreadForm');
      assert.equal(threads[0].usuario_id, owner);
      assert.equal(threads[0].moderado, true);
      assert.match(document.getElementById('modalBody').textContent, /Editado por administración/);
      await click(`[data-action="manage-archive-reply"][data-id="${responses[0].id}"]`);
      await click('[data-action="manage-confirm-archive"]');
      assert.equal(responses[0].eliminado, true);
      await click(`[data-action="manage-archive-reply"][data-id="${responses[0].id}"]`);
      await click('[data-action="manage-confirm-archive"]');
      assert.equal(responses[0].eliminado, false);
      assert.equal(responses[0].autor_id, owner);
    },
  );
  await t.test(
    'El seguimiento administrativo ofrece gráfico, respuestas y edición de perfil',
    async () => {
      openModal('Seguimiento del usuario', adminUserDetail(profiles[0], evaluations));
      assert.ok(document.querySelector('.evolution-plot svg'));
      await click('[data-action="manage-evaluation"]');
      assert.equal(document.querySelectorAll('.evaluation-review li').length, 14);
      await click('[data-action="manage-user"]');
      await click('[data-action="manage-profile"]');
      document.getElementById('management-nombres').value = 'Perfil actualizado de prueba';
      await submit('managementProfileForm');
      assert.equal(editedProfile.nombres, 'Perfil actualizado de prueba');
    },
  );
  await t.test(
    'Una lectura que llega después de salir no devuelve conversaciones de la sesión anterior',
    async () => {
      let resume;
      api.threads = () =>
        new Promise((resolve) => {
          resume = resolve;
        });
      const pending = controller.load();
      ctx.session = null;
      ctx.revision++;
      controller.reset();
      document.getElementById('page').replaceChildren();
      resume([{ mensaje: 'Dato privado antiguo' }]);
      await pending;
      assert.equal(controller.items, null);
      assert.equal(document.getElementById('page').textContent, '');
    },
  );
});
