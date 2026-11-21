import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculate,
  QUESTIONS,
  validateDiary,
  validateProfile,
  csv,
  evaluationPayload,
  adminSummary,
  recommendations,
  roleLabel,
  appRedirectUrl,
  validateEmail,
  validatePassword,
} from '../js/domain/domain.js';

test('Correos inválidos y contraseñas nuevas débiles se rechazan antes del envío', () => {
  assert.equal(validateEmail(' ANA@EXAMPLE.COM '), 'ana@example.com');
  for (const email of ['', 'ana', 'ana@', 'ana@@example.com', 'a b@example.com', 'a@localhost'])
    assert.throws(() => validateEmail(email));
  assert.throws(() => validatePassword('corta', 'corta'));
  assert.throws(() => validatePassword('clave-larga', 'otra-clave'));
  for (const weak of ['clave-larga', 'ClaveLarga9', 'CLAVE-LARGA9!', 'Clave-Larga!'])
    assert.throws(() => validatePassword(weak, weak));
  assert.doesNotThrow(() => validatePassword('Clave-Larga9!', 'Clave-Larga9!'));
});

test('Evaluaciones con huecos o ánimo booleano no se aceptan', () => {
  assert.throws(() => calculate(new Array(14)));
  const answers = Array(14).fill(3);
  delete answers[4];
  assert.throws(() => calculate(answers));
  assert.throws(() =>
    evaluationPayload({
      respuestas: Array(14).fill(3),
      momento: 'Antes de conducir',
      vehiculo: 'Particular',
      animo: true,
    }),
  );
});

test('El perfil rechaza nombres vacíos de letras y teléfonos sin dígitos', () => {
  for (const patch of [
    { nombres: '1234' },
    { nombres: '<script>Ana</script>' },
    { telefono: '--- ---' },
    { edad: true },
    { edad: '1.8e1' },
  ])
    assert.throws(() => validateProfile({ nombres: 'Ana María', edad: 25, ...patch }));
  assert.doesNotThrow(() =>
    validateProfile({ nombres: 'María-José', edad: '25', telefono: '+591 71234567' }),
  );
});

test('El diario rechaza intensidades booleanas, vacías, decimales y factores desconocidos', () => {
  for (const patch of [
    { intensidad: true },
    { intensidad: '' },
    { intensidad: '2.5' },
    { factor: 'DESCONOCIDO' },
    { nota: 'x'.repeat(2001) },
  ])
    assert.throws(() =>
      validateDiary({ situacion: 'Tráfico', factor: 'AVANCE', intensidad: 3, ...patch }),
    );
});

test('Confirmación y recuperación conservan el subdirectorio de GitHub Pages', () => {
  assert.equal(
    appRedirectUrl({ origin: 'https://ricardoxorgeflores.github.io', pathname: '/calma-vial/' }),
    'https://ricardoxorgeflores.github.io/calma-vial/',
  );
  assert.equal(
    appRedirectUrl({ origin: 'https://example.com', pathname: '/calma-vial/index.html' }),
    'https://example.com/calma-vial/',
  );
  assert.equal(
    appRedirectUrl({ origin: 'http://localhost:4174', pathname: '/' }),
    'http://localhost:4174/',
  );
  assert.equal(
    appRedirectUrl({ origin: 'https://example.com', pathname: '/calma-vial' }),
    'https://example.com/calma-vial/',
  );
});
test('Los extremos DAS conservan el rango y el nivel de Android', () => {
  assert.deepEqual(calculate(Array(14).fill(1)), {
    respuestas: Array(14).fill(1),
    total: 14,
    prom_general: 1,
    prom_avance: 1,
    prom_temeraria: 1,
    prom_hostilidad: 1,
    nivel: 'Bajo',
  });
  const high = calculate(Array(14).fill(5));
  assert.equal(high.total, 70);
  assert.equal(high.nivel, 'Elevado');
});
test('Los grupos coinciden con Das.kt y no se mezclan sus medias', () => {
  assert.equal(QUESTIONS.filter((q) => q[1] === 'AVANCE').length, 7);
  assert.equal(QUESTIONS.filter((q) => q[1] === 'TEMERARIA').length, 5);
  assert.equal(QUESTIONS.filter((q) => q[1] === 'HOSTILIDAD').length, 2);
  const r = calculate(QUESTIONS.map((q) => (q[1] === 'AVANCE' ? 1 : q[1] === 'TEMERARIA' ? 3 : 5)));
  assert.equal(r.prom_avance, 1);
  assert.equal(r.prom_temeraria, 3);
  assert.equal(r.prom_hostilidad, 5);
  assert.equal(r.total, 32);
  assert.equal(r.nivel, 'Bajo');
});
test('Los límites de presentación coinciden con el APK', () => {
  const scores = (total) =>
    Array.from({ length: 14 }, (_, i) => 1 + Math.min(4, Math.max(0, total - 14 - i * 4)));
  assert.equal(calculate(scores(32)).nivel, 'Bajo');
  assert.equal(calculate(scores(33)).nivel, 'Moderado');
  assert.equal(calculate(scores(51)).nivel, 'Moderado');
  assert.equal(calculate(scores(52)).nivel, 'Elevado');
});
test('No se permite guardar una evaluación incompleta o inválida', () => {
  for (const a of [
    [],
    Array(13).fill(3),
    Array(14).fill(null),
    Array(14).fill(6),
    Array(14).fill(1.5),
    Array(14).fill('3'),
  ])
    assert.throws(() => calculate(a));
});
test('Diario y edad respetan las restricciones compartidas', () => {
  assert.throws(() => validateProfile({ nombres: 'Ana', edad: 17 }));
  assert.throws(() => validateProfile({ nombres: 'Ana', edad: 100 }));
  assert.doesNotThrow(() => validateProfile({ nombres: 'Ana', edad: '18' }));
  assert.throws(() => validateDiary({ situacion: ' ', factor: 'AVANCE', intensidad: 1 }));
  assert.throws(() => validateDiary({ situacion: 'Tráfico', factor: 'OTRO', intensidad: 1 }));
  assert.throws(() => validateDiary({ situacion: 'Tráfico', factor: 'AVANCE', intensidad: 0 }));
  assert.doesNotThrow(() =>
    validateDiary({ situacion: 'Tráfico', factor: 'AVANCE', intensidad: '5' }),
  );
});
test('CSV escapa comillas, saltos y fórmulas al exportar', () => {
  const output = csv([
    ['Nombre', 'Nota'],
    ['Ana', 'Una "pausa"'],
    ['=1+1', 'línea\nnueva'],
  ]);
  assert.ok(output.includes('"Una ""pausa"""'));
  assert.ok(output.includes('"\'=1+1"'));
  assert.ok(output.includes('"línea\nnueva"'));
});

test('El contrato compartido recalcula puntajes y convierte el ánimo a entero', () => {
  const base = {
    respuestas: Array(14).fill(3),
    momento: 'Antes de conducir',
    vehiculo: 'Particular',
    animo: '2',
    total: 70,
    nivel: 'Elevado',
    rol: 'admin',
  };
  const saved = evaluationPayload(base);
  assert.equal(saved.total, 42);
  assert.equal(saved.nivel, 'Moderado');
  assert.equal(saved.animo, 2);
  assert.equal(saved.rol, undefined);
  for (const patch of [
    { animo: 'Bien' },
    { animo: 0 },
    { animo: 1.2 },
    { momento: 'Durante la conducción' },
    { vehiculo: '' },
  ])
    assert.throws(() => evaluationPayload({ ...base, ...patch }));
});

test('Los indicadores administrativos y recomendaciones contemplan cuentas sin datos', () => {
  assert.equal(adminSummary([]).mean, 0);
  const summary = adminSummary([
    {
      usuario_id: 'one',
      nivel: 'Bajo',
      prom_general: 1,
      prom_avance: 1,
      prom_temeraria: 1,
      prom_hostilidad: 1,
    },
    {
      usuario_id: 'one',
      nivel: 'Elevado',
      prom_general: 5,
      prom_avance: 5,
      prom_temeraria: 5,
      prom_hostilidad: 5,
    },
  ]);
  assert.equal(summary.active, 1);
  assert.equal(summary.count, 2);
  assert.equal(summary.mean, 3);
  assert.deepEqual(summary.levels, { Bajo: 1, Moderado: 0, Elevado: 1 });
  assert.equal(
    recommendations({ prom_avance: 1, prom_temeraria: 2, prom_hostilidad: 5 }).factor,
    'HOSTILIDAD',
  );
  assert.equal(roleLabel('usuario'), 'Usuario');
  assert.equal(roleLabel('admin'), 'Administrador');
});

test('Los campos opcionales y límites evitan almacenar textos excesivos', () => {
  assert.doesNotThrow(() =>
    validateProfile({ nombres: 'Ana', edad: 25, documento: '', telefono: '' }),
  );
  assert.throws(() => validateProfile({ nombres: 'Ana', edad: 25, telefono: 'no es un teléfono' }));
  assert.throws(() =>
    validateDiary({ situacion: 'a'.repeat(2001), factor: 'AVANCE', intensidad: 3 }),
  );
});
