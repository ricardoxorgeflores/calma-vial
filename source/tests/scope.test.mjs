import test from 'node:test';
import assert from 'node:assert/strict';
import { VEHICLES, evaluationPayload } from '../js/domain/domain.js';
import { createGovernanceApi } from '../js/services/governance-api.js';

test('Las evaluaciones nuevas respetan las tres categorías del estudio', () => {
  assert.deepEqual(VEHICLES, ['Particular', 'Transporte público', 'Transporte comercial']);
  const data = { respuestas: Array(14).fill(3), momento: 'Antes de conducir', animo: 3 };
  for (const vehiculo of VEHICLES)
    assert.equal(evaluationPayload({ ...data, vehiculo }).vehiculo, vehiculo);
  for (const vehiculo of ['Motocicleta', 'Otro', 'Camión'])
    assert.throws(() => evaluationPayload({ ...data, vehiculo }), /vehículo/);
});

test('Un diagnóstico vacío o incoherente no se presenta como una comprobación válida', async () => {
  const good = {
    conexion: 'ok',
    comprobado_en: '2026-11-21T18:00:00Z',
    hashes_bcrypt: 2,
    cuentas_con_password: 2,
    tablas_rls: 7,
    usuarios_eliminados: 0,
    auditoria: [],
  };
  for (const data of [
    null,
    {},
    { ...good, conexion: 'error' },
    { ...good, tablas_rls: 8 },
    { ...good, hashes_bcrypt: 3 },
    { ...good, comprobado_en: 'inválida' },
  ]) {
    await assert.rejects(
      createGovernanceApi({ rpc: async () => ({ data }) }).diagnostics(),
      /diagnóstico incompleto/,
    );
  }
  assert.deepEqual(
    await createGovernanceApi({ rpc: async () => ({ data: good }) }).diagnostics(),
    good,
  );
});
