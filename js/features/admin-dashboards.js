import { escapeHtml as e, displayName, displayDate } from '../ui/format.js?v=1c52f699db4b';

export const ADMIN_VIEWS = [
  'admin',
  'usuarios',
  'sistema',
  'evaluaciones-admin',
  'participacion',
  'pendientes',
];

// Todos los indicadores y las listas usan la misma población autorizada.
export function adminPopulation(state) {
  const deleted = new Set((state.deletedUsers || []).map((row) => row.usuario_id));
  const profiles = (state.admin?.profiles || []).filter((row) => !deleted.has(row.id));
  const ids = new Set(profiles.map((row) => row.id));
  const evaluations = (state.admin?.evaluations || []).filter((row) => ids.has(row.usuario_id));
  return { profiles, evaluations };
}

export function evaluationDashboard(state) {
  const { profiles, evaluations } = adminPopulation(state);
  const query = (state.adminEvalSearch || '').toLocaleLowerCase('es');
  const rows = evaluations.filter((row) => {
    const person = profiles.find((p) => p.id === row.usuario_id);
    return (
      (!state.adminLevel || row.nivel === state.adminLevel) &&
      [displayName(person || {}), person?.correo, row.vehiculo]
        .join(' ')
        .toLocaleLowerCase('es')
        .includes(query)
    );
  });
  return `<header class="page-heading"><div><span class="eyebrow">ADMINISTRACIÓN · EVALUACIONES</span><h1>Evaluaciones de la comunidad</h1><p class="subtle">Consulta cada evaluación y abre sus respuestas o la evolución de la persona.</p></div><a class="button ghost" href="#admin">Volver al panel</a></header>
  <section class="card"><div class="toolbar"><div><label for="adminEvalSearch">Buscar por persona, correo o vehículo</label><input id="adminEvalSearch" type="search" value="${e(state.adminEvalSearch || '')}" placeholder="Buscar evaluaciones" /></div><div><label for="adminLevel">Nivel orientativo</label><select id="adminLevel"><option value="">Todos los niveles</option>${['Bajo', 'Moderado', 'Elevado'].map((v) => `<option ${state.adminLevel === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div><p role="status">${rows.length} de ${evaluations.length} evaluaciones</p>
  <div class="table-wrap"><table class="data-table"><thead><tr><th>Persona</th><th>Fecha</th><th>Vehículo</th><th>Total</th><th>Nivel</th><th>Acciones</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${e(displayName(profiles.find((p) => p.id === row.usuario_id) || {}))}</td><td>${e(displayDate(row.creado_en))}</td><td>${e(row.vehiculo)}</td><td>${e(row.total)} / 70</td><td>${e(row.nivel)}</td><td><div class="user-actions"><button class="text-button" data-action="manage-evaluation" data-id="${e(row.id)}" data-owner="${e(row.usuario_id)}">Ver respuestas</button><button class="text-button" data-action="manage-user" data-id="${e(row.usuario_id)}">Ver evolución</button></div></td></tr>`).join('') || '<tr><td colspan="6">No hay evaluaciones que coincidan con los filtros.</td></tr>'}</tbody></table></div><p class="mini-note">Los niveles describen las respuestas y no constituyen un diagnóstico.</p></section>`;
}

export function participationDashboard(state) {
  const { profiles, evaluations } = adminPopulation(state);
  const users = profiles.filter((p) => p.rol === 'usuario');
  const counts = new Map();
  evaluations.forEach((row) => counts.set(row.usuario_id, (counts.get(row.usuario_id) || 0) + 1));
  const participants = users.filter((p) => counts.has(p.id)).length;
  const filter = state.participationStatus || 'todas';
  const rows = users.filter(
    (p) =>
      filter === 'todas' || (filter === 'con-evaluaciones' ? counts.has(p.id) : !counts.has(p.id)),
  );
  return `<header class="page-heading"><div><span class="eyebrow">ADMINISTRACIÓN · PARTICIPACIÓN</span><h1>Participación de usuarios</h1><p class="subtle">Identifica quién ha completado evaluaciones y quién aún no ha participado. Se excluyen administradores y cuentas eliminadas.</p></div><a class="button ghost" href="#admin">Volver al panel</a></header><div class="platform-metrics"><article class="metric-card"><span>Usuarios</span><strong>${users.length}</strong><small>En el directorio</small></article><article class="metric-card"><span>Con evaluaciones</span><strong>${participants}</strong><small>Al menos una guardada</small></article><article class="metric-card"><span>Sin evaluaciones</span><strong>${users.length - participants}</strong><small>Participación por iniciar</small></article><article class="metric-card"><span>Participación</span><strong>${users.length ? Math.round((100 * participants) / users.length) : 0}%</strong><small>Usuarios con evaluaciones</small></article></div>
  <section class="card"><label for="participationStatus">Mostrar usuarios</label><select id="participationStatus">${[
    ['todas', 'Todos'],
    ['con-evaluaciones', 'Con evaluaciones'],
    ['sin-evaluaciones', 'Sin evaluaciones'],
  ]
    .map(([v, label]) => `<option value="${v}" ${filter === v ? 'selected' : ''}>${label}</option>`)
    .join(
      '',
    )}</select><p role="status">${rows.length} usuarios en esta vista</p><div class="table-wrap"><table class="data-table"><thead><tr><th>Persona</th><th>Participación</th><th>Evaluaciones</th><th>Acción</th></tr></thead><tbody>${rows.map((p) => `<tr><td>${e(displayName(p))}</td><td>${counts.has(p.id) ? 'Con evaluaciones' : 'Sin evaluaciones'}</td><td>${counts.get(p.id) || 0}</td><td><button class="text-button" data-action="manage-user" data-id="${e(p.id)}">Ver evolución</button></td></tr>`).join('') || '<tr><td colspan="4">No hay usuarios en este grupo.</td></tr>'}</tbody></table></div></section>`;
}
