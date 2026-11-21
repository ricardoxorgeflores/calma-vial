import test from 'node:test';
import assert from 'node:assert/strict';
const calls = [];
let result = { data: [], error: null };
class Query {
  constructor(table) {
    calls.push(['from', table]);
  }
  select(...args) {
    calls.push(['select', ...args]);
    return this;
  }
  eq(...args) {
    calls.push(['eq', ...args]);
    return this;
  }
  order(...args) {
    calls.push(['order', ...args]);
    return this;
  }
  limit(...args) {
    calls.push(['limit', ...args]);
    return this;
  }
  range(...args) {
    calls.push(['range', ...args]);
    this.page = args;
    return this;
  }
  insert(...args) {
    calls.push(['insert', ...args]);
    return this;
  }
  update(...args) {
    calls.push(['update', ...args]);
    return this;
  }
  delete() {
    calls.push(['delete']);
    return this;
  }
  single() {
    return Promise.resolve(result);
  }
  maybeSingle() {
    return Promise.resolve(result);
  }
  then(resolve, reject) {
    const data =
      this.page && Array.isArray(result.data)
        ? { ...result, data: result.data.slice(this.page[0], this.page[1] + 1) }
        : result;
    return Promise.resolve(data).then(resolve, reject);
  }
}
globalThis.window = {
  supabase: {
    createClient: () => ({
      storage: {
        from(bucket) {
          calls.push(['bucket', bucket]);
          return {
            list: async (...args) => {
              calls.push(['list', ...args]);
              return { data: [{ name: 'profile.jpg' }], error: null };
            },
            createSignedUrl: async (...args) => {
              calls.push(['signed', ...args]);
              return { data: { signedUrl: 'https://test.invalid/signed' }, error: null };
            },
            upload: async (...args) => {
              calls.push(['upload', ...args]);
              return { data: { path: args[0] }, error: null };
            },
            remove: async (...args) => {
              calls.push(['remove', ...args]);
              return { data: [], error: null };
            },
          };
        },
      },
      from: (table) => new Query(table),
      rpc: (name, args) => {
        calls.push(['rpc', name, args]);
        return {
          single: () => Promise.resolve(result),
          then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
        };
      },
    }),
  },
};
const { api, unwrap, fetchWithDeadline, authLock } = await import('../js/services/api.js');

test('Las fotos usan el bucket privado, la carpeta propia y una URL temporal', async () => {
  calls.length = 0;
  const blob = new Blob(['jpeg'], { type: 'image/jpeg' });
  await api.saveAvatar('owner', blob);
  assert.equal(calls.find((call) => call[0] === 'bucket')[1], 'calmavial-avatars');
  assert.equal(calls.find((call) => call[0] === 'upload')[1], 'owner/profile.jpg');
  assert.equal(calls.find((call) => call[0] === 'upload')[3].upsert, true);
  await api.avatar('owner');
  assert.deepEqual(
    calls.find((call) => call[0] === 'signed'),
    ['signed', 'owner/profile.jpg', 3600],
  );
  await api.removeAvatar('owner');
  assert.deepEqual(calls.find((call) => call[0] === 'remove')[1], ['owner/profile.jpg']);
  await assert.rejects(
    api.saveAvatar('owner', new Blob(['svg'], { type: 'image/svg+xml' })),
    /no es válida/,
  );
});

test('La papelera valida tipo e identificador y exige confirmación del servidor', async () => {
  calls.length = 0;
  await assert.rejects(api.archive('perfiles', '1'), /Registro no válido/);
  await assert.rejects(api.archive('evaluaciones', '1 OR 1=1'), /Registro no válido/);
  assert.equal(calls.length, 0);
  result = { data: true, error: null };
  await api.archive('evaluaciones', '12');
  assert.deepEqual(
    calls.find((call) => call[0] === 'rpc'),
    ['rpc', 'calmavial_archivar', { p_tipo: 'evaluaciones', p_id: '12' }],
  );
  result = { data: false, error: null };
  await assert.rejects(api.archive('diario', '2', true), /no confirmó/);
  result = { data: [], error: null };
});

test('El informe no acepta datos de otra cuenta ni transforma un rechazo en éxito', async () => {
  result = { data: null, error: { message: 'No tienes acceso a este informe.', code: '42501' } };
  await assert.rejects(
    api.report('owner'),
    (error) => error.code === '42501' && /No tienes acceso/.test(error.message),
  );
  result = { data: { version: 1, usuario_id: 'otra' }, error: null };
  await assert.rejects(api.report('owner'), /esta cuenta/);
  result = { data: [], error: null };
});

test('Publicar un aviso envía campos permitidos y el servidor decide los permisos', async () => {
  calls.length = 0;
  result = { data: { id: 'aviso' }, error: null };
  await api.saveNotice('admin', {
    titulo: 'Aviso válido',
    mensaje: 'Un mensaje informativo válido.',
    creado_por: 'otro',
    activo: false,
  });
  assert.deepEqual(calls.find((call) => call[0] === 'insert')[1], {
    titulo: 'Aviso válido',
    mensaje: 'Un mensaje informativo válido.',
    creado_por: 'admin',
  });
  await assert.rejects(api.setNoticeActive('aviso', 'false'), /no válido/);
  result = { data: [], error: null };
});

test('La autenticación deja de esperar un bloqueo ajeno sin ejecutar ni forzar la sesión', async () => {
  let ran = false;
  const manager = {
    request: (_name, options) => {
      assert.equal(options.mode, 'exclusive');
      assert.equal(options.steal, undefined);
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), {
          once: true,
        });
      });
    },
  };
  await assert.rejects(
    authLock(
      'auth-test',
      -1,
      () => {
        ran = true;
      },
      manager,
      20,
    ),
    /Cierra las otras pestañas/,
  );
  assert.equal(ran, false);
});

test('El plazo de adquirir sesión no interrumpe una operación que ya obtuvo el bloqueo', async () => {
  let signal;
  const manager = {
    request: (name, options, action) => {
      signal = options.signal;
      return action({ name });
    },
  };
  const result = await authLock(
    'auth-test',
    -1,
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return 'session-ok';
    },
    manager,
    5,
  );
  assert.equal(result, 'session-ok');
  assert.equal(signal.aborted, false);
});

test('La renovación inmediata rechaza un bloqueo ocupado sin ejecutar la operación', async () => {
  let ran = false;
  const manager = {
    request: (_name, options, action) => {
      assert.equal(options.ifAvailable, true);
      return action(null);
    },
  };
  await assert.rejects(
    authLock(
      'auth-test',
      0,
      () => {
        ran = true;
      },
      manager,
    ),
    (error) => error.isAcquireTimeout === true,
  );
  assert.equal(ran, false);
});

test('Una conexión atascada se cancela sin repetir escrituras automáticamente', async () => {
  let attempts = 0;
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(
      fetchWithDeadline('https://example.invalid', { method: 'POST' }, 20, (_url, options) => {
        attempts++;
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(options.signal.reason), {
            once: true,
          });
        });
      }),
      { name: 'TimeoutError' },
    );
    assert.equal(attempts, 1);
  } finally {
    clearTimeout(keepAlive);
  }
});

test('El plazo cancela también un cuerpo de respuesta que deja de llegar', async () => {
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    const response = await fetchWithDeadline('https://example.invalid', {}, 20, (_url, options) =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              options.signal.addEventListener('abort', () =>
                controller.error(options.signal.reason),
              );
            },
          }),
        ),
      ),
    );
    await assert.rejects(response.text(), { name: 'TimeoutError' });
  } finally {
    clearTimeout(keepAlive);
  }
});

test('El transporte conserva la cancelación solicitada por quien llama', async () => {
  const controller = new AbortController();
  const request = fetchWithDeadline(
    'https://example.invalid',
    { signal: controller.signal },
    1000,
    (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), {
          once: true,
        });
      }),
  );
  controller.abort();
  await assert.rejects(request, { name: 'AbortError' });
});
test('Las lecturas personales incluyen el propietario autenticado', async () => {
  for (const method of ['evaluations', 'diary']) {
    calls.length = 0;
    await api[method]('user-one');
    assert.ok(calls.some((c) => c[0] === 'eq' && c[1] === 'usuario_id' && c[2] === 'user-one'));
  }
});

test('Los listados recuperan páginas adicionales sin truncar a 500 registros', async () => {
  result = {
    data: Array.from({ length: 503 }, (_, id) => ({ id, usuario_id: 'user-one' })),
    error: null,
  };
  calls.length = 0;
  assert.equal((await api.evaluations('user-one')).length, 503);
  assert.equal(calls.filter((c) => c[0] === 'range').length, 2);
  result = { data: [], error: null };
});

test('El diario interpreta etiquetas de Android y envía nombres compatibles', async () => {
  result = { data: [{ id: 1, factor: 'Conducción temeraria' }], error: null };
  assert.equal((await api.diary('user-one'))[0].factor, 'TEMERARIA');
  calls.length = 0;
  await api.saveDiary('user-one', {
    situacion: 'Tráfico',
    factor: 'HOSTILIDAD',
    intensidad: 3,
    usuario_id: 'otro',
    rol: 'admin',
  });
  const saved = calls.find((c) => c[0] === 'insert')[1];
  assert.equal(saved.factor, 'Hostilidad directa');
  assert.equal(saved.usuario_id, 'user-one');
  assert.equal(saved.rol, undefined);
  result = { data: [], error: null };
});
test('La actualización de perfil no incluye rol ni correo', async () => {
  calls.length = 0;
  result = { data: { id: 'user-one' }, error: null };
  await api.saveProfile(
    { id: 'user-one', email: 'test@example.com' },
    {
      nombres: 'Test',
      edad: 25,
      rol: 'admin',
      correo: 'different@example.com',
      id: 'someone-else',
    },
    true,
  );
  assert.deepEqual(calls.find((c) => c[0] === 'update')[1], { nombres: 'Test', edad: 25 });
  assert.ok(calls.some((c) => c[0] === 'eq' && c[1] === 'id' && c[2] === 'user-one'));
});
test('Una evaluación usa el RPC idempotente sin aceptar propietario ni puntajes manipulados', async () => {
  calls.length = 0;
  await api.saveEvaluation(
    'user-one',
    {
      respuestas: Array(14).fill(1),
      total: 70,
      nivel: 'Elevado',
      usuario_id: 'intruso',
      momento: 'Antes de conducir',
      vehiculo: 'Particular',
      animo: '1',
    },
    '00000000-0000-4000-8000-000000000001',
  );
  const call = calls.find((c) => c[0] === 'rpc');
  assert.equal(call[1], 'guardar_evaluacion');
  assert.deepEqual(call[2], {
    p_request_id: '00000000-0000-4000-8000-000000000001',
    p_respuestas: Array(14).fill(1),
    p_momento: 'Antes de conducir',
    p_vehiculo: 'Particular',
    p_animo: 1,
  });
});

test('Un ánimo textual no llega al servidor y los borrados filtran propietario', async () => {
  await assert.rejects(
    api.saveEvaluation('user-one', {
      respuestas: Array(14).fill(3),
      momento: 'Antes de conducir',
      vehiculo: 'Particular',
      animo: 'Tranquilo/a',
    }),
    /Selecciona cómo/,
  );
  calls.length = 0;
  result = { data: [{ id: 'evaluation-one' }], error: null };
  await api.deleteEvaluation('user-one', 'evaluation-one');
  assert.ok(calls.some((c) => c[0] === 'eq' && c[1] === 'usuario_id' && c[2] === 'user-one'));
  assert.ok(calls.some((c) => c[0] === 'eq' && c[1] === 'id' && c[2] === 'evaluation-one'));
});
test('Editar y eliminar diario limita registro y propietario', async () => {
  calls.length = 0;
  await api.saveDiary(
    'user-one',
    { situacion: 'Tráfico', factor: 'AVANCE', intensidad: '3' },
    'entry-one',
  );
  assert.ok(calls.some((c) => c[0] === 'eq' && c[1] === 'id' && c[2] === 'entry-one'));
  assert.ok(calls.some((c) => c[0] === 'eq' && c[1] === 'usuario_id' && c[2] === 'user-one'));
  calls.length = 0;
  result = { data: [{ id: 'entry-one' }], error: null };
  await api.deleteDiary('user-one', 'entry-one');
  assert.ok(calls.some((c) => c[0] === 'eq' && c[1] === 'usuario_id' && c[2] === 'user-one'));
});
test('Los errores del servidor y borrados rechazados no se presentan como éxito', async () => {
  assert.throws(() => unwrap({ data: null, error: new Error('No autorizado') }), /No autorizado/);
  result = { data: [], error: null };
  await assert.rejects(api.deleteDiary('user-one', 'entry-one'), /No se pudo eliminar/);
});
