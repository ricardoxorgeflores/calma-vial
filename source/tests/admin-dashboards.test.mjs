import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import {
  adminPopulation,
  evaluationDashboard,
  participationDashboard,
} from '../js/features/admin-dashboards.js';
import { inboxView } from '../js/features/management-views.js';
const fixture = () => ({
  deletedUsers: [{ usuario_id: 'deleted' }],
  admin: {
    profiles: [
      { id: 'one', rol: 'usuario', nombres: 'Ana', correo: 'ana@example.invalid' },
      { id: 'two', rol: 'usuario', nombres: 'Luis' },
      { id: 'admin', rol: 'admin', nombres: 'Admin' },
      { id: 'deleted', rol: 'usuario', nombres: 'Baja' },
    ],
    evaluations: [
      { id: 1, usuario_id: 'one', total: 42, nivel: 'Moderado', vehiculo: 'Particular' },
      { id: 2, usuario_id: 'one', total: 65, nivel: 'Elevado', vehiculo: 'Transporte público' },
      { id: 3, usuario_id: 'deleted', total: 28, nivel: 'Bajo' },
      { id: 4, usuario_id: 'admin', total: 28, nivel: 'Bajo' },
    ],
  },
});
test('Las listas e indicadores excluyen las bajas y conservan las evaluaciones autorizadas', () => {
  const state = fixture();
  const population = adminPopulation(state);
  assert.equal(population.profiles.length, 3);
  assert.equal(population.evaluations.length, 3);
  const { document } = parseHTML(evaluationDashboard(state));
  assert.equal(document.querySelectorAll('tbody tr').length, 3);
  assert.equal(document.querySelector('[data-id="1"]').dataset.owner, 'one');
  assert.doesNotMatch(document.body?.textContent || document.toString(), /Baja<\/td>/);
});
test('Evaluaciones filtra por persona y nivel y ofrece un estado vacío', () => {
  const state = fixture();
  state.adminEvalSearch = 'ANA';
  state.adminLevel = 'Elevado';
  let html = evaluationDashboard(state);
  assert.match(html, /1 de 3 evaluaciones/);
  assert.match(html, /65 \/ 70/);
  assert.doesNotMatch(html, /42 \/ 70/);
  state.adminEvalSearch = 'inexistente';
  html = evaluationDashboard(state);
  assert.match(html, /No hay evaluaciones que coincidan/);
});
test('Participación separa usuarios de administradores y permite ver pendientes de participación', () => {
  const state = fixture();
  state.participationStatus = 'sin-evaluaciones';
  const { document } = parseHTML(participationDashboard(state));
  const rows = document.querySelectorAll('tbody tr');
  assert.equal(rows.length, 1);
  assert.match(rows[0].textContent, /Luis/);
  assert.doesNotMatch(rows[0].textContent, /Ana|Baja|Admin/);
  assert.match(document.toString(), /50%/);
});
test('Atención pendiente excluye resueltas y archivadas pero incluye las conversaciones en curso', () => {
  const base = {
    tipo: 'consulta',
    asunto: 'Consulta',
    mensaje: 'Mensaje de prueba',
    actualizado_en: '2026-11-21T18:00:00Z',
  };
  const html = inboxView(
    {
      filter: 'pendientes',
      items: [
        { ...base, id: 'a', estado: 'pendiente' },
        { ...base, id: 'b', estado: 'en_atencion' },
        { ...base, id: 'c', estado: 'resuelta' },
        { ...base, id: 'd', estado: 'pendiente', eliminado: true },
      ],
    },
    true,
  );
  const { document } = parseHTML(html);
  assert.equal(document.querySelectorAll('.conversation-card').length, 2);
  assert.match(document.querySelector('h1').textContent, /Atención pendiente/);
});
