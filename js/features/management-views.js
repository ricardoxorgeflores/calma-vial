import { escapeHtml as e, displayDate as date, displayName } from '../ui/format.js?v=d01259cf245b';
import { icon } from '../ui/icons.js?v=d01259cf245b';
import { THREAD_STATES, THREAD_TYPES } from '../domain/management.js?v=d01259cf245b';
import { QUESTIONS, LABELS } from '../domain/domain.js?v=d01259cf245b';
import { evolutionChart } from './evolution.js?v=d01259cf245b';

export function inboxView(model, admin) {
  const rows = (model.items || []).filter((row) =>
    model.filter === 'archivadas'
      ? row.eliminado
      : !row.eliminado &&
        (model.filter === 'todas' ||
          (model.filter === 'pendientes'
            ? row.estado !== 'resuelta'
            : row.estado === model.filter)),
  );
  return `<div class="page-heading"><div><span class="eyebrow">${admin ? 'GESTIÓN · COMUNICACIÓN' : 'MI ESPACIO · COMUNICACIÓN'}</span><h1>${admin ? (model.filter === 'pendientes' ? 'Atención pendiente' : 'Bandeja de atención') : 'Mis sugerencias y consultas'}</h1><p class="subtle">${admin ? 'Responde, orienta y da seguimiento a las conversaciones de la comunidad.' : 'Comunícate de forma privada con la administración de Calma Vial.'}</p></div><button class="button" data-action="manage-new">${icon('chat')} ${admin ? 'Nuevo seguimiento' : 'Enviar sugerencia'}</button></div>
    <div class="inbox-toolbar"><div class="inbox-filters" role="group" aria-label="Filtrar conversaciones">${[['todas', 'Todas'], ['pendientes', 'Por atender'], ...Object.entries(THREAD_STATES), ['archivadas', 'Archivadas']].map(([key, label]) => `<button class="filter-pill" data-action="manage-filter" data-value="${key}" aria-pressed="${model.filter === key}">${label}</button>`).join('')}</div><button class="button ghost" data-action="manage-refresh">Actualizar</button></div>
    ${model.error ? `<div class="feedback" role="alert">${e(model.error)}<p>Vuelve a cargar la bandeja. Tus mensajes no se guardan solo en este navegador.</p></div>` : ''}
    ${model.loading ? '<div class="loading-state"><div class="spinner"></div>Cargando conversaciones autorizadas…</div>' : rows.length ? `<div class="conversation-list">${rows.map((row) => `<article class="conversation-card"><div class="conversation-mark">${icon('chat')}</div><div class="conversation-content"><div class="conversation-meta"><span>${e(THREAD_TYPES[row.tipo])}</span><time>${e(date(row.actualizado_en))}</time><span class="status-pill status-${e(row.estado)}">${e(THREAD_STATES[row.estado])}</span></div><h2>${e(row.asunto)}</h2><p>${e(row.mensaje.slice(0, 180))}${row.mensaje.length > 180 ? '…' : ''}</p>${row.moderado ? '<small>Contenido moderado por administración.</small>' : ''}${row.eliminado ? '<small>Conversación archivada; puede restaurarse.</small>' : ''}</div><button class="button ghost" data-action="manage-thread" data-id="${e(row.id)}">Abrir ${icon('arrow')}</button></article>`).join('')}</div>` : `<section class="card empty-conversations">${icon('chat')}<h2>${model.filter === 'archivadas' ? 'No hay conversaciones archivadas' : 'Tu bandeja está al día'}</h2><p class="subtle">${admin ? 'Aquí aparecerán las sugerencias y consultas enviadas por los usuarios.' : 'Puedes escribir una sugerencia, hacer una consulta o revisar las respuestas de administración.'}</p></section>`}`;
}
export function threadForm(row = {}, profiles = [], target = null, evaluation = null) {
  return `<form id="managementThreadForm" data-id="${e(row.id || '')}" data-owner="${e(target || '')}" data-evaluation="${e(evaluation || '')}">
    ${!row.id && profiles.length ? `<label for="threadOwner">Dirigido a</label><select id="threadOwner" name="owner" required>${profiles.map((profile) => `<option value="${e(profile.id)}" ${target === profile.id ? 'selected' : ''}>${e(displayName(profile))}</option>`).join('')}</select>` : ''}
    ${
      row.id
        ? ''
        : `<label for="threadType">Tipo de mensaje</label><select id="threadType" name="tipo">${Object.entries(
            THREAD_TYPES,
          )
            .map(
              ([key, label]) =>
                `<option value="${key}" ${evaluation && key === 'seguimiento' ? 'selected' : ''}>${label}</option>`,
            )
            .join('')}</select>`
    }
    ${evaluation ? '<p class="notice">Este seguimiento estará vinculado a la evaluación seleccionada.</p>' : ''}
    <label for="threadSubject">Asunto</label><input id="threadSubject" name="asunto" value="${e(row.asunto || '')}" required minlength="5" maxlength="120" placeholder="¿En qué podemos ayudarte?" />
    <label for="threadMessage">Mensaje</label><textarea id="threadMessage" name="mensaje" required minlength="10" maxlength="3000" placeholder="Describe tu sugerencia o consulta con claridad.">${e(row.mensaje || '')}</textarea>
    <p class="mini-note">La administración puede leer, responder y moderar esta conversación. No es un servicio de urgencias ni una consulta médica.</p>
    <div id="managementFeedback" class="feedback" role="alert" hidden></div><button class="button" type="submit">${row.id ? 'Guardar cambios' : 'Enviar mensaje'}</button></form>`;
}
export function threadDetail(row, replies, viewer, admin, profiles = []) {
  const name = (id) => {
    if (id === viewer.id) return 'Tú';
    const profile = profiles.find((person) => person.id === id);
    return profile ? displayName(profile) : id === row.usuario_id ? 'Usuario' : 'Administración';
  };
  const canEdit = row.creado_por === viewer.id || row.usuario_id === viewer.id || admin;
  return `<div class="thread-heading"><span class="status-pill status-${e(row.estado)}">${e(THREAD_STATES[row.estado])}</span><span>${e(date(row.creado_en))}</span></div>
    <h3>${e(row.asunto)}</h3><p class="mini-note">${row.creado_por === row.usuario_id ? 'Mensaje del usuario' : 'Orientación de administración'}</p><p class="message-body">${e(row.mensaje)}</p>${row.moderado ? '<p class="moderation-note">Editado por administración. La versión anterior permanece en la auditoría.</p>' : ''}
    <div class="form-actions">${canEdit ? `<button class="button ghost compact" data-action="manage-edit-thread" data-id="${e(row.id)}">${icon('edit')} Editar</button><button class="button ghost compact" data-action="manage-archive-thread" data-id="${e(row.id)}">${icon('archive')} ${row.eliminado ? 'Restaurar' : 'Eliminar de la bandeja'}</button>` : ''}
    ${
      admin
        ? `<label class="inline-status" for="threadStatus">Estado<select id="threadStatus" data-thread-status="${e(row.id)}">${Object.entries(
            THREAD_STATES,
          )
            .map(
              ([key, label]) =>
                `<option value="${key}" ${row.estado === key ? 'selected' : ''}>${label}</option>`,
            )
            .join('')}</select></label>`
        : ''
    }</div>
    ${row.evaluacion_id ? `<p class="mini-note">Evaluación vinculada: #${e(row.evaluacion_id)}</p>` : ''}
    <div class="thread-replies"><h3>Conversación</h3>${
      replies
        .filter((reply) => !reply.eliminado || admin)
        .map(
          (reply) =>
            `<article class="message-card ${reply.autor_id === viewer.id ? 'is-mine' : ''} ${reply.eliminado ? 'is-archived' : ''}"><header><strong>${e(name(reply.autor_id))}</strong><time>${e(date(reply.creado_en))}</time></header><p class="message-body">${reply.eliminado ? 'Respuesta archivada.' : e(reply.mensaje)}</p>${reply.moderado ? '<small>Editado por administración · con auditoría.</small>' : ''}${reply.autor_id === viewer.id || admin ? `<div class="message-actions">${!reply.eliminado ? `<button class="text-button" data-action="manage-edit-reply" data-id="${e(reply.id)}">${icon('edit')} Editar</button>` : ''}<button class="text-button" data-action="manage-archive-reply" data-id="${e(reply.id)}">${reply.eliminado ? 'Restaurar' : 'Eliminar'}</button></div>` : ''}</article>`,
        )
        .join('') || '<p class="subtle">Todavía no hay respuestas.</p>'
    }</div>
    ${!row.eliminado ? `<form id="managementReplyForm" data-thread="${e(row.id)}"><label for="replyMessage">${admin ? 'Responder al usuario' : 'Añadir una respuesta'}</label><textarea id="replyMessage" name="mensaje" required minlength="5" maxlength="3000" placeholder="Escribe una respuesta clara y respetuosa."></textarea><div id="managementFeedback" class="feedback" role="alert" hidden></div><button class="button" type="submit">Enviar respuesta ${icon('arrow')}</button></form>` : '<div id="managementFeedback" class="feedback" hidden role="alert"></div><p class="notice">Restaura la conversación para añadir respuestas.</p>'}`;
}
export function adminUserDetail(profile, evaluations) {
  return `<div class="admin-user-heading"><div class="avatar">${e(displayName(profile).slice(0, 2).toUpperCase())}</div><div><h3>${e(displayName(profile))}</h3><p>${e(profile.correo)}</p></div></div><div class="form-actions"><button class="button" data-action="manage-profile" data-id="${e(profile.id)}">${icon('edit')} Editar datos</button><button class="button secondary" data-action="manage-followup" data-id="${e(profile.id)}">${icon('chat')} Enviar orientación</button><button class="button ghost" data-action="admin-report" data-id="${e(profile.id)}" ${evaluations.length < 3 ? 'disabled' : ''}>Informe PDF</button></div>
    ${evolutionChart(evaluations, 'Evolución de este usuario')}
    <h3>Evaluaciones registradas (${evaluations.length})</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Fecha</th><th>Total</th><th>Nivel</th><th>Revisar</th></tr></thead><tbody>${evaluations.map((row) => `<tr><td>${e(date(row.creado_en))}</td><td>${e(row.total)} / 70</td><td>${e(row.nivel)}</td><td><button class="text-button" data-action="manage-evaluation" data-id="${e(row.id)}" data-owner="${e(profile.id)}">Ver respuestas</button></td></tr>`).join('') || '<tr><td colspan="4">Todavía no hay evaluaciones.</td></tr>'}</tbody></table></div><p class="mini-note">Los resultados describen respuestas en cada fecha. La administración puede orientar; no constituyen un diagnóstico.</p>`;
}
export function evaluationDetail(row) {
  return `<div class="form-actions"><button class="button ghost" data-action="manage-user" data-id="${e(row.usuario_id)}">Volver al usuario</button><button class="button" data-action="manage-followup" data-id="${e(row.usuario_id)}" data-evaluation="${e(row.id)}">${icon('chat')} Comentar esta evaluación</button></div><p>${e(date(row.creado_en))} · ${e(row.momento || '')} · ${e(row.vehiculo || '')}</p><div class="notice">Total: ${e(row.total)} / 70 · Nivel orientativo: ${e(row.nivel)} · Versión ${e(row.questionnaire_id || 1)}</div><ol class="evaluation-review">${(row.question_texts || QUESTIONS.map(([text]) => text)).map((question, index) => `<li><p>${e(question)}</p><strong>${e(row.respuestas?.[index] || 'Sin dato')} / 5 · ${e(LABELS[Number(row.respuestas?.[index]) - 1] || 'Sin dato')}</strong></li>`).join('')}</ol>`;
}
export function adminProfileForm(profile) {
  return `<form id="managementProfileForm" data-id="${e(profile.id)}"><p class="notice">Edición administrativa auditada. El rol y el correo de acceso se gestionan de forma protegida.</p><div class="form-grid">${[
    ['nombres', 'Nombres', 'text'],
    ['apellido_paterno', 'Apellido paterno', 'text'],
    ['apellido_materno', 'Apellido materno', 'text'],
    ['edad', 'Edad', 'number'],
    ['telefono', 'Teléfono', 'tel'],
    ['direccion', 'Dirección', 'text'],
  ]
    .map(
      ([key, label, type]) =>
        `<div><label for="management-${key}">${label}</label><input id="management-${key}" name="${key}" type="${type}" value="${e(profile[key] ?? '')}" ${key === 'nombres' ? 'required maxlength="100"' : key === 'edad' ? 'required min="18" max="99" step="1"' : `maxlength="${key === 'direccion' ? 250 : key === 'telefono' ? 30 : 100}"`} /></div>`,
    )
    .join(
      '',
    )}</div><div id="managementFeedback" class="feedback" role="alert" hidden></div><button class="button" type="submit">Guardar datos del usuario</button></form>`;
}
