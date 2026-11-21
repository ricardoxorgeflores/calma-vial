import { escapeHtml as e } from '../ui/format.js';
import { QUESTIONS, FACTORS } from '../domain/domain.js';
import { validateQuestionnaire } from '../domain/questionnaire.js';

// No conserva diagnósticos ni formularios de una sesión anterior.
export function createGovernance({
  state,
  api,
  render,
  openModal,
  closeModal,
  toast,
  errorText,
  reload,
}) {
  let diagnostic = null,
    failure = '',
    loading = false,
    revision = 0;
  const authorized = () => state.session && state.profile?.rol === 'admin';
  const valid = (stamp) => authorized() && state.revision === stamp;
  function view() {
    const current = state.catalog.find((item) => item.vigente);
    return `<header class="page-heading"><div><span class="eyebrow">ADMINISTRACIÓN</span><h1>Configuración y control</h1><p class="subtle">Gestiona el cuestionario y consulta las herramientas de mantenimiento.</p></div></header>
      <div class="governance-settings"><section class="card"><h2>Cuestionario de 14 situaciones</h2><p>Versión vigente: <strong>${e(current?.id || 'Sin cargar')}</strong></p><p>Los cambios crean una versión nueva. Las evaluaciones anteriores conservan las preguntas que se respondieron.</p><button class="button" data-action="govern-questions" ${!current ? 'disabled' : ''}>Editar las 14 preguntas</button><p class="mini-note">Se conserva el orden, los factores y el cálculo DAS. Una modificación sustancial del instrumento requiere revisión profesional. El APK actual mantiene sus textos originales.</p></section>
</div><details class="card diagnostic-panel" ${loading || diagnostic || failure ? 'open' : ''}><summary>Estado del servicio y diagnóstico</summary><div class="diagnostic-content"><p>Herramienta de mantenimiento: úsala si hay problemas al cargar o guardar datos, o para comprobar el servicio antes de una demostración.</p><p class="mini-note">El botón consulta PostgreSQL con tu sesión de administrador. Muestra la fecha de respuesta, las protecciones de acceso de siete tablas y un resumen de contraseñas protegidas. No cambia cuentas, permisos ni registros.</p><button class="button" data-action="govern-check" ${loading ? 'disabled' : ''}>${loading ? 'Comprobando…' : 'Comprobar ahora'}</button>${failure ? `<p role="alert" class="feedback">${e(failure)}</p>` : ''}${diagnostic ? `<div class="diagnostic-result" role="status"><p><strong>${diagnostic.tablas_rls === 7 && diagnostic.hashes_bcrypt === diagnostic.cuentas_con_password ? 'Comprobación completada' : 'Comprobación completada con observaciones'}</strong></p><dl class="data-status-list"><dt>Conexión</dt><dd>Confirmada por PostgreSQL</dd><dt>Comprobación</dt><dd>${e(new Date(diagnostic.comprobado_en).toLocaleString('es-BO'))}</dd><dt>Contraseñas protegidas</dt><dd>${e(diagnostic.hashes_bcrypt)} de ${e(diagnostic.cuentas_con_password)} con formato bcrypt</dd><dt>Tablas verificadas con RLS</dt><dd>${e(diagnostic.tablas_rls)} de 7</dd><dt>Accesos suspendidos</dt><dd>${e(diagnostic.usuarios_eliminados)}</dd></dl><p class="mini-note">Resumen agregado: no se exponen contraseñas ni hashes. Este diagnóstico no equivale a una auditoría completa. Si una protección no coincide con el total esperado, solicita una revisión técnica; si no conecta, revisa Internet y vuelve a comprobar.</p></div>` : `<p class="subtle" role="status">${loading ? 'Consultando el servicio…' : failure ? 'No se pudo completar la comprobación. Puedes reintentarlo.' : 'Sin comprobar en esta sesión. Pulsa Comprobar ahora para obtener un resultado actualizado.'}</p>`}
      <section class="diagnostic-activity"><h3>Actividad administrativa reciente</h3>${diagnostic ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Recurso</th><th>Acción</th><th>Fecha</th></tr></thead><tbody>${diagnostic.auditoria.map((row) => `<tr><td>${e(row.recurso)}</td><td>${e(row.accion)}</td><td>${e(new Date(row.creado_en).toLocaleString('es-BO'))}</td></tr>`).join('') || '<tr><td colspan="3">Sin actividad registrada.</td></tr>'}</tbody></table></div>` : '<p>Ejecuta la comprobación para consultar las últimas acciones.</p>'}</section></div></details>`;
  }
  function questionForm() {
    const current = state.catalog.find((item) => item.vigente);
    if (!current) throw new Error('Actualiza los datos para cargar el cuestionario.');
    openModal(
      'Editar preguntas · nueva versión',
      `<form id="governQuestions" data-base="${e(current.id)}"><p class="notice">Puedes actualizar la redacción. El orden, los factores y la escala se mantienen; no se reescribe el historial.</p>${current.preguntas.map((text, i) => `<label for="question-${i}">${i + 1}. ${e(FACTORS[QUESTIONS[i][1]])}</label><textarea id="question-${i}" name="question-${i}" required minlength="15" maxlength="700">${e(text)}</textarea>`).join('')}<label for="questionReason">Motivo de la actualización</label><textarea id="questionReason" name="motivo" required minlength="10" maxlength="300"></textarea><p class="mini-note">Antes de publicar, comprueba que el cambio respete el instrumento y sus condiciones de uso.</p><div id="governFeedback" class="feedback" hidden role="alert"></div><button class="button" type="submit">Revisar cambios</button></form>`,
    );
  }
  let draft = null;
  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action^="govern-"]');
    if (!button || button.disabled || !authorized()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const stamp = state.revision;
    try {
      if (button.dataset.action === 'govern-questions') questionForm();
      if (button.dataset.action === 'govern-check') {
        loading = true;
        failure = '';
        diagnostic = null;
        render();
        try {
          const data = await api.diagnostics();
          if (valid(stamp)) diagnostic = data;
        } catch (error) {
          if (valid(stamp)) failure = errorText(error);
        } finally {
          if (valid(stamp)) {
            loading = false;
            render();
          }
        }
      }
      if (button.dataset.action === 'govern-account') {
        const profile = state.admin?.profiles.find((item) => item.id === button.dataset.id);
        if (!profile || profile.rol !== 'usuario') return;
        const suspension = state.removedUsers.find((item) => item.usuario_id === profile.id);
        const removed = !!suspension;
        openModal(
          removed ? 'Reactivar acceso' : 'Suspender acceso',
          `<form id="governAccount" data-id="${e(profile.id)}" data-remove="${!removed}"><p>${e(profile.nombres)} · ${e(profile.correo)}</p><p>${removed ? 'La cuenta recuperará su acceso a Calma Vial y conservará sus registros.' : 'Se suspenderá su acceso a Calma Vial, incluso con una sesión existente. Los registros se conservarán para poder restaurar la cuenta. No se elimina la identidad compartida de Supabase Auth.'}</p><label for="accountReason">Motivo</label><textarea id="accountReason" name="motivo" required minlength="10" maxlength="300"></textarea><div id="governFeedback" class="feedback" hidden role="alert"></div><button class="button" type="submit">${removed ? 'Confirmar reactivación' : 'Confirmar suspensión'}</button></form>`,
        );
      }
      if (button.dataset.action === 'govern-publish' && draft) {
        button.disabled = true;
        await api.publishQuestions(draft.questions, draft.reason, draft.base);
        if (!valid(stamp)) return;
        draft = null;
        closeModal();
        await reload();
        toast('Nueva versión publicada y guardada en Supabase.');
      }
    } catch (error) {
      if (valid(stamp)) {
        button.disabled = false;
        const node = document.getElementById('governFeedback');
        if (node) {
          node.hidden = false;
          node.textContent = errorText(error);
        } else toast(errorText(error), true);
      }
    }
  });
  document.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!['governQuestions', 'governAccount'].includes(form.id)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!authorized()) return;
    const stamp = state.revision,
      button = form.querySelector('[type="submit"]');
    if (button.disabled) return;
    button.disabled = true;
    try {
      const fields = Object.fromEntries(new FormData(form));
      if (form.id === 'governQuestions') {
        const data = validateQuestionnaire(
          Array.from({ length: 14 }, (_, i) => fields[`question-${i}`]),
          fields.motivo,
        );
        const current = state.catalog.find((item) => item.id === Number(form.dataset.base));
        const changes = data.questions
          .map((text, i) => ({ text, i }))
          .filter(({ text, i }) => text !== current.preguntas[i]);
        if (!changes.length) throw new Error('No hay cambios para publicar.');
        draft = { ...data, base: current.id };
        openModal(
          'Confirmar nueva versión',
          `<p>Se actualizarán ${changes.length} preguntas. Las anteriores permanecerán disponibles para consultar el historial.</p>${changes.map(({ text, i }) => `<h3>Pregunta ${i + 1}</h3><p><strong>Anterior:</strong> ${e(current.preguntas[i])}</p><p><strong>Nueva:</strong> ${e(text)}</p>`).join('')}<p><strong>Motivo:</strong> ${e(data.reason)}</p><div id="governFeedback" class="feedback" hidden role="alert"></div><button class="button" data-action="govern-publish">Publicar nueva versión</button>`,
        );
      } else {
        await api.changeAccount(form.dataset.id, form.dataset.remove === 'true', fields.motivo);
        if (!valid(stamp)) return;
        closeModal();
        await reload();
        toast('Estado del usuario actualizado con auditoría.');
      }
    } catch (error) {
      if (valid(stamp)) {
        const node = document.getElementById('governFeedback');
        if (node) {
          node.hidden = false;
          node.textContent = errorText(error);
        }
      }
    } finally {
      if (valid(stamp)) button.disabled = false;
    }
  });
  return {
    view,
    reset() {
      revision++;
      diagnostic = null;
      failure = '';
      loading = false;
      draft = null;
    },
  };
}
