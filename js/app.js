import {
  ADMIN_VIEWS,
  adminPopulation,
  evaluationDashboard,
  participationDashboard,
} from './features/admin-dashboards.js?v=c08542ce77f3';
import { createGovernance } from './features/governance.js?v=c08542ce77f3';
import { originalQuestionnaire, questionsFor } from './domain/questionnaire.js?v=c08542ce77f3';
import { createManagementApi } from './services/management-api.js?v=c08542ce77f3';
import { createManagementController } from './features/management-controller.js?v=c08542ce77f3';
import { evolutionChart } from './features/evolution.js?v=c08542ce77f3';
import { icon, passwordToggle } from './ui/icons.js?v=c08542ce77f3';
import { EMOTIONS, DIARY_INTENSITIES, diaryEmotion, composeReaction } from './domain/management.js?v=c08542ce77f3';
import { api, db, unwrap } from './services/api.js?v=c08542ce77f3';
import { prepareAvatar } from './features/avatar.js?v=c08542ce77f3';
import {
  createReportPdf,
  loadReportFonts,
  loadPdfEngine,
  REPORT_DISCLAIMER,
} from './features/report.js?v=c08542ce77f3';
import {
  QUESTIONS,
  LABELS,
  DIARY_FACTORS,
  MOODS,
  MOOD_ICONS,
  MOMENTS,
  VEHICLES,
  roleLabel,
  recommendations,
  adminSummary,
  appRedirectUrl,
  validateEmail,
  validatePassword,
  calculate,
} from './domain/domain.js?v=c08542ce77f3';

// Estado compartido y utilidades de presentación.
const $ = (id) => document.getElementById(id);
const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

// revision permite descartar respuestas antiguas al cambiar de cuenta.
const state = {
  catalog: [],
  evaluationVersions: [],
  removedUsers: [],
  deletedUsers: [],
  adminEvalSearch: '',
  adminLevel: '',
  participationStatus: 'todas',
  evalQuestionnaire: originalQuestionnaire(),
  session: null,
  profile: null,
  evaluations: [],
  diary: [],
  admin: null,
  avatarUrl: null,
  avatarCheckedAt: 0,
  notices: null,
  noticeAudit: [],
  noticesError: null,
  report: null,
  reportBlob: null,
  reportKey: null,
  reportStatus: 'locked',
  reportError: null,
  archived: null,
  archiveError: null,
  view: 'inicio',
  authMode: 'login',
  profileEditing: false,
  hydrating: false,
  loading: false,
  error: null,
  revision: 0,
  lastSync: 0,
  lastWrite: null,
  evalStep: -1,
  evalRequestId: null,
  evaluationSaving: false,
  answers: Array(14).fill(null),
  context: null,
  historyFilter: '',
  diaryFilter: '',
  historySearch: '',
  adminSearch: '',
  pattern: 'box',
  breathing: false,
};
const titles = {
  inicio: 'Resumen',
  evaluacion: 'Autoevaluación',
  historial: 'Mis resultados',
  diario: 'Mi diario',
  calma: 'Modo calma',
  perfil: 'Mi perfil',
  admin: 'Panel de administración',
  usuarios: 'Usuarios y evolución',
  'evaluaciones-admin': 'Evaluaciones de la comunidad',
  participacion: 'Participación de usuarios',
  pendientes: 'Atención pendiente',
  sugerencias: 'Sugerencias y consultas',
  sistema: 'Configuración y control',
  avisos: 'Avisos de la plataforma',
  informe: 'Mi informe PDF',
  papelera: 'Papelera',
};
let breathTimer, toastTimer, syncChannel, modalTrigger;
let signingOut = false;
let noticesRequest = 0;
let reportRequest = 0;
let archiveRequest = 0;
let authPending = false,
  loginRole = null;

const managementController = createManagementController({
  api: createManagementApi(db),
  context: () => state,
  adminData: () => (state.admin ? { ...state.admin, ...adminPopulation(state) } : null),
  ensureAdmin: async () => {
    if (!state.admin) await loadAdmin();
  },
  openModal,
  closeModal,
  render,
  toast,
  errorText,
  feedback,
  busy,
  profileChanged: async (row) => {
    if (state.admin)
      state.admin.profiles = state.admin.profiles.map((profile) =>
        profile.id === row.id ? row : profile,
      );
    if (state.profile?.id === row.id) state.profile = row;
    confirmWrite('perfiles', row.id, 'Editado por administración');
  },
});

const governance = createGovernance({
  state,
  api,
  render,
  openModal,
  closeModal,
  toast,
  errorText,
  reload: async () => {
    await loadData();
    await loadAdmin();
    render();
  },
});

function date(value, short = false) {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? 'Sin fecha'
    : d.toLocaleDateString('es-BO', {
        day: 'numeric',
        month: 'short',
        ...(short ? {} : { year: 'numeric' }),
        timeZone: 'America/La_Paz',
      });
}
const number = (n) => (Number.isFinite(Number(n)) ? Number(n).toFixed(1) : '—');
const name = () =>
  [state.profile?.nombres, state.profile?.apellido_paterno].filter(Boolean).join(' ') ||
  state.session?.user.email?.split('@')[0] ||
  'Mi cuenta';
const firstName = () => state.profile?.nombres?.split(' ')[0] || 'bienvenido';

// Traduce errores técnicos a mensajes que puede entender el usuario.
function errorText(e) {
  const msg = String(e?.message || e || 'Error inesperado');
  if (/timeout|timed out|abort|exceeded.*time/i.test(msg))
    return 'El servidor tardó demasiado en responder. Comprueba tu conexión. Si estabas guardando un registro, revisa el historial antes de repetirlo.';
  if (/invalid login credentials/i.test(msg))
    return 'El correo o la contraseña no coinciden. Usa tu cuenta de la app móvil.';
  if (/email not confirmed/i.test(msg)) return 'Confirma tu correo antes de iniciar sesión.';
  if (/already registered/i.test(msg))
    return 'Este correo ya tiene una cuenta. Inicia sesión con tu contraseña.';
  if (/fetch|network|load failed/i.test(msg))
    return 'No se pudo conectar. Comprueba tu Internet y vuelve a intentarlo.';
  if (/rate limit|too many requests|security purposes/i.test(msg))
    return 'Se hicieron varios intentos. Espera un momento antes de volver a probar.';
  if (/row.level|policy|permission denied/i.test(msg))
    return 'Tu cuenta no tiene permiso para esta operación. Revisa tus permisos de acceso.';
  if (/duplicate key/i.test(msg))
    return 'Ese dato ya está registrado. Revisa tu usuario o documento.';
  if (/session|jwt expired/i.test(msg)) return 'Tu sesión venció. Vuelve a iniciar sesión.';
  return msg;
}

function feedback(id, message, success = false) {
  const el = $(id);
  el.textContent = message;
  el.classList.toggle('success', success);
  el.hidden = !message;
}

function toast(message, error = false) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').classList.toggle('error', error);
  $('toast').hidden = false;
  toastTimer = setTimeout(() => ($('toast').hidden = true), 6500);
}

function confirmWrite(table, id, operation = 'Guardado') {
  state.lastWrite = { table, id, operation, at: Date.now() };
}

function dataStatus() {
  if (!state.session) return;
  const time = (value) => new Date(value).toLocaleString('es-BO', { timeZone: 'America/La_Paz' });
  const write = state.lastWrite;
  const labels = {
    perfiles: 'Perfil',
    evaluaciones: 'Evaluación',
    diario: 'Diario',
    calmavial_avisos: 'Aviso',
  };
  openModal(
    'Estado de mis datos',
    /* HTML */ `
      <p>Los datos de tu cuenta se guardan en Supabase y se consultan desde la web y Android.</p>
      <dl class="data-status-list">
        <dt>Última lectura completada</dt>
        <dd>
          ${state.lastSync ? escape(time(state.lastSync)) : 'Aún no completada en esta sesión'}
        </dd>
        <dt>Evaluaciones de mi cuenta</dt>
        <dd>${state.evaluations.length}</dd>
        <dt>Entradas de mi diario</dt>
        <dd>${state.diary.length}</dd>
        <dt>Última escritura confirmada en esta sesión</dt>
        <dd>
          ${write ? `${escape(labels[write.table])} · ${escape(write.operation)} · ${escape(time(write.at))}<br>Referencia: <code>${escape(write.id)}</code>` : 'Todavía no has guardado ni eliminado registros en esta sesión.'}
        </dd>
      </dl>
      <p class="subtle">
        Una escritura se confirma cuando el servidor responde. Una lectura posterior fallida no
        anula un guardado confirmado. Si se pierde la respuesta, revisa el historial antes de
        repetir el registro.
      </p>
      ${state.profile?.rol === 'admin' ? `<h3>Almacenamiento y seguridad</h3><dl class="data-status-list"><dt>Cuentas y contraseñas</dt><dd><code>auth.users</code>. La columna <code>encrypted_password</code> contiene un hash administrado por Supabase Auth. La web no puede leerlo.</dd><dt>Perfiles y permisos</dt><dd><code>public.perfiles</code>: rol <code>usuario</code> o <code>admin</code>.</dd><dt>Evaluaciones y diario</dt><dd><code>public.evaluaciones</code> y <code>public.diario</code>, vinculados a la cuenta por <code>usuario_id</code> y protegidos por RLS.</dd></dl>` : ''}
      <p>Tu contraseña no se guarda en el perfil, las evaluaciones ni el diario.</p>
      <button class="button" data-action="close-modal">Entendido</button>
    `,
  );
}

// Evita envíos duplicados y restaura el botón aunque falle la operación.
async function busy(button, action) {
  if (button?.disabled) return;
  const old = button?.innerHTML;
  if (button) {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = 'Un momento…';
  }
  try {
    return await action();
  } finally {
    if (button?.isConnected) {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.innerHTML = old;
    }
  }
}

function openModal(title, html) {
  if (!$('modal').open) modalTrigger = document.activeElement;
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = html;
  if (!$('modal').open) $('modal').showModal();
  paintBars();
}

function closeModal() {
  $('modal').close();
  modalTrigger?.focus?.();
}

// Plantillas reutilizables. Escapar los datos externos antes de insertarlos en HTML.
function heading(title, subtitle, action = '') {
  return /* HTML */ `<div class="page-heading">
    <div>
      <span class="eyebrow"
        >${state.profile?.rol === 'admin' ? 'CAMPUS · ADMINISTRACIÓN' : 'CAMPUS · MI BIENESTAR'}</span
      >
      <h1>${title}</h1>
      <p>${subtitle}</p>
    </div>
    ${action}
  </div>`;
}

function empty(title, text, action = '') {
  return /* HTML */ `<div class="empty">
    <span aria-hidden="true">◌</span>
    <h3>${title}</h3>
    <p>${text}</p>
    ${action}
  </div>`;
}

function badge(level) {
  return /* HTML */ `<span
    class="badge ${['Bajo', 'Moderado', 'Elevado'].includes(level) ? level.toLowerCase() : ''}"
    >${level === 'Bajo' ? '😌 ' : level === 'Moderado' ? '😐 ' : level === 'Elevado' ? '😠 ' : ''}${escape(level || 'Sin evaluar')}</span
  >`;
}

function paintBars() {
  document.querySelectorAll('[data-width]').forEach((el) => {
    el.style.width = `${Math.max(0, Math.min(100, Number(el.dataset.width) || 0))}%`;
  });
  document.querySelectorAll('[data-height]').forEach((el) => {
    el.style.height = `${Math.max(1, Math.min(100, Number(el.dataset.height) || 0))}%`;
  });
}

function bars(ev) {
  return /* HTML */ `<div class="factors">
    ${[
      ['Avance impedido', ev.prom_avance],
      ['Conducción temeraria', ev.prom_temeraria],
      ['Hostilidad directa', ev.prom_hostilidad],
    ]
      .map(
        ([label, value]) =>
          /* HTML */ `<div class="factor-row">
            <div class="factor-label">
              <span>${label}</span><strong>${number(value)} <span>/ 5</span></strong>
            </div>
            <div class="track">
              <span
                data-width="${Number(value) * 20}"
                role="meter"
                aria-label="${label}"
                aria-valuenow="${Number(value) || 0}"
                aria-valuemin="0"
                aria-valuemax="5"
              ></span>
            </div>
          </div>`,
      )
      .join('')}
  </div>`;
}

function score(ev) {
  return /* HTML */ `<div class="score-summary">
      <div class="score-dial"><strong>${escape(ev.total)}</strong><small>de 70 puntos</small></div>
      <div>
        ${badge(ev.nivel)}
        <h3>Tu último punto de partida</h3>
        <p>
          ${date(ev.creado_en)} · Promedio ${number(ev.prom_general ?? Number(ev.total) / 14)} / 5
        </p>
      </div>
    </div>
    ${Number.isInteger(Number(ev.animo)) && ev.animo != null ? `<p class="mood-summary">Ánimo que registraste: ${MOOD_ICONS[Number(ev.animo) - 1] || ''} ${escape(MOODS[Number(ev.animo) - 1] || '')}</p>` : ''}${bars(ev)}`;
}

function resultNote() {
  return '<p class="mini-note">Los niveles son orientativos y no constituyen un diagnóstico. Reflejan tus respuestas en ese momento.</p>';
}

// Vistas del espacio personal: resumen, resultados y diario.
function reportKey() {
  return state.evaluations
    .map((row) => String(row.id))
    .sort()
    .join(',');
}

function downloadPdf(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function reportReadiness() {
  const count = Math.min(3, state.evaluations.length);
  const text =
    state.reportStatus === 'ready'
      ? 'Tu informe PDF está listo.'
      : state.reportStatus === 'loading'
        ? 'Preparando tu informe privado…'
        : state.reportStatus === 'error'
          ? 'El informe necesita volver a intentarse.'
          : `${count} de 3 evaluaciones. Completa tres para obtener tu informe.`;
  return `<div class="report-banner"><strong>${text}</strong><p>Resumen orientativo, recomendaciones y advertencia de valoración profesional.</p><button class="text-button" data-action="open-report">Ver mi informe</button></div>`;
}

function paintReport() {
  const panel = $('reportPanel');
  if (panel) panel.innerHTML = reportPanel();
  const banner = $('historyReportStatus');
  if (banner) banner.innerHTML = reportReadiness();
  const modalStatus = $('modalReportStatus');
  if (modalStatus) modalStatus.innerHTML = reportReadiness();
}

async function refreshReport(force = false) {
  if (!state.session) return;
  const key = reportKey();
  if (state.evaluations.length < 3) {
    reportRequest++;
    state.report = null;
    state.reportBlob = null;
    state.reportKey = key;
    state.reportStatus = 'locked';
    state.reportError = null;
    paintReport();
    return;
  }
  if (!force && state.reportKey === key && ['loading', 'ready'].includes(state.reportStatus))
    return;
  const revision = state.revision,
    request = ++reportRequest,
    uid = state.session.user.id;
  state.reportStatus = 'loading';
  state.reportKey = key;
  state.reportBlob = null;
  state.reportError = null;
  paintReport();
  try {
    const report = await api.report(uid);
    const fonts = await loadReportFonts();
    if (revision !== state.revision || request !== reportRequest || key !== reportKey()) return;
    const pdf = createReportPdf(report, await loadPdfEngine(), fonts);
    state.report = report;
    state.reportBlob = pdf.output('blob');
    state.reportStatus = 'ready';
  } catch (error) {
    if (revision !== state.revision || request !== reportRequest) return;
    state.reportStatus = 'error';
    state.reportError = errorText(error);
  }
  paintReport();
}

function reportPanel() {
  const count = Math.min(3, state.evaluations.length);
  const progress = `<div class="report-progress" aria-label="${count} de 3 evaluaciones">${[1, 2, 3].map((n) => `<span class="${count >= n ? 'complete' : ''}"></span>`).join('')}</div>`;
  const summary =
    state.report && state.reportStatus === 'ready'
      ? `<div class="notice safe">Preparado con tus tres evaluaciones válidas más recientes, incluidas las realizadas en la app móvil cuando estén guardadas en esta cuenta.</div><p>Promedio: <strong>${number(state.report.averages.prom_general)} / 5</strong> · ${state.report.totalEvaluations} evaluaciones válidas disponibles.</p>`
      : '';
  return `<span class="section-tag">SEGUIMIENTO PERSONAL</span><h2>Tu recorrido, en un informe privado</h2>${progress}<p role="status">${state.reportStatus === 'ready' ? 'Informe PDF preparado.' : state.reportStatus === 'loading' ? 'Preparando el PDF con datos confirmados por el servidor…' : state.reportStatus === 'error' ? 'No se pudo preparar el informe.' : `Necesitas 3 evaluaciones válidas y no archivadas. Actualmente hay ${state.evaluations.length} registros visibles.`}</p>${summary}${state.reportError ? `<div class="feedback" role="alert">${escape(state.reportError)}</div>` : ''}<div class="form-actions"><button class="button" data-action="download-report" ${state.reportStatus !== 'ready' ? 'disabled' : ''}>Descargar informe PDF ↓</button>${state.evaluations.length >= 3 ? '<button class="button ghost" data-action="retry-report">Actualizar informe</button>' : '<a class="button secondary" href="#evaluacion">Realizar evaluación</a>'}</div><div class="notice">${escape(REPORT_DISCLAIMER)}</div><p class="mini-note">El documento se genera en este navegador. No contiene tu diario, teléfono ni contraseña. Tú decides con quién compartirlo.</p>`;
}

function reportView() {
  return (
    heading(
      'Mi informe PDF',
      'Disponible al completar tres evaluaciones válidas guardadas en tu cuenta.',
    ) + `<section class="card" id="reportPanel">${reportPanel()}</section>`
  );
}

async function loadArchived() {
  if (!state.session) return;
  const revision = state.revision,
    request = ++archiveRequest;
  try {
    const rows = await api.archived();
    if (revision !== state.revision || request !== archiveRequest) return;
    state.archived = rows;
    state.archiveError = null;
  } catch (error) {
    if (revision !== state.revision || request !== archiveRequest) return;
    state.archiveError = errorText(error);
  }
  if (state.view === 'papelera' && !$('modal').open) render();
}

function archiveView() {
  return (
    heading(
      'Papelera',
      'Los registros de la papelera se conservan. Puedes restaurarlos para volver a verlos.',
    ) +
    `<section class="card">${state.archiveError ? `<div class="feedback" role="alert">${escape(state.archiveError)}</div><button class="button" data-action="refresh-archive">Volver a intentar</button>` : state.archived === null ? '<p role="status">Cargando registros archivados…</p>' : state.archived.length ? state.archived.map((row) => `<article class="archive-item"><div><span class="badge">${row.tipo === 'evaluaciones' ? 'Evaluación' : 'Diario'}</span><p>${escape(row.detalle)}</p><small>Archivado el ${date(row.archivado_en)}</small></div><button class="button ghost" data-action="restore-record" data-type="${row.tipo}" data-id="${row.id}">Restaurar</button></article>`).join('') : empty('Papelera vacía', 'Aquí aparecerán los registros que envíes a la papelera.')}</section>`
  );
}

function dashboard() {
  const latest = state.evaluations[0];
  const month = new Date().toLocaleDateString('es-BO', {
    month: 'long',
    timeZone: 'America/La_Paz',
  });
  return (
    heading(
      `Hola, ${escape(firstName())} <span aria-hidden="true">☀</span>`,
      'Este es tu espacio para conocerte y avanzar con más calma.',
      '<a class="button" href="#evaluacion">Nueva evaluación <span>＋</span></a>',
    ) +
    /* HTML */ `<section class="hero-card">
        <div class="hero-copy">
          <span class="eyebrow">CADA CAMINO EMPIEZA CONTIGO</span>
          <h2>Conducir en calma<br />también se aprende.</h2>
          <p>
            Date un momento para reconocer cómo te sientes. Pequeñas pausas pueden cambiar tu día.
          </p>
          <a class="button mint-button" href="#calma">Tomarme una pausa <span>↗</span></a>
        </div>
        <div class="hero-wheel" aria-hidden="true">
          <img src="./assets/images/logo.svg?v=c08542ce77f3" alt="" />
        </div>
      </section>
      <div class="stats-grid">
        <article class="stat-card">
          <span class="stat-icon">▤</span>
          <div>
            <small>Evaluaciones realizadas</small><strong>${state.evaluations.length}</strong
            ><em>Tu recorrido hasta hoy</em>
          </div>
        </article>
        <article class="stat-card">
          <span class="stat-icon">▧</span>
          <div>
            <small>Momentos registrados</small><strong>${state.diary.length}</strong
            ><em>En tu diario personal</em>
          </div>
        </article>
        <article class="stat-card">
          <span class="stat-icon">◷</span>
          <div>
            <small>Última evaluación</small
            ><strong>${latest ? date(latest.creado_en, true) : '—'}</strong
            ><em>${latest ? 'Un paso para conocerte' : 'Tu primer paso te espera'}</em>
          </div>
        </article>
      </div>
      <div class="dashboard-grid">
        <div>
          <section class="card">
            <div class="card-title">
              <h2>Así te sientes al conducir</h2>
              <a class="text-button" href="#historial">Ver resultados ↗</a>
            </div>
            ${latest ? score(latest) + resultNote() : empty('Tu recorrido empieza aquí', 'Completa tu primera autoevaluación para conocer tus factores de ira al conducir.', '<a class="button secondary" href="#evaluacion">Hacer mi evaluación ↗</a>')}
          </section>
          ${
            state.evaluations.length > 1
              ? /* HTML */ `<section class="card trend-card">
                  <div class="card-title">
                    <h2>Tu recorrido en el tiempo</h2>
                    <small>Últimas ${Math.min(10, state.evaluations.length)} evaluaciones</small>
                  </div>
                  <div
                    class="trend-chart"
                    role="img"
                    aria-label="Totales de las últimas evaluaciones: ${state.evaluations
                      .slice(0, 10)
                      .reverse()
                      .map((e) => e.total)
                      .join(', ')}"
                  >
                    ${state.evaluations
                      .slice(0, 10)
                      .reverse()
                      .map(
                        (ev) =>
                          /* HTML */ `<div
                            class="trend-column"
                            data-height="${(Number(ev.total) / 70) * 100}"
                            title="${date(ev.creado_en)}: ${Number(ev.total)} / 70"
                          ></div>`,
                      )
                      .join('')}
                  </div>
                  <div class="chart-caption">
                    <span>Más antiguas</span><span>Más reciente</span>
                  </div>
                </section>`
              : ''
          }
        </div>
        <div>
          <section class="card calm-card">
            <span class="eyebrow">UN MOMENTO PARA TI</span
            ><span class="leaf" aria-hidden="true">❋</span>
            <h2>Respira.<br />Vuelve a tu centro.</h2>
            <p>Una pausa guiada para continuar a tu propio ritmo.</p>
            <a class="button" href="#calma">Entrar en modo calma ↗</a>
          </section>
          <section class="card">
            <div class="card-title">
              <h2>Tu diario, tu espacio</h2>
              <a class="text-button" href="#diario">Ver todo ↗</a>
            </div>
            ${
              state.diary.length
                ? state.diary
                    .slice(0, 3)
                    .map(
                      (row) =>
                        /* HTML */ `<div class="recent-row">
                          <span class="recent-dot"></span>
                          <div>
                            <strong
                              >${escape(row.situacion.slice(0, 85))}${row.situacion.length > 85 ? '…' : ''}</strong
                            ><small
                              >${date(row.creado_en, true)} · Intensidad
                              ${escape(row.intensidad)}/5</small
                            >
                          </div>
                        </div>`,
                    )
                    .join('')
                : empty(
                    'Cada momento cuenta',
                    'Anota lo que viviste y cómo reaccionaste.',
                    '<button class="text-button" data-action="new-diary">Escribir mi primer registro ↗</button>',
                  )
            }
          </section>
        </div>
      </div>`
  );
}

function history() {
  const filtered = state.evaluations.filter(
    (e) =>
      (!state.historyFilter || e.nivel === state.historyFilter) &&
      [e.nivel, e.momento, e.vehiculo, date(e.creado_en)]
        .join(' ')
        .toLowerCase()
        .includes(state.historySearch.toLowerCase()),
  );
  return (
    heading('Mis resultados', 'Cada evaluación es una oportunidad para conocerte mejor.') +
    evolutionChart(state.evaluations) +
    /* HTML */ `<div id="historyReportStatus">${reportReadiness()}</div>
      <section class="card">
        <div class="toolbar">
          <span class="subtle">${state.evaluations.length} evaluaciones en tu cuenta</span
          ><input
            id="historySearch"
            type="search"
            aria-label="Buscar evaluaciones"
            placeholder="Buscar por fecha, vehículo o momento"
            value="${escape(state.historySearch)}"
          /><select id="historyFilter" aria-label="Filtrar por nivel">
            <option value="">Todos los niveles</option>
            ${['Bajo', 'Moderado', 'Elevado'].map((v) => /* HTML */ `<option ${state.historyFilter === v ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
        </div>
        ${
          filtered.length
            ? /* HTML */ `<div class="table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Total</th>
                      <th>Nivel orientativo</th>
                      <th>Momento</th>
                      <th>Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${filtered
                      .map(
                        (e) =>
                          /* HTML */ `<tr>
                            <td>${date(e.creado_en)}</td>
                            <td><strong>${escape(e.total)}</strong> / 70</td>
                            <td>${badge(e.nivel)}</td>
                            <td>${escape(e.momento || '—')}</td>
                            <td>
                              <button
                                class="text-button"
                                data-action="result"
                                data-id="${escape(e.id)}"
                              >
                                Ver resultado ↗</button
                              ><button
                                class="text-button danger-text"
                                data-action="delete-evaluation"
                                data-id="${escape(e.id)}"
                                aria-label="Eliminar evaluación del ${date(e.creado_en)}"
                              >
                                Eliminar
                              </button>
                              <button
                                class="text-button"
                                data-action="archive-record"
                                data-type="evaluaciones"
                                data-id="${escape(e.id)}"
                              >
                                Archivar
                              </button>
                            </td>
                          </tr>`,
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>`
            : empty(
                state.evaluations.length
                  ? 'Sin resultados para este nivel'
                  : 'Aún no tienes evaluaciones',
                state.evaluations.length
                  ? 'Cambia el filtro para ver el resto de tu historial.'
                  : 'Las que realices aquí y en tu app móvil aparecerán en este historial.',
                '<a class="button secondary" href="#evaluacion">Nueva evaluación ↗</a>',
              )
        }${resultNote()}
      </section>`
  );
}

function journal() {
  const rows = state.diary.filter((r) => !state.diaryFilter || r.factor === state.diaryFilter);
  return (
    heading(
      'Mi diario',
      'Un lugar para entender lo que pasó y cómo te sentiste.',
      '<button class="button" data-action="new-diary">Nuevo registro ＋</button>',
    ) +
    /* HTML */ `<div class="journal-layout">
      <section class="card">
        <div class="toolbar">
          <span class="subtle">${state.diary.length} momentos guardados</span
          ><select id="diaryFilter" aria-label="Filtrar diario por factor">
            <option value="">Todos los factores</option>
            ${Object.entries(DIARY_FACTORS)
              .map(
                ([k, v]) =>
                  /* HTML */ `<option value="${k}" ${k === state.diaryFilter ? 'selected' : ''}>
                    ${v}
                  </option>`,
              )
              .join('')}
          </select>
        </div>
        ${
          rows.length
            ? rows
                .map(
                  (row) =>
                    /* HTML */ `<article class="journal-entry">
                      <div class="entry-meta">
                        <span>${date(row.creado_en)}</span
                        ><span class="badge"
                          >${escape(DIARY_FACTORS[row.factor] || row.factor || 'Sin factor')}</span
                        >
                      </div>
                      <h3>${escape(row.situacion)}</h3>
                      <div class="intensity" aria-label="Intensidad ${Number(row.intensidad)} de 5">
                        ${Array.from({ length: 5 }, (_, i) => /* HTML */ `<i class="${i < row.intensidad ? 'filled' : ''}"></i>`).join('')}
                      </div>
                      ${diaryEmotion(row.reaccion).emotion ? `<span class="emotion-pill">${EMOTIONS[diaryEmotion(row.reaccion).emotion]}</span>` : ''}${row.reaccion ? /* HTML */ `<p><strong>Mi reacción:</strong> ${escape(row.reaccion)}</p>` : ''}${row.nota ? /* HTML */ `<p>${escape(row.nota)}</p>` : ''}
                      <div class="entry-actions">
                        <button
                          class="text-button"
                          data-action="edit-diary"
                          data-id="${escape(row.id)}"
                        >
                          Editar</button
                        ><button
                          class="text-button"
                          data-action="delete-diary"
                          data-id="${escape(row.id)}"
                        >
                          Eliminar
                        </button>
                        <button
                          class="text-button"
                          data-action="archive-record"
                          data-type="diario"
                          data-id="${escape(row.id)}"
                        >
                          Archivar
                        </button>
                      </div>
                    </article>`,
                )
                .join('')
            : empty(
                'Dale espacio a lo que sientes',
                state.diary.length
                  ? 'No hay registros con este factor. Prueba con otro filtro.'
                  : 'Piensa en una situación reciente al conducir. ¿Qué pasó? ¿Cómo reaccionaste?',
                '<button class="button secondary" data-action="new-diary">Escribir un registro ↗</button>',
              )
        }
      </section>
      <aside class="journal-prompt">
        <span class="eyebrow">ESCRIBIR TAMBIÉN ES UNA PAUSA</span>
        <h3>No necesitas tener<br />todas las respuestas.</h3>
        <p>
          Empieza por describir lo que ocurrió, sin juzgarte. Reconocer una emoción es un primer
          paso.
        </p>
        <p>Tu diario se guarda en tu cuenta y puedes consultarlo en la app móvil.</p>
      </aside>
    </div>`
  );
}

function diaryModal(row) {
  const feeling = diaryEmotion(row?.reaccion);
  openModal(
    row ? 'Editar mi registro' : 'Un momento para recordar',
    /* HTML */ `<form id="diaryForm" data-id="${escape(row?.id || '')}">
      <label for="situation">¿Qué pasó?</label
      ><textarea
        name="situacion"
        id="situation"
        required
        maxlength="2000"
        placeholder="Por ejemplo: un auto se cruzó en mi carril…"
      >
${escape(row?.situacion || '')}</textarea>
      <div class="form-grid">
        <div>
          <label for="factor">Factor</label
          ><select id="factor" name="factor" required>
            <option value="">Elige una opción</option>
            ${Object.entries(DIARY_FACTORS)
              .map(
                ([k, v]) =>
                  /* HTML */ `<option value="${k}" ${row?.factor === k ? 'selected' : ''}>
                    ${v}
                  </option>`,
              )
              .join('')}
          </select>
        </div>
        <div>
          <label for="intensity">Intensidad de la emoción</label
          ><select id="intensity" name="intensidad" required>
            <option value="">Elige la intensidad, de 1 a 5</option>
            ${DIARY_INTENSITIES.map((l, i) => /* HTML */ `<option value="${i + 1}" ${Number(row?.intensidad) === i + 1 ? 'selected' : ''}>${i + 1} · ${l}</option>`).join('')}
          </select>
        </div>
      </div>
      <label for="diaryEmotion">¿Cómo te sentiste?</label
      ><select id="diaryEmotion" name="emocion">
        <option value="">Elige una emoción (opcional)</option>
        ${Object.entries(EMOTIONS)
          .map(
            ([key, label]) =>
              `<option value="${key}" ${feeling.emotion === key ? 'selected' : ''}>${label}</option>`,
          )
          .join('')}
      </select>
      <p class="mini-note">
        La emoción y su intensidad son diferentes: por ejemplo, tristeza leve o enojo intenso.
      </p>
      <label for="reaction">¿Cómo reaccionaste?</label
      ><input
        id="reaction"
        name="reaccion"
        maxlength="2000"
        value="${escape(feeling.reaction)}"
        placeholder="Lo que hiciste o pensaste"
      /><label for="note">Una reflexión (opcional)</label
      ><textarea
        name="nota"
        id="note"
        maxlength="2000"
        placeholder="¿Qué te gustaría recordar la próxima vez?"
      >
${escape(row?.nota || '')}</textarea>
      <div class="feedback" id="diaryFeedback" hidden role="alert"></div>
      <div class="form-actions">
        <button class="button ghost" type="button" data-action="close-modal">Cancelar</button
        ><button class="button" type="submit">Guardar registro ↗</button>
      </div>
    </form>`,
  );
}

// Cuestionario: contexto previo, respuestas por situación y resultado.
function evaluation() {
  if (state.evalStep === -1)
    return (
      heading(
        'Un momento para conocerte',
        'Autoevaluación de ira al conducir · Driving Anger Scale',
      ) +
      /* HTML */ `<section class="card eval-context">
        <div class="card-title">
          <h2>Antes de empezar</h2>
          <span class="badge">14 situaciones · 3–5 min</span>
        </div>
        <p class="subtle">
          Imagina cada situación mientras conduces e indica cuánto enojo te provocaría. No hay
          respuestas correctas o incorrectas.
        </p>
        <div class="notice safe">
          Realiza esta evaluación antes o después de conducir, cuando estés en un lugar seguro.
        </div>
        <form id="evalContextForm">
          <div class="form-grid">
            <div>
              <label for="moment">¿En qué momento estás?</label
              ><select id="moment" name="momento" required>
                ${MOMENTS.map((value) => `<option>${value}</option>`).join('')}
              </select>
            </div>
            <div>
              <label for="vehicle">Tipo de vehículo</label
              ><select id="vehicle" name="vehiculo" required>
                ${VEHICLES.slice(0, 4)
                  .map((value) => `<option>${value}</option>`)
                  .join('')}
              </select>
            </div>
            <div class="wide">
              <label for="mood">¿Cómo te sientes ahora?</label
              ><select id="mood" name="animo">
                ${MOODS.map((label, index) => `<option value="${index + 1}">${MOOD_ICONS[index]} ${label}</option>`).join('')}
              </select>
            </div>
            <label class="check wide"
              ><input type="checkbox" required /><span
                >Confirmo que estoy en un lugar seguro y no estoy conduciendo.</span
              ></label
            >
          </div>
          <div class="form-actions">
            <button class="button" type="submit">Comenzar mi evaluación ↗</button>
          </div>
          <div id="contextFeedback" class="feedback" hidden role="alert"></div>
        </form>
        ${resultNote()}
      </section>`
    );
  const i = state.evalStep;
  return (
    heading('Mi autoevaluación', 'Piensa en cada situación y responde a tu propio ritmo.') +
    /* HTML */ `<section class="card eval-context">
      <div class="eval-progress">
        <span>SITUACIÓN ${i + 1} DE 14</span
        ><span>${state.answers.filter(Boolean).length} respondidas</span>
      </div>
      <div class="track"><span data-width="${((i + 1) / 14) * 100}"></span></div>
      <h2 class="eval-question">${escape(state.evalQuestionnaire.preguntas[i])}</h2>
      <p class="subtle">¿Cuánto enojo te provocaría esta situación?</p>
      <div class="eval-options" role="group" aria-label="Cuánto enojo te provoca">
        ${LABELS.map((l, j) => /* HTML */ `<button class="answer ${state.answers[i] === j + 1 ? 'selected' : ''}" data-action="answer" data-value="${j + 1}" aria-pressed="${state.answers[i] === j + 1}"><strong>${j + 1}</strong>${l}</button>`).join('')}
      </div>
      <div class="question-nav">
        <button class="button ghost" data-action="eval-prev">
          ← ${i === 0 ? 'Contexto' : 'Anterior'}</button
        ><button
          class="button"
          data-action="eval-next"
          ${!state.answers[i] || state.evaluationSaving ? 'disabled' : ''}
        >
          ${i === 13 ? 'Guardar y ver resultado' : 'Siguiente'} ↗
        </button>
      </div>
      <div class="question-dots" aria-label="Saltar a una pregunta">
        ${state.answers.map((a, j) => /* HTML */ `<button data-action="eval-jump" data-value="${j}" class="${a ? 'done ' : ''}${j === i ? 'current' : ''}" aria-label="Pregunta ${j + 1}${a ? ', respondida' : ''}"></button>`).join('')}
      </div>
      <div id="evalFeedback" class="feedback" hidden role="alert"></div>
    </section>`
  );
}

function resultModal(ev) {
  const advice = recommendations(ev);
  const top = (ev.respuestas || [])
    .map((value, i) => ({ value, text: ev.question_texts?.[i] || QUESTIONS[i]?.[0] }))
    .filter((q) => q.value >= 4 && q.text)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);
  const max = [
    ['Avance impedido', ev.prom_avance],
    ['Conducción temeraria', ev.prom_temeraria],
    ['Hostilidad directa', ev.prom_hostilidad],
  ].sort((a, b) => Number(b[1]) - Number(a[1]))[0];
  openModal(
    'Tu resultado',
    score(ev) +
      /* HTML */ `<p class="status-detail">
          Momento: ${escape(ev.momento || 'No indicado')}<br />Vehículo:
          ${escape(ev.vehiculo || 'No indicado')}<br />Estado de ánimo:
          ${escape(MOODS[Number(ev.animo) - 1] || 'No indicado')}
        </p>
        <div class="notice">
          El factor con mayor promedio es <strong>${max[0]}</strong>. Observa qué situaciones
          influyen más en tus respuestas y anota lo que quieras recordar en tu diario.
        </div>
        <section class="result-advice">
          <h3>Ideas para tu próximo recorrido</h3>
          <ul>
            ${advice.items.map((item) => `<li>${escape(item)}</li>`).join('')}
          </ul>
        </section>
        ${top.length ? `<section class="result-advice"><h3>Situaciones que más enojo te generan</h3><ul>${top.map((q) => `<li>${escape(q.text)} <strong>${q.value}/5</strong></li>`).join('')}</ul></section>` : ''}
        ${resultNote()}
        <div id="modalReportStatus">${reportReadiness()}</div>
        <div class="form-actions">
          <button class="button secondary" data-action="result-calm">Tomarme una pausa ↗</button
          ><button class="button ghost" data-action="copy-result" data-id="${escape(ev.id)}">
            Copiar resumen</button
          ><button class="button" data-action="close-modal">Entendido</button>
        </div>`,
  );
}

// El ejercicio de respiración solo mantiene estado local; no guarda registros.
const patterns = {
  box: {
    name: '4 · 4 · 4 · 4',
    phases: [
      ['Inhala', 4],
      ['Retén', 4],
      ['Exhala', 4],
      ['Pausa', 4],
    ],
  },
  relax: {
    name: '4 · 7 · 8',
    phases: [
      ['Inhala', 4],
      ['Retén', 7],
      ['Exhala', 8],
    ],
  },
  gentle: {
    name: '5 · 5',
    phases: [
      ['Inhala', 5],
      ['Exhala', 5],
    ],
  },
};

function calm() {
  return (
    heading('Tu momento de calma', 'Baja el ritmo. Este momento es para ti.') +
    /* HTML */ `<section class="card breathing-layout">
      <span class="section-tag">RESPIRACIÓN GUIADA</span>
      <div class="pattern-tabs" role="group" aria-label="Patrón de respiración">
        ${Object.entries(patterns)
          .map(
            ([k, p]) =>
              /* HTML */ `<button
                data-action="pattern"
                data-value="${k}"
                class="${state.pattern === k ? 'active' : ''}"
                aria-pressed="${state.pattern === k}"
              >
                ${p.name}
              </button>`,
          )
          .join('')}
      </div>
      <div class="breathing-stage">
        <div class="breathing-orb" id="breathOrb">
          <strong id="breathPhase">A tu ritmo</strong
          ><span id="breathCount">Un momento para respirar</span>
        </div>
      </div>
      <div class="breath-actions">
        <button class="button" data-action="breath-toggle" id="breathToggle">Comenzar ↗</button
        ><button class="button ghost" data-action="breath-reset">Reiniciar</button>
      </div>
      <p id="breathCycles" role="status">Elige el patrón con el que te sientas más cómodo.</p>
      <div class="notice safe">
        Practica solo cuando estés detenido en un lugar seguro. Mantén una respiración cómoda y
        detén el ejercicio si te incomoda.
      </div>
    </section>`
  );
}

function stopBreathing() {
  clearInterval(breathTimer);
  breathTimer = null;
  state.breathing = false;
  if ($('breathOrb')) {
    $('breathOrb').style.transitionDuration = '0s';
    $('breathOrb').style.transform = 'scale(1)';
    $('breathPhase').textContent = 'A tu ritmo';
    $('breathCount').textContent = 'Ejercicio detenido';
    $('breathToggle').textContent = 'Comenzar de nuevo ↗';
    $('breathCycles').textContent = 'Pulsa comenzar cuando quieras retomar el ejercicio.';
  }
}

function startBreathing() {
  if (state.breathing) {
    stopBreathing();
    $('breathToggle').textContent = 'Comenzar de nuevo ↗';
    return;
  }
  state.breathing = true;
  const phases = patterns[state.pattern].phases;
  let phase = 0,
    elapsed = 0,
    cycles = 0;
  let last = performance.now();
  $('breathToggle').textContent = 'Detener';
  function paint() {
    if (!$('breathOrb') || state.view !== 'calma') {
      stopBreathing();
      return;
    }
    const [label, seconds] = phases[phase];
    $('breathPhase').textContent = label;
    $('breathCount').textContent = Math.max(1, Math.ceil(seconds - elapsed)) + ' segundos';
    $('breathOrb').style.transitionDuration = seconds + 's';
    $('breathOrb').style.transform =
      label === 'Inhala' || label === 'Retén' ? 'scale(1.13)' : 'scale(.9)';
    $('breathCycles').textContent =
      `${cycles} ${cycles === 1 ? 'ciclo completado' : 'ciclos completados'} · Sigue el ritmo de la esfera.`;
  }
  paint();
  breathTimer = setInterval(() => {
    if (document.hidden) {
      stopBreathing();
      return;
    }
    const now = performance.now();
    elapsed += (now - last) / 1000;
    last = now;
    while (elapsed >= phases[phase][1]) {
      elapsed -= phases[phase][1];
      phase = (phase + 1) % phases.length;
      if (phase === 0) cycles++;
    }
    paint();
  }, 200);
}

// Formularios de perfil y vista administrativa. Los permisos finales los aplica RLS.
function field(id, label, value = '', type = 'text', extra = '') {
  return /* HTML */ `<div>
    <label for="${id}">${label}</label
    ><input id="${id}" name="${id}" type="${type}" value="${escape(value)}" ${extra} />
  </div>`;
}

function profile() {
  const p = state.profile || {};
  return (
    heading(
      p.id ? 'Mi perfil' : 'Completa tu perfil',
      p.id
        ? 'Tus datos personales y de contacto, compartidos con la app móvil.'
        : 'Un último paso para empezar tu recorrido.',
      p.id
        ? `<button class="button" data-action="edit-profile">${icon('edit')} Editar mis datos</button>`
        : '',
    ) +
    /* HTML */ `<section class="card narrow">
      <div class="profile-summary">
        <span class="avatar" id="profilePhoto">${escape(name().slice(0, 2).toUpperCase())}</span>
        <div>
          <h2>${escape(name())}</h2>
          <p>${escape(state.session.user.email)}</p>
        </div>
      </div>
      <form id="avatarForm" class="photo-panel">
        <label for="avatarFile">Foto de perfil de la web</label>
        <p class="subtle">
          JPG, PNG o WebP · máximo 2 MB. Se recorta al centro y se guarda de forma privada.
        </p>
        <input
          id="avatarFile"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required
          aria-describedby="avatarFeedback"
        />
        <div class="form-actions">
          <button class="button secondary" type="submit">Guardar foto</button
          ><button
            class="button ghost"
            type="button"
            data-action="remove-avatar"
            ${!state.avatarUrl ? 'disabled' : ''}
          >
            Quitar foto
          </button>
        </div>
        <div id="avatarFeedback" class="feedback" role="alert" hidden></div>
      </form>
      ${!p.id ? '<div class="notice">Tu cuenta está creada. Completa los datos de tu perfil para guardar evaluaciones y registros.</div>' : ''}
      <form id="profileForm">
        <fieldset class="profile-fields" ${p.id && !state.profileEditing ? 'disabled' : ''}>
          <div class="form-grid">
            ${field('nombres', 'Nombres', p.nombres, 'text', 'required maxlength="100" autocomplete="given-name"')}${field('apellido_paterno', 'Apellido paterno', p.apellido_paterno, 'text', 'maxlength="100" autocomplete="family-name"')}${field('apellido_materno', 'Apellido materno', p.apellido_materno, 'text', 'maxlength="100"')}${field('usuario', 'Nombre de usuario', p.usuario, 'text', 'required maxlength="50" autocomplete="username"')}${field('documento', 'Documento de identidad (opcional)', p.documento, 'text', 'maxlength="30"')}${field('edad', 'Edad', p.edad, 'number', 'required min="18" max="99" step="1"')}
            <div>
              <label for="genero">Género</label
              ><select id="genero" name="genero">
                ${['Masculino', 'Femenino', 'Otro', 'Prefiero no decirlo'].map((v) => /* HTML */ `<option ${p.genero === v ? 'selected' : ''}>${v}</option>`).join('')}
              </select>
            </div>
            ${field('telefono', 'Teléfono', p.telefono, 'tel', 'maxlength="30" autocomplete="tel"')}${field('direccion', 'Dirección', p.direccion, 'text', 'maxlength="250" autocomplete="street-address"')}
          </div>
          <div class="feedback" id="profileFeedback" hidden role="alert"></div>
          <div class="form-actions">
            <button class="button" type="submit">Guardar perfil ↗</button>
          </div>
        </fieldset>
      </form>
      <p class="status-detail">${roleLabel(p.rol)} · Los permisos se validan en el servidor.</p>
    </section>`
  );
}

function paintAvatar() {
  const initials = escape(name().slice(0, 2).toUpperCase());
  let photo = '';
  if (state.avatarUrl) {
    try {
      const url = new URL(state.avatarUrl);
      if (
        url.protocol === 'https:' &&
        url.hostname === 'wezudavlgzyevhlchuww.supabase.co' &&
        url.pathname.startsWith('/storage/v1/object/sign/calmavial-avatars/')
      )
        photo = `<img src="${escape(url.href)}" alt="Foto de perfil" referrerpolicy="no-referrer" />`;
    } catch {
      /* Una URL inesperada nunca se inserta en la interfaz. */
    }
  }
  document.querySelectorAll('#userAvatar, #profilePhoto').forEach((element) => {
    element.innerHTML = photo || initials;
  });
  const remove = document.querySelector('[data-action="remove-avatar"]');
  if (remove) remove.disabled = !photo;
}

async function loadAvatar() {
  if (!state.session) return;
  const revision = state.revision;
  try {
    const url = await api.avatar(state.session.user.id);
    if (revision !== state.revision) return;
    state.avatarUrl = url;
    state.avatarCheckedAt = Date.now();
    paintAvatar();
  } catch {
    /* La foto nunca bloquea las evaluaciones ni oculta errores de guardado. */
  }
}

async function loadNotices() {
  if (!state.session) return;
  const request = ++noticesRequest;
  const revision = state.revision;
  const admin = state.profile?.rol === 'admin';
  try {
    const rows = await api.notices(admin);
    const audit = admin ? await api.noticeAudit() : [];
    if (
      revision !== state.revision ||
      request !== noticesRequest ||
      admin !== (state.profile?.rol === 'admin')
    )
      return;
    state.notices = rows || [];
    state.noticeAudit = audit || [];
    state.noticesError = null;
  } catch (error) {
    if (revision !== state.revision || request !== noticesRequest) return;
    state.noticesError = errorText(error);
  }
  if (state.view === 'avisos' && !$('modal').open) render();
}

function notices() {
  const admin = state.profile?.rol === 'admin';
  return (
    heading(
      'Avisos de la plataforma',
      'Información publicada por la administración.',
      admin ? '<button class="button" data-action="new-notice">Publicar aviso ＋</button>' : '',
    ) +
    (state.noticesError
      ? `<div class="feedback" role="alert">${escape(state.noticesError)}</div><button class="button ghost" data-action="refresh-notices">Volver a cargar</button>`
      : state.notices === null
        ? '<div class="loading-state">Cargando avisos…</div>'
        : state.notices
            .map(
              (notice) =>
                `<article class="card notice-card"><div class="card-title"><h2>${escape(notice.titulo)}</h2><span class="badge">${notice.activo ? 'Publicado' : 'Archivado'}</span></div><p class="notice-message">${escape(notice.mensaje)}</p><p class="mini-note">Publicado el ${date(notice.creado_en)}</p>${admin ? `<div class="form-actions"><button class="button ghost" data-action="edit-notice" data-id="${escape(notice.id)}">Editar</button><button class="button ghost" data-action="toggle-notice" data-id="${escape(notice.id)}">${notice.activo ? 'Archivar' : 'Reactivar'}</button></div>` : ''}</article>`,
            )
            .join('') || empty('Sin avisos', 'Los avisos de la administración aparecerán aquí.')) +
    (admin && state.noticeAudit.length
      ? `<section class="card"><h2>Historial administrativo</h2><p class="subtle">Últimas 30 acciones. El servidor registra quién realizó cada cambio.</p><div class="table-wrap"><table class="data-table"><thead><tr><th>Fecha</th><th>Acción</th><th>Cuenta administradora</th></tr></thead><tbody>${state.noticeAudit.map((row) => `<tr><td>${date(row.creado_en)}</td><td>${escape(row.accion)}</td><td>${escape(state.admin?.profiles.find((p) => p.id === row.actor_id)?.correo || row.actor_id)}</td></tr>`).join('')}</tbody></table></div></section>`
      : '')
  );
}

function noticeForm(notice = {}) {
  openModal(
    notice.id ? 'Editar aviso' : 'Publicar aviso',
    `<form id="noticeForm" data-id="${escape(notice.id || '')}"><label for="noticeTitle">Título</label><input id="noticeTitle" name="titulo" value="${escape(notice.titulo || '')}" required minlength="5" maxlength="100" /><label for="noticeMessage">Mensaje</label><textarea id="noticeMessage" name="mensaje" required minlength="10" maxlength="2000">${escape(notice.mensaje || '')}</textarea><p class="mini-note">El aviso publicado será visible para las cuentas de la plataforma. No incluyas datos personales.</p><div id="noticeFeedback" class="feedback" role="alert" hidden></div><div class="form-actions"><button class="button" type="submit">Guardar aviso</button><button class="button ghost" type="button" data-action="close-modal">Cancelar</button></div></form>`,
  );
}

function systemOverview() {
  return governance.view();
}

function admin() {
  if (!state.admin)
    return (
      heading('Panel de administración', 'Conectando la gestión de tu comunidad.') +
      '<div class="loading-state"><div class="spinner"></div>Cargando datos autorizados…</div>'
    );
  const population = adminPopulation(state);
  const summary = adminSummary(population.evaluations);
  const threads = managementController.items;
  return `<section class="admin-welcome"><div><span class="eyebrow">CENTRO DE GESTIÓN · CALMA VIAL</span><h1>Tu comunidad,<br />con acompañamiento.</h1><p>Revisa evaluaciones, observa tendencias y responde a los usuarios desde un espacio de administración propio.</p><a class="button" href="#usuarios">${icon('users')} Gestionar usuarios</a></div><div class="admin-welcome-art" aria-hidden="true">${icon('chart')}<span>Observar. Orientar. Acompañar.</span></div></section>
    <div class="platform-metrics"><a class="metric-card" href="#usuarios"><span>Comunidad</span><strong>${population.profiles.length}</strong><small>Cuentas registradas · Ver usuarios ↗</small></a><a class="metric-card" href="#evaluaciones-admin"><span>Evaluaciones</span><strong>${summary.count}</strong><small>Registros autorizados · Ver evaluaciones ↗</small></a><a class="metric-card" href="#pendientes"><span>Atención pendiente</span><strong>${threads ? threads.filter((row) => !row.eliminado && row.estado !== 'resuelta').length : '—'}</strong><small>Consultas por atender · Abrir bandeja ↗</small></a><a class="metric-card" href="#participacion"><span>Participación</span><strong>${population.profiles.filter((p) => p.rol === 'usuario' && population.evaluations.some((ev) => ev.usuario_id === p.id)).length}</strong><small>Usuarios con evaluaciones · Ver participación ↗</small></a></div>
    <div class="admin-shortcuts"><a class="card" href="#usuarios">${icon('users')}<h2>Usuarios y evolución</h2><p>Datos, respuestas y gráficos individuales.</p></a><a class="card" href="#sugerencias">${icon('chat')}<h2>Bandeja de atención</h2><p>Responder, moderar y dar seguimiento.</p></a><a class="card" href="#avisos">${icon('edit')}<h2>Avisos de la plataforma</h2><p>Publicar y gestionar información para la comunidad.</p></a></div>
    <section class="card"><h2>Qué puedes gestionar</h2><p class="subtle">Abre una tarjeta para consultar sus registros. Usuarios permite editar perfiles, suspender accesos y gestionar bajas; la bandeja reúne las consultas y los avisos comunican información a la comunidad.</p></section>`;
}

function users() {
  if (!state.admin)
    return (
      heading('Administración', 'Información de las cuentas autorizadas.') +
      '<div class="loading-state"><div class="spinner"></div>Cargando datos autorizados…</div>'
    );
  return (
    heading(
      'Usuarios y evolución',
      'Busca cuentas, consulta su evolución y administra su acceso.',
      '<div class="form-actions"><button class="button ghost" data-action="govern-deleted">Usuarios eliminados (' +
        state.deletedUsers.length +
        ')</button><a class="button ghost" href="#admin">Volver al panel</a></div>',
    ) +
    `      <section class="card">
        <div class="card-title">
          <div>
            <h2>Comunidad Calma Vial</h2>
            <p class="subtle">Usuarios y administradores · acceso según permisos</p>
          </div>
        </div>
        <div class="toolbar">
          <input
            id="adminSearch"
            type="search"
            placeholder="Buscar por nombre o correo"
            aria-label="Buscar usuarios"
            value="${escape(state.adminSearch)}"
          />
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Rol</th>
                <th>Evaluaciones</th>
                <th>Último nivel</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="adminRows">
              ${adminRows(state.adminSearch)}
            </tbody>
          </table>
        </div>
        <p class="mini-note">
          Selecciona una cuenta para revisar respuestas, ver su evolución, editar sus datos o enviar
          una orientación privada. Las acciones administrativas quedan auditadas.
        </p>
      </section>`
  );
}

function adminRows(query) {
  return (
    adminPopulation(state)
      .profiles.filter((p) =>
        [p.nombres, p.apellido_paterno, p.correo]
          .join(' ')
          .toLowerCase()
          .includes(query.toLowerCase()),
      )
      .map((p) => {
        const es = state.admin.evaluations.filter((e) => e.usuario_id === p.id);
        return /* HTML */ `<tr>
          <td>
            ${escape([p.nombres, p.apellido_paterno].filter(Boolean).join(' ') || 'Sin nombre')}
          </td>
          <td>${escape(p.correo)}</td>
          <td>
            <span class="role-pill ${p.rol === 'admin' ? 'is-admin' : ''}"
              >${roleLabel(p.rol)}</span
            >
          </td>
          <td>${es.length}</td>
          <td>${badge(es[0]?.nivel)}</td>
          <td>
            <div class="user-actions">
              <button class="text-button" data-action="manage-user" data-id="${escape(p.id)}">
                Ver evolución ↗
              </button>
              ${p.rol === 'usuario' ? `<button class="text-button" data-action="govern-account" data-id="${escape(p.id)}">${state.removedUsers.some((item) => item.usuario_id === p.id) ? 'Reactivar acceso' : 'Suspender acceso'}</button><span class="account-status ${state.removedUsers.some((item) => item.usuario_id === p.id) ? 'suspended' : ''}">${state.removedUsers.some((item) => item.usuario_id === p.id) ? 'Suspendido' : 'Activo'}</span><button class="text-button danger-text" data-action="govern-delete" data-id="${escape(p.id)}">Eliminar usuario</button>` : ''}
            </div>
          </td>
        </tr>`;
      })
      .join('') || '<tr><td colspan="6">No hay usuarios que coincidan.</td></tr>'
  );
}

// Navegación por hash y actualización del contenido visible.
function navigate() {
  if (location.hash === '#iniciar-sesion') {
    if (state.session) void signOutAndShowLogin();
    return;
  }
  if (!state.session) return;
  const desired = location.hash.slice(1);
  if (state.evaluationSaving && desired !== 'evaluacion') {
    location.hash = 'evaluacion';
    toast('Espera a que termine el guardado de tu evaluación.');
    return;
  }
  let view = Object.hasOwn(titles, desired) ? desired : 'inicio';
  if (state.profile?.rol === 'admin' && view === 'inicio') view = 'admin';
  if (!state.profile) view = 'perfil';
  if (ADMIN_VIEWS.includes(view) && state.profile?.rol !== 'admin') view = 'inicio';
  if (state.view === 'calma' && view !== 'calma') stopBreathing();
  const viewChanged = state.view !== view;
  state.view = view;
  render();
  if (viewChanged) {
    window.scrollTo?.(0, 0);
    $('page').focus?.({ preventScroll: true });
  }
  if (ADMIN_VIEWS.includes(view) && !state.admin) loadAdmin();
  if (['sugerencias', 'pendientes'].includes(view)) {
    if (viewChanged) managementController.setFilter(view === 'pendientes' ? 'pendientes' : 'todas');
    if (state.profile?.rol === 'admin' && !state.admin) void loadAdmin();
    void managementController.load();
  }
  if (view === 'avisos') void loadNotices();
  if (view === 'informe') void refreshReport();
  if (view === 'papelera') void loadArchived();
}

function render() {
  if (!state.session) return;
  if (ADMIN_VIEWS.includes(state.view) && state.profile && state.profile.rol !== 'admin') {
    state.view = 'inicio';
    state.admin = null;
  }
  $('authScreen').hidden = true;
  $('appScreen').hidden = false;
  $('userName').textContent = name();
  $('userAvatar').textContent = name()
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  $('adminNav').hidden = state.profile?.rol !== 'admin';
  $('adminMenu').hidden = state.profile?.rol !== 'admin';
  $('appScreen').classList.toggle('is-admin', state.profile?.rol === 'admin');
  $('personalNavLabel').textContent = state.profile?.rol === 'admin' ? 'MI CUENTA' : 'MI CAMINO';
  $('accountRole').textContent = roleLabel(state.profile?.rol);
  $('breadcrumb').textContent = 'Mi espacio / ' + titles[state.view];
  document.title = `${titles[state.view]} · Calma Vial`;
  document.querySelectorAll('[data-view]').forEach((a) => {
    a.classList.toggle('active', a.dataset.view === state.view);
    a.toggleAttribute('aria-current', a.dataset.view === state.view);
    if (a.dataset.view === state.view) a.setAttribute('aria-current', 'page');
  });
  if (state.loading && !state.lastSync) {
    $('page').innerHTML =
      '<div class="loading-state"><div class="spinner"></div>Conectando con tu cuenta…</div>';
    return;
  }
  if (state.error) {
    $('page').innerHTML =
      heading('No pudimos cargar tu espacio', 'Tus datos siguen guardados en tu cuenta.') +
      /* HTML */ `<div class="feedback" role="alert">${escape(state.error)}</div>
        <button class="button" data-action="retry">Volver a intentar ↻</button>`;
    return;
  }
  // Conservar el ejercicio en curso ante actualizaciones de la misma vista.
  if (state.view === 'calma' && state.breathing && $('breathOrb')) return;
  $('page').innerHTML = {
    inicio: dashboard,
    historial: history,
    diario: journal,
    evaluacion: evaluation,
    calma: calm,
    perfil: profile,
    admin,
    usuarios: users,
    'evaluaciones-admin': () => (state.admin ? evaluationDashboard(state) : admin()),
    participacion: () => (state.admin ? participationDashboard(state) : admin()),
    pendientes: () => managementController.render(),
    sugerencias: () => managementController.render(),
    sistema: systemOverview,
    avisos: notices,
    informe: reportView,
    papelera: archiveView,
  }[state.view]();
  paintBars();
  paintAvatar();
}

// Cargar perfil y registros sin aplicar resultados de una sesión anterior.
async function loadData({ quiet = false } = {}) {
  if (!state.session || state.loading) return false;
  const revision = state.revision,
    userId = state.session.user.id;
  state.loading = true;
  state.error = null;
  $('syncState').textContent = 'Actualizando…';
  try {
    if (api.accountActive && !(await api.accountActive())) {
      if (revision !== state.revision) return false;
      await signOutAndShowLogin();
      feedback(
        'authFeedback',
        'El acceso de esta cuenta fue retirado. Contacta con administración.',
      );
      return false;
    }
    const p = await api.profile(userId);
    if (revision !== state.revision) return false;
    if (p?.rol !== state.profile?.rol) {
      state.notices = null;
      state.noticeAudit = [];
      state.admin = null;
    }
    state.profile = p;
    if (api.questionnaires) {
      const [catalog, versions] = await Promise.all([
        api.questionnaires(),
        api.evaluationVersions(),
      ]);
      if (revision !== state.revision) return false;
      state.catalog = catalog;
      state.evaluationVersions = versions;
    }
    if (p) {
      const [evaluations, diary] = await Promise.all([api.evaluations(userId), api.diary(userId)]);
      if (revision !== state.revision) return false;
      state.evaluations = (evaluations || []).map((row) => ({
        ...row,
        question_texts: questionsFor(row, state.catalog, state.evaluationVersions).preguntas,
        questionnaire_id: questionsFor(row, state.catalog, state.evaluationVersions).id,
      }));
      state.diary = diary || [];
    } else {
      state.evaluations = [];
      state.diary = [];
      state.admin = null;
    }
    state.lastSync = Date.now();
    $('syncState').textContent = 'Datos actualizados';
    $('syncState').title =
      `Última lectura: ${new Date(state.lastSync).toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}`;
    $('syncState').classList.remove('error-state');
    void refreshReport();
    if (Date.now() - state.avatarCheckedAt > 30 * 60 * 1000) void loadAvatar();
    return true;
  } catch (e) {
    if (revision !== state.revision) return false;
    if (!quiet) state.error = errorText(e);
    $('syncState').textContent = 'No se pudo sincronizar';
    $('syncState').classList.add('error-state');
    if (quiet) toast(errorText(e), true);
    return false;
  } finally {
    if (revision === state.revision) {
      state.loading = false;
      if (!quiet) navigate();
    }
  }
}

async function loadAdmin() {
  const revision = state.revision;
  try {
    const result = await api.admin();
    if (revision !== state.revision) return;
    if (api.accountStates) {
      const [removed, versions, deleted] = await Promise.all([
        api.accountStates(),
        api.evaluationVersions(),
        api.deletedAccounts ? api.deletedAccounts() : [],
      ]);
      if (revision !== state.revision) return;
      state.removedUsers = removed;
      state.deletedUsers = deleted;
      state.evaluationVersions = versions;
    }
    result.evaluations = result.evaluations.map((row) => ({
      ...row,
      question_texts: questionsFor(row, state.catalog, state.evaluationVersions).preguntas,
      questionnaire_id: questionsFor(row, state.catalog, state.evaluationVersions).id,
    }));
    state.admin = result;
    void managementController.load();
    if (ADMIN_VIEWS.includes(state.view)) render();
  } catch (e) {
    if (revision !== state.revision) return;
    state.admin = null;
    state.error = errorText(e);
    render();
  }
}

// Limpiar datos y formularios al entrar, salir o cambiar de usuario.
async function receiveSession(session) {
  const sameUser = state.session?.user.id === session?.user.id;
  if (sameUser && session) {
    state.session = session;
    return;
  }
  state.revision++;
  state.profileEditing = false;
  managementController.reset();
  governance.reset();
  state.catalog = [];
  state.removedUsers = [];
  state.deletedUsers = [];
  state.adminEvalSearch = '';
  state.adminLevel = '';
  state.participationStatus = 'todas';
  state.evaluationVersions = [];
  state.evalQuestionnaire = originalQuestionnaire();
  if (syncChannel) {
    db.removeChannel?.(syncChannel);
    syncChannel = null;
  }
  state.session = session;
  state.profile = null;
  state.evaluations = [];
  state.diary = [];
  state.admin = null;
  state.avatarUrl = null;
  state.avatarCheckedAt = 0;
  state.notices = null;
  state.noticeAudit = [];
  state.noticesError = null;
  state.lastSync = 0;
  reportRequest++;
  archiveRequest++;
  state.report = null;
  state.reportBlob = null;
  state.reportKey = null;
  state.reportStatus = 'locked';
  state.reportError = null;
  state.archived = null;
  state.archiveError = null;
  state.lastWrite = null;
  state.historySearch = '';
  state.adminSearch = '';
  state.historyFilter = '';
  state.diaryFilter = '';
  state.loading = false;
  state.error = null;
  state.evalStep = -1;
  state.evalRequestId = null;
  state.evaluationSaving = false;
  state.answers = Array(14).fill(null);
  stopBreathing();
  closeModal();
  $('authPass').value = '';
  $('authConfirmPass').value = '';
  if (!session) {
    $('page').replaceChildren();
    $('modalBody').replaceChildren();
    $('userName').textContent = '';
    $('userAvatar').textContent = '';
    $('accountRole').textContent = '';
    $('breadcrumb').textContent = '';
    $('adminNav').hidden = true;
    $('adminMenu').hidden = true;
    $('authScreen').hidden = false;
    $('appScreen').hidden = true;
    document.title = 'Calma Vial · Tu espacio para conducir en calma';
    return;
  }
  render();
  const revision = state.revision;
  await loadData();
  void loadAvatar();
  if (revision === state.revision && state.session?.user.id === session.user.id)
    subscribeToChanges();
}

// Realtime complementa el refresco periódico. Android ve los cambios al volver a consultar.
function subscribeToChanges() {
  if (!state.session || !db.channel) return;
  const uid = state.session.user.id;
  const evaluationFilter = state.profile?.rol === 'admin' ? {} : { filter: `usuario_id=eq.${uid}` };
  const onChange = () => {
    state.lastSync = 0;
    if (
      !document.hidden &&
      !$('modal').open &&
      !state.loading &&
      !state.breathing &&
      !['perfil', 'evaluacion'].includes(state.view)
    ) {
      loadData({ quiet: true }).then(() => {
        if (!state.session) return;
        if (ADMIN_VIEWS.includes(state.view) && state.profile?.rol === 'admin') {
          state.admin = null;
          loadAdmin();
        } else render();
      });
    }
  };
  syncChannel = db
    .channel(`calmavial:${uid}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'perfiles', filter: `id=eq.${uid}` },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'evaluaciones', ...evaluationFilter },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'diario', filter: `usuario_id=eq.${uid}` },
      onChange,
    )
    .subscribe();
}

const accessUI = window.CalmaAuthUI;
state.authMode = accessUI.getState().mode;
loginRole = accessUI.getState().role;
document.addEventListener('calma:auth-change', (event) => {
  state.authMode = event.detail.mode;
  loginRole = event.detail.role;
});
function authMode(mode) {
  accessUI.setMode(mode);
}

function recovery() {
  openModal(
    'Elige tu nueva contraseña',
    /* HTML */ `<form id="recoveryForm">
      <label for="newPassword">Nueva contraseña</label>
      <div class="password-field">
        <input
          id="newPassword"
          name="password"
          type="password"
          minlength="8"
          autocomplete="new-password"
          required
        />${passwordToggle('newPassword')}
      </div>
      <label for="confirmPassword">Repite la contraseña</label>
      <div class="password-field">
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          minlength="8"
          autocomplete="new-password"
          required
        />${passwordToggle('confirmPassword')}
      </div>
      <div id="recoveryFeedback" class="feedback" hidden role="alert"></div>
      <button class="button full" type="submit">Guardar nueva contraseña</button>
    </form>`,
  );
}

// Eventos de acceso y acciones de los formularios.
$('authForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (authPending || !accessUI.validate(true)) return;
  const attempt = accessUI.getState();
  if (attempt.service !== 'ready') return;
  const email = validateEmail($('authEmail').value);
  const password = $('authPass').value;
  feedback('authFeedback', '');
  authPending = true;
  accessUI.setBusy(true);
  let unacceptedSession = null;
  try {
    if (attempt.mode === 'signup') validatePassword(password, $('authConfirmPass').value);
    const result =
      attempt.mode === 'signup'
        ? await db.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: appRedirectUrl(location),
              data: {
                consentimiento_orientativo: true,
                consentimiento_fecha: new Date().toISOString(),
              },
            },
          })
        : await db.auth.signInWithPassword({ email, password });
    const data = unwrap(result);
    unacceptedSession = data.session;
    if (attempt.revision !== accessUI.getState().revision)
      throw new Error('Cambiaste la opción de acceso. Revisa los campos y vuelve a entrar.');
    if (data.session) {
      if (attempt.mode === 'login' && attempt.role) {
        const profile = await api.profile(data.session.user.id);
        if ((profile?.rol || 'usuario') !== attempt.role)
          throw new Error('Esta cuenta no tiene el rol seleccionado. Elige el acceso correcto.');
      }
      if (attempt.revision !== accessUI.getState().revision)
        throw new Error('Cambiaste la opción de acceso. Revisa los campos y vuelve a entrar.');
      if (location.hash === '#iniciar-sesion') location.hash = 'inicio';
      await receiveSession(data.session);
      unacceptedSession = null;
      $('authPass').value = '';
      $('authConfirmPass').value = '';
    } else if (attempt.mode === 'signup') {
      feedback(
        'authFeedback',
        'Revisa tu correo para confirmar tu cuenta y luego inicia sesión.',
        true,
      );
    } else throw new Error('No se pudo iniciar la sesión. Vuelve a intentarlo.');
  } catch (error) {
    if (unacceptedSession) {
      // Rechazar una sesión tardía sin cambiar la pestaña elegida por la persona.
      state.revision++;
      await receiveSession(null);
      try {
        unwrap(await db.auth.signOut({ scope: 'local' }));
      } catch {
        /* La vista privada ya está cerrada. */
      }
    }
    feedback('authFeedback', errorText(error));
  } finally {
    authPending = false;
    accessUI.setBusy(false);
  }
});
$('forgotBtn').addEventListener('click', () => {
  openModal(
    'Recupera tu acceso',
    /* HTML */ `<p>Te enviaremos un enlace para recuperar tu cuenta de Calma Vial.</p>
      <form id="forgotForm">
        <label for="recoveryEmail">Correo electrónico</label
        ><input
          type="email"
          name="email"
          id="recoveryEmail"
          autocomplete="email"
          value="${escape($('authEmail').value)}"
          required
        />
        <div class="feedback" id="forgotFeedback" hidden role="alert"></div>
        <button class="button full" type="submit">Enviar enlace de recuperación ↗</button>
      </form>`,
  );
});
async function signOutAndShowLogin() {
  if (signingOut) return;
  signingOut = true;
  const accessRevision = accessUI.getState().revision;
  try {
    unwrap(await db.auth.signOut({ scope: 'local' }));
    await receiveSession(null);
    if (accessRevision === accessUI.getState().revision) authMode('login');
    location.hash = 'iniciar-sesion';
    toast('Cerraste tu sesión en este dispositivo.');
  } catch (e) {
    if (state.session) toast(errorText(e), true);
    else feedback('authFeedback', errorText(e));
  } finally {
    signingOut = false;
  }
}
$('logoutBtn').addEventListener('click', () => busy($('logoutBtn'), signOutAndShowLogin));
$('refreshBtn').addEventListener('click', () => {
  if (state.view === 'calma' && state.breathing) {
    toast('Termina tu pausa antes de actualizar.');
    return;
  }
  if (['perfil', 'evaluacion'].includes(state.view)) {
    loadData({ quiet: true });
    return;
  }
  state.admin = null;
  loadData();
});
$('modalClose').addEventListener('click', closeModal);
document.addEventListener('change', (e) => {
  if (e.target.id === 'historyFilter') {
    state.historyFilter = e.target.value;
    render();
  }
  if (e.target.id === 'diaryFilter') {
    state.diaryFilter = e.target.value;
    render();
  }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'adminSearch') {
    state.adminSearch = e.target.value;
    $('adminRows').innerHTML = adminRows(e.target.value);
  }
  if (e.target.id === 'historySearch') {
    const value = e.target.value,
      position = e.target.selectionStart;
    state.historySearch = value;
    render();
    $('historySearch').focus();
    $('historySearch').setSelectionRange?.(position, position);
  }
});
document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (
    ![
      'diaryForm',
      'profileForm',
      'avatarForm',
      'noticeForm',
      'evalContextForm',
      'forgotForm',
      'recoveryForm',
    ].includes(form.id)
  )
    return;
  event.preventDefault();
  const fields = Object.fromEntries(new FormData(form));
  const formRevision = state.revision;
  const button = form.querySelector('[type=submit]');
  if (form.id === 'evalContextForm') {
    if (state.evaluationSaving) return;
    try {
      if (api.questionnaires) {
        state.catalog = await api.questionnaires();
        if (formRevision !== state.revision) return;
      }
      state.evalQuestionnaire =
        state.catalog.find((item) => item.vigente) || originalQuestionnaire();
    } catch (error) {
      feedback('contextFeedback', errorText(error));
      return;
    }
    state.context = fields;
    state.evalRequestId = crypto.randomUUID();
    state.evalStep = 0;
    state.answers = Array(14).fill(null);
    render();
    return;
  }
  await busy(button, async () => {
    try {
      if (form.id === 'avatarForm') {
        feedback('avatarFeedback', '');
        const uid = state.session.user.id;
        const file = $('avatarFile').files?.[0];
        const blob = await prepareAvatar(file);
        if (formRevision !== state.revision) return;
        await api.saveAvatar(uid, blob);
        if (formRevision !== state.revision) return;
        $('avatarFile').value = '';
        feedback('avatarFeedback', 'Tu foto se guardó en el almacenamiento privado.', true);
        await loadAvatar();
      }
      if (form.id === 'noticeForm') {
        if (state.profile?.rol !== 'admin')
          throw new Error('Solo un administrador puede gestionar avisos.');
        feedback('noticeFeedback', '');
        const saved = await api.saveNotice(
          state.session.user.id,
          fields,
          form.dataset.id || undefined,
        );
        if (formRevision !== state.revision) return;
        confirmWrite('calmavial_avisos', saved.id, form.dataset.id ? 'Actualizado' : 'Publicado');
        closeModal();
        toast('Aviso guardado por el servidor.');
        await loadNotices();
      }
      if (form.id === 'diaryForm') {
        feedback('diaryFeedback', '');
        fields.reaccion = composeReaction(fields.emocion || '', fields.reaccion);
        const saved = await api.saveDiary(
          state.session.user.id,
          fields,
          form.dataset.id || undefined,
        );
        if (formRevision !== state.revision) return;
        confirmWrite('diario', saved.id, form.dataset.id ? 'Actualizado' : 'Creado');
        state.diary = [saved, ...state.diary.filter((entry) => entry.id !== saved.id)];
        closeModal();
        render();
        toast('Tu registro se guardó en la misma cuenta de tu app.');
        void loadData({ quiet: true });
      }
      if (form.id === 'profileForm') {
        feedback('profileFeedback', '');
        const profile = await api.saveProfile(state.session.user, fields, Boolean(state.profile));
        if (formRevision !== state.revision) return;
        state.profile = profile;
        state.profileEditing = false;
        confirmWrite('perfiles', profile.id, 'Actualizado');
        location.hash = 'inicio';
        navigate();
        toast('Tu perfil está actualizado.');
        void loadData({ quiet: true });
      }
      if (form.id === 'forgotForm') {
        feedback('forgotFeedback', '');
        unwrap(
          await db.auth.resetPasswordForEmail(validateEmail(fields.email), {
            redirectTo: appRedirectUrl(location),
          }),
        );
        feedback(
          'forgotFeedback',
          'Si el correo está registrado, recibirás un enlace para recuperar tu acceso.',
          true,
        );
      }
      if (form.id === 'recoveryForm') {
        feedback('recoveryFeedback', '');
        validatePassword(fields.password, fields.confirmPassword);
        unwrap(await db.auth.updateUser({ password: fields.password }));
        closeModal();
        toast('Tu contraseña está actualizada para la web y la app.');
      }
    } catch (e) {
      if (formRevision !== state.revision) return;
      const feedbackIds = {
        diaryForm: 'diaryFeedback',
        profileForm: 'profileFeedback',
        forgotForm: 'forgotFeedback',
        recoveryForm: 'recoveryFeedback',
        avatarForm: 'avatarFeedback',
        noticeForm: 'noticeFeedback',
      };
      feedback(feedbackIds[form.id], errorText(e));
    }
  });
});

// Delegar los clics permite volver a renderizar las vistas sin duplicar listeners.
document.addEventListener('click', async (event) => {
  const link = event.target.closest('a[href^="#"]');
  if (
    link &&
    !event.defaultPrevented &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.altKey &&
    (!event.button || event.button === 0) &&
    Object.hasOwn(titles, link.getAttribute('href').slice(1))
  ) {
    event.preventDefault();
    location.hash = link.getAttribute('href');
    navigate();
    return;
  }
  const target = event.target.closest('[data-action]');
  if (!target || target.disabled) return;
  if (target.dataset.action === 'open-report') {
    closeModal();
    location.hash = 'informe';
    navigate();
    return;
  }
  if (target.dataset.action === 'retry-report') {
    if (state.reportStatus === 'loading') return;
    await refreshReport(true);
    return;
  }
  if (target.dataset.action === 'download-report') {
    if (state.reportStatus !== 'ready' || !state.reportBlob) return;
    downloadPdf(state.reportBlob, `CalmaVial-informe-${new Date().toISOString().slice(0, 10)}.pdf`);
    return;
  }
  if (target.dataset.action === 'admin-report' && state.profile?.rol === 'admin' && state.admin) {
    const profile = state.admin.profiles.find((row) => String(row.id) === target.dataset.id);
    if (!profile) return;
    const revision = state.revision;
    await busy(target, async () => {
      try {
        const report = await api.report(profile.id);
        const fonts = await loadReportFonts();
        if (revision !== state.revision || state.profile?.rol !== 'admin') return;
        const pdf = createReportPdf(report, await loadPdfEngine(), fonts);
        downloadPdf(
          pdf.output('blob'),
          `CalmaVial-informe-usuario-${new Date().toISOString().slice(0, 10)}.pdf`,
        );
        toast('Informe generado con las evaluaciones autorizadas.');
      } catch (error) {
        if (revision === state.revision) toast(errorText(error), true);
      }
    });
    return;
  }
  if (target.dataset.action === 'refresh-archive') {
    await loadArchived();
    return;
  }
  if (target.dataset.action === 'archive-record') {
    const type = target.dataset.type,
      id = target.dataset.id;
    const rows = type === 'evaluaciones' ? state.evaluations : type === 'diario' ? state.diary : [];
    if (!rows.some((row) => String(row.id) === id)) return;
    openModal(
      '¿Archivar este registro?',
      `<p>Se ocultará del historial habitual de la web y de Android al actualizar. No se borrará: podrás restaurarlo desde Papelera.</p><div id="archiveFeedback" class="feedback" role="alert" hidden></div><div class="form-actions"><button class="button ghost" data-action="close-modal">Conservar</button><button class="button" data-action="confirm-archive" data-type="${escape(type)}" data-id="${escape(id)}">Sí, archivar</button></div>`,
    );
    return;
  }
  if (target.dataset.action === 'confirm-archive' || target.dataset.action === 'restore-record') {
    if (!state.session) return;
    const revision = state.revision,
      type = target.dataset.type,
      id = target.dataset.id;
    const restoring = target.dataset.action === 'restore-record';
    await busy(target, async () => {
      try {
        await api.archive(type, id, restoring);
        if (revision !== state.revision) return;
        confirmWrite(type, id, restoring ? 'Restaurado' : 'Archivado');
        if (restoring)
          state.archived = (state.archived || []).filter(
            (row) => !(row.id === id && row.tipo === type),
          );
        else {
          state.archived = null;
          if (type === 'evaluaciones')
            state.evaluations = state.evaluations.filter((row) => String(row.id) !== id);
          if (type === 'diario') state.diary = state.diary.filter((row) => String(row.id) !== id);
        }
        state.admin = null;
        closeModal();
        void refreshReport();
        render();
        toast(
          restoring
            ? 'Registro restaurado.'
            : 'Registro archivado; puedes restaurarlo desde Papelera.',
        );
        void loadData({ quiet: true });
      } catch (error) {
        if (revision === state.revision) {
          if (restoring) toast(errorText(error), true);
          else feedback('archiveFeedback', errorText(error));
        }
      }
    });
    return;
  }
  if (target.dataset.action === 'refresh-notices') {
    await loadNotices();
    return;
  }
  if (target.dataset.action === 'new-notice' && state.profile?.rol === 'admin') {
    noticeForm();
    return;
  }
  if (target.dataset.action === 'edit-notice' && state.profile?.rol === 'admin') {
    const notice = state.notices?.find((row) => row.id === target.dataset.id);
    if (notice) noticeForm(notice);
    return;
  }
  if (target.dataset.action === 'toggle-notice' && state.profile?.rol === 'admin') {
    const notice = state.notices?.find((row) => row.id === target.dataset.id);
    if (!notice) return;
    const revision = state.revision;
    await busy(target, async () => {
      try {
        await api.setNoticeActive(notice.id, !notice.activo);
        if (revision !== state.revision) return;
        toast(notice.activo ? 'Aviso archivado.' : 'Aviso reactivado.');
        await loadNotices();
      } catch (error) {
        if (revision === state.revision) toast(errorText(error), true);
      }
    });
    return;
  }
  if (target.dataset.action === 'remove-avatar' && state.session) {
    openModal(
      '¿Quitar tu foto?',
      '<p>Se quitará tu foto de perfil. Puedes subir otra cuando quieras.</p><div id="avatarDeleteFeedback" class="feedback" role="alert" hidden></div><div class="form-actions"><button class="button ghost" data-action="close-modal">Conservar foto</button><button class="button danger" data-action="confirm-remove-avatar">Sí, quitar foto</button></div>',
    );
    return;
  }
  if (target.dataset.action === 'confirm-remove-avatar' && state.session) {
    const revision = state.revision;
    await busy(target, async () => {
      try {
        await api.removeAvatar(state.session.user.id);
        if (revision !== state.revision) return;
        state.avatarUrl = null;
        closeModal();
        paintAvatar();
        feedback('avatarFeedback', 'Tu foto se quitó del almacenamiento.', true);
      } catch (error) {
        if (revision === state.revision) feedback('avatarDeleteFeedback', errorText(error));
      }
    });
    return;
  }
  if (['edit-profile', 'edit-my-profile'].includes(target.dataset.action)) {
    state.profileEditing = true;
    if (target.dataset.action === 'edit-my-profile') {
      location.hash = 'perfil';
      state.view = 'perfil';
    }
    render();
    $('nombres')?.focus();
    return;
  }
  const action = target.dataset.action,
    id = target.dataset.id,
    actionRevision = state.revision;
  try {
    if (action === 'logout') {
      await busy(target, signOutAndShowLogin);
      return;
    }
    if (action === 'data-status') {
      dataStatus();
      return;
    }
    if (action === 'privacy') {
      openModal(
        'Privacidad y uso',
        /* HTML */ `<p>
            Calma Vial es una herramienta educativa de autoobservación. Sus resultados son
            orientativos y no sustituyen una evaluación profesional.
          </p>
          <p>
            La web utiliza el mismo servicio de autenticación y base de datos Supabase que la app
            Android. Tu perfil, tus respuestas y tu diario se guardan en esa cuenta. Tu contraseña
            se envía por HTTPS al servicio de autenticación.
          </p>
          <p>
            Los administradores autorizados del proyecto pueden consultar registros según los
            permisos de la base de datos. Usa la opción de cerrar sesión cuando termines en un
            equipo compartido.
          </p>
          <p>
            Realiza las evaluaciones y los ejercicios únicamente antes o después de conducir, en un
            lugar seguro.
          </p>`,
      );
      return;
    }
    if (action === 'close-modal') {
      closeModal();
      return;
    }
    if (!state.session) return;
    if (
      state.evaluationSaving &&
      ['answer', 'eval-prev', 'eval-jump', 'eval-next'].includes(action)
    )
      return;
    if (action === 'copy-result') {
      const ev = state.evaluations.find((e) => String(e.id) === id);
      if (!ev) return;
      const text = `Calma Vial · ${date(ev.creado_en)}\nDAS: ${ev.total}/70 · Promedio: ${number(ev.prom_general)}/5 · Nivel orientativo: ${ev.nivel}\nResultado educativo, sin valor diagnóstico.`;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        toast('Resumen copiado. Compártelo solo con quien tú decidas.');
      } else
        openModal(
          'Tu resumen',
          `<label for="resultText">Selecciona y copia este texto</label><textarea id="resultText" readonly>${escape(text)}</textarea>`,
        );
      return;
    }
    if (action === 'delete-evaluation') {
      const ev = state.evaluations.find((e) => String(e.id) === id);
      if (!ev) return;
      openModal(
        '¿Eliminar esta evaluación?',
        `<p>La evaluación del <strong>${date(ev.creado_en)}</strong> (${Number(ev.total)}/70) se eliminará de tu cuenta compartida. Dejará de aparecer en la web y en Android al actualizar. Esta acción no se puede deshacer.</p><div id="deleteEvaluationFeedback" class="feedback" role="alert" hidden></div><div class="form-actions"><button class="button ghost" data-action="close-modal">Conservar evaluación</button><button class="button danger" data-action="confirm-delete-evaluation" data-id="${escape(id)}">Sí, eliminar evaluación</button></div>`,
      );
      return;
    }
    if (action === 'confirm-delete-evaluation') {
      await busy(target, async () => {
        try {
          await api.deleteEvaluation(state.session.user.id, id);
          if (actionRevision !== state.revision) return;
          confirmWrite('evaluaciones', id, 'Eliminado');
          state.evaluations = state.evaluations.filter((row) => String(row.id) !== String(id));
          void refreshReport();
          state.admin = null;
          closeModal();
          render();
          toast('Evaluación eliminada de tu cuenta.');
          void loadData({ quiet: true });
        } catch (error) {
          feedback('deleteEvaluationFeedback', errorText(error));
        }
      });
      return;
    }
    if (action === 'retry') {
      await loadData();
      return;
    }
    if (action === 'new-diary') {
      diaryModal();
      return;
    }
    if (action === 'edit-diary') {
      const row = state.diary.find((r) => String(r.id) === id);
      if (row) diaryModal(row);
      return;
    }
    if (action === 'delete-diary') {
      const row = state.diary.find((r) => String(r.id) === id);
      if (!row) return;
      openModal(
        '¿Eliminar este registro?',
        /* HTML */ `<p>
            Se eliminará de tu cuenta y dejará de aparecer en la web y la app móvil. Esta acción no
            se puede deshacer.
          </p>
          <p><strong>${escape(row.situacion)}</strong></p>
          <div class="feedback" id="deleteFeedback" role="alert" hidden></div>
          <div class="form-actions">
            <button class="button ghost" data-action="close-modal">Conservar registro</button
            ><button
              class="button danger"
              data-action="confirm-delete-diary"
              data-id="${escape(id)}"
            >
              Sí, eliminar
            </button>
          </div>`,
      );
      return;
    }
    if (action === 'confirm-delete-diary') {
      await busy(target, async () => {
        try {
          await api.deleteDiary(state.session.user.id, id);
          if (actionRevision !== state.revision) return;
          confirmWrite('diario', id, 'Eliminado');
          state.diary = state.diary.filter((row) => String(row.id) !== String(id));
          closeModal();
          render();
          toast('Registro eliminado de tu cuenta.');
          void loadData({ quiet: true });
        } catch (e) {
          feedback('deleteFeedback', errorText(e));
        }
      });
      return;
    }
    if (action === 'result') {
      const ev = state.evaluations.find((e) => String(e.id) === id);
      if (ev) resultModal(ev);
      return;
    }
    if (action === 'result-calm') {
      closeModal();
      location.hash = 'calma';
      return;
    }
    if (action === 'answer') {
      state.answers[state.evalStep] = Number(target.dataset.value);
      render();
      document
        .querySelector(`[data-action="answer"][data-value="${target.dataset.value}"]`)
        ?.focus();
      return;
    }
    if (action === 'eval-prev') {
      state.evalStep--;
      render();
      return;
    }
    if (action === 'eval-jump') {
      state.evalStep = Number(target.dataset.value);
      render();
      return;
    }
    if (action === 'eval-next') {
      if (state.evalStep < 13) {
        state.evalStep++;
        render();
        return;
      }
      await busy(target, async () => {
        try {
          state.evaluationSaving = true;
          const result = calculate(state.answers);
          state.evalRequestId ||= crypto.randomUUID();
          const saved = await api.saveEvaluation(
            state.session.user.id,
            {
              ...result,
              ...state.context,
              questionnaireVersion: state.evalQuestionnaire.id,
            },
            state.evalRequestId,
          );
          if (actionRevision !== state.revision) return;
          saved.question_texts = [...state.evalQuestionnaire.preguntas];
          saved.questionnaire_id = state.evalQuestionnaire.id;
          state.evaluationSaving = false;
          confirmWrite('evaluaciones', saved.id, 'Guardado');
          state.evaluations = [saved, ...state.evaluations.filter((e) => e.id !== saved.id)];
          state.evalStep = -1;
          state.evalRequestId = null;
          state.answers = Array(14).fill(null);
          location.hash = 'historial';
          navigate();
          resultModal(saved);
          void refreshReport();
          toast('Evaluación guardada en tu cuenta.');
          void loadData({ quiet: true });
        } catch (e) {
          if (actionRevision !== state.revision) return;
          feedback('evalFeedback', errorText(e));
        } finally {
          if (actionRevision === state.revision) state.evaluationSaving = false;
        }
      });
      return;
    }
    if (action === 'pattern') {
      stopBreathing();
      state.pattern = target.dataset.value;
      render();
      return;
    }
    if (action === 'breath-toggle') {
      startBreathing();
      return;
    }
    if (action === 'breath-reset') {
      stopBreathing();
      render();
      return;
    }
  } catch (e) {
    toast(errorText(e), true);
  }
});
document.addEventListener('change', (event) => {
  if (state.profile?.rol !== 'admin') return;
  if (event.target.id === 'adminLevel') {
    state.adminLevel = event.target.value;
    render();
  }
  if (event.target.id === 'participationStatus') {
    state.participationStatus = event.target.value;
    render();
  }
});
document.addEventListener('input', (event) => {
  if (event.target.id !== 'adminEvalSearch' || state.profile?.rol !== 'admin') return;
  const position = event.target.selectionStart;
  state.adminEvalSearch = event.target.value;
  render();
  $('adminEvalSearch')?.focus();
  $('adminEvalSearch')?.setSelectionRange?.(position, position);
});
window.addEventListener('hashchange', navigate);
window.addEventListener('offline', () => {
  if (state.session) {
    $('syncState').textContent = 'Sin conexión';
    $('syncState').classList.add('error-state');
  }
});
window.addEventListener('online', () => {
  if (state.session) loadData({ quiet: true });
});

// No reemplazar formularios ni interrumpir el ejercicio mientras el usuario los usa.
async function autoRefresh() {
  if (
    !state.session ||
    document.hidden ||
    $('modal').open ||
    state.loading ||
    state.breathing ||
    ['evaluacion', 'perfil'].includes(state.view) ||
    Date.now() - state.lastSync < 40000
  )
    return;
  await loadData({ quiet: true });
  if (ADMIN_VIEWS.includes(state.view) && state.profile?.rol === 'admin') await loadAdmin();
  if (['sugerencias', 'pendientes'].includes(state.view)) await managementController.load();
  if (state.view === 'avisos') await loadNotices();
  if (!state.error && state.session) render();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.breathing) stopBreathing();
  if (!document.hidden) autoRefresh();
});
setInterval(autoRefresh, 45000);
window.addEventListener('beforeunload', (event) => {
  if (state.evalStep >= 0 && state.answers.some(Boolean)) {
    event.preventDefault();
    event.returnValue = '';
  }
});

// Diferir las consultas evita ejecutar llamadas a Supabase dentro del bloqueo de Auth.
db.auth.onAuthStateChange((event, session) => {
  const revision = state.revision;
  setTimeout(async () => {
    if (authPending && session) return;
    if (event === 'INITIAL_SESSION' && accessUI.getState().revision > 0) return;
    if (revision !== state.revision || (signingOut && session)) return;
    if (event === 'PASSWORD_RECOVERY') {
      await receiveSession(session);
      recovery();
    } else await receiveSession(session);
  }, 0);
});
$('today').textContent = new Date().toLocaleDateString('es-BO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'America/La_Paz',
});
// Los eventos están registrados antes de restaurar la sesión. Auth no bloquea las pestañas.
accessUI.setServiceState('ready');
async function restoreSession() {
  const revision = state.revision;
  const accessRevision = accessUI.getState().revision;
  try {
    if (location.hash === '#iniciar-sesion') await signOutAndShowLogin();
    else {
      const data = unwrap(await db.auth.getSession());
      if (
        revision !== state.revision ||
        accessRevision !== accessUI.getState().revision ||
        authPending
      )
        return;
      await receiveSession(data.session);
    }
  } catch (error) {
    feedback('authFeedback', errorText(error));
  }
}
void restoreSession();
