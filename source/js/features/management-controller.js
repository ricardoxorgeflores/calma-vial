import {
  inboxView,
  threadForm,
  threadDetail,
  adminUserDetail,
  evaluationDetail,
  adminProfileForm,
} from './management-views.js';
import { escapeHtml as e, displayName } from '../ui/format.js';

// El estado de las conversaciones pertenece a una sesión y se invalida al salir.
export function createManagementController({
  api,
  context,
  adminData,
  ensureAdmin,
  openModal,
  closeModal,
  render,
  toast,
  errorText,
  feedback,
  busy,
  profileChanged,
}) {
  let model = { items: null, loading: false, error: null, filter: 'todas' };
  let activeThread = null,
    replies = [],
    listRequest = 0,
    threadRequest = 0;
  const admin = () => context().profile?.rol === 'admin';
  const current = (stamp) => context().revision === stamp && Boolean(context().session);
  const find = (id) => model.items?.find((row) => row.id === id);
  function redraw() {
    if (['sugerencias', 'pendientes', 'admin'].includes(context().view)) render();
  }
  async function load() {
    if (!context().session || model.loading) return;
    const stamp = context().revision,
      ticket = ++listRequest;
    model.loading = true;
    model.error = null;
    redraw();
    try {
      const items = await api.threads();
      if (current(stamp) && ticket === listRequest) model.items = items;
    } catch (error) {
      if (current(stamp) && ticket === listRequest) model.error = errorText(error);
    } finally {
      if (current(stamp) && ticket === listRequest) {
        model.loading = false;
        redraw();
      }
    }
  }
  async function thread(id) {
    const row = find(id);
    if (!row) throw new Error('La conversación ya no está disponible. Actualiza la bandeja.');
    const stamp = context().revision,
      ticket = ++threadRequest;
    activeThread = row;
    openModal(
      'Conversación privada',
      '<div class="loading-state"><div class="spinner"></div>Cargando respuestas…</div>',
    );
    replies = await api.replies(id);
    if (!current(stamp) || ticket !== threadRequest || !document.getElementById('modal').open)
      return;
    openModal(
      'Conversación privada',
      threadDetail(row, replies, context().session.user, admin(), adminData()?.profiles || []),
    );
  }
  async function newThread(owner = null, evaluation = null) {
    const stamp = context().revision;
    if (admin()) await ensureAdmin();
    if (!current(stamp)) return;
    openModal(
      admin() ? 'Nuevo seguimiento' : 'Enviar sugerencia o consulta',
      threadForm({}, admin() ? adminData()?.profiles || [] : [], owner, evaluation),
    );
  }
  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action^="manage-"]');
    if (!button || button.disabled || !context().session) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const { action, id } = button.dataset;
    const stamp = context().revision;
    try {
      if (action === 'manage-filter') {
        model.filter = button.dataset.value;
        redraw();
        return;
      }
      if (action === 'manage-refresh') {
        await load();
        return;
      }
      if (action === 'manage-new') {
        await newThread();
        return;
      }
      if (action === 'manage-followup' && admin()) {
        await newThread(id, button.dataset.evaluation || null);
        return;
      }
      if (action === 'manage-thread') {
        await thread(id);
        return;
      }
      if (action === 'manage-edit-thread') {
        const row = find(id);
        if (row)
          openModal(
            admin() ? 'Editar o moderar conversación' : 'Editar mi mensaje',
            threadForm(row),
          );
        return;
      }
      if (action === 'manage-user' && admin()) {
        await ensureAdmin();
        if (!current(stamp)) return;
        const profile = adminData()?.profiles.find((row) => row.id === id);
        if (profile)
          openModal(
            'Seguimiento del usuario',
            adminUserDetail(
              profile,
              adminData().evaluations.filter((row) => row.usuario_id === id),
            ),
          );
        return;
      }
      if (action === 'manage-profile' && admin()) {
        const profile = adminData()?.profiles.find((row) => row.id === id);
        if (profile) openModal('Editar información del usuario', adminProfileForm(profile));
        return;
      }
      if (action === 'manage-evaluation' && admin()) {
        const row = adminData()?.evaluations.find(
          (row) => String(row.id) === id && row.usuario_id === button.dataset.owner,
        );
        if (row) openModal('Respuestas de la evaluación', evaluationDetail(row));
        return;
      }
      if (action === 'manage-edit-reply') {
        const row = replies.find((reply) => reply.id === id);
        if (!row) return;
        openModal(
          'Editar respuesta',
          `<form id="managementEditReplyForm" data-id="${e(id)}" data-thread="${e(activeThread.id)}"><label for="editReply">Respuesta</label><textarea id="editReply" name="mensaje" required minlength="5" maxlength="3000">${e(row.mensaje)}</textarea><div class="feedback" id="managementFeedback" role="alert" hidden></div><button type="submit" class="button">Guardar cambios</button></form>`,
        );
        return;
      }
      if (['manage-archive-thread', 'manage-archive-reply'].includes(action)) {
        const isThread = action === 'manage-archive-thread';
        const row = isThread ? find(id) : replies.find((reply) => reply.id === id);
        if (!row) return;
        openModal(
          row.eliminado ? '¿Restaurar el contenido?' : '¿Eliminar de la vista activa?',
          `<p>${row.eliminado ? 'El contenido volverá a aparecer.' : 'Se archivará de forma recuperable y quedará constancia en auditoría.'}</p><div id="managementFeedback" class="feedback" role="alert" hidden></div><div class="form-actions"><button class="button ghost" data-action="manage-thread" data-id="${e(isThread ? id : activeThread.id)}">Cancelar</button><button class="button" data-action="manage-confirm-archive" data-id="${e(id)}" data-kind="${isThread ? 'thread' : 'reply'}" data-restore="${row.eliminado ? 'true' : 'false'}">${row.eliminado ? 'Restaurar' : 'Eliminar de la vista'}</button></div>`,
        );
        return;
      }
      if (action === 'manage-confirm-archive') {
        await busy(button, async () => {
          try {
            const isThread = button.dataset.kind === 'thread';
            const row = await (isThread
              ? api.archiveThread(id, button.dataset.restore !== 'true')
              : api.archiveReply(id, button.dataset.restore !== 'true'));
            if (!current(stamp)) return;
            if (isThread) {
              model.items = model.items.map((item) => (item.id === id ? row : item));
              activeThread = row;
              closeModal();
              redraw();
            } else await thread(activeThread.id);
            toast(
              button.dataset.restore === 'true'
                ? 'Contenido restaurado.'
                : 'Contenido archivado; puede restaurarse.',
            );
          } catch (error) {
            if (current(stamp)) feedback('managementFeedback', errorText(error));
          }
        });
      }
    } catch (error) {
      if (current(stamp)) toast(errorText(error), true);
    }
  });
  document.addEventListener('change', async (event) => {
    const select = event.target.closest('[data-thread-status]');
    if (!select || !admin()) return;
    const stamp = context().revision;
    select.disabled = true;
    try {
      const row = await api.status(select.dataset.threadStatus, select.value);
      if (!current(stamp)) return;
      model.items = model.items.map((item) => (item.id === row.id ? row : item));
      activeThread = row;
      toast('Estado de la conversación actualizado.');
      redraw();
    } catch (error) {
      if (current(stamp)) {
        toast(errorText(error), true);
        if (activeThread) select.value = activeThread.estado;
      }
    } finally {
      select.disabled = false;
    }
  });
  document.addEventListener('submit', async (event) => {
    const form = event.target;
    if (
      ![
        'managementThreadForm',
        'managementReplyForm',
        'managementEditReplyForm',
        'managementProfileForm',
      ].includes(form.id)
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!context().session) return;
    const fields = Object.fromEntries(new FormData(form)),
      stamp = context().revision;
    const button = form.querySelector('[type="submit"]');
    if (button.disabled) return;
    await busy(button, async () => {
      try {
        feedback('managementFeedback', '');
        if (form.id === 'managementThreadForm') {
          const existing = find(form.dataset.id);
          const row = existing
            ? await api.updateThread(existing.id, { ...fields, tipo: existing.tipo })
            : await api.createThread(
                context().session.user.id,
                fields,
                admin()
                  ? fields.owner || form.dataset.owner || context().session.user.id
                  : context().session.user.id,
                form.dataset.evaluation || null,
              );
          if (!current(stamp)) return;
          model.items = [row, ...(model.items || []).filter((item) => item.id !== row.id)];
          closeModal();
          redraw();
          toast(existing ? 'Mensaje actualizado.' : 'Mensaje enviado y guardado en Supabase.');
          await thread(row.id);
        }
        if (form.id === 'managementReplyForm' || form.id === 'managementEditReplyForm') {
          if (form.id === 'managementReplyForm')
            await api.reply(context().session.user.id, form.dataset.thread, fields.mensaje);
          else await api.editReply(form.dataset.id, fields.mensaje);
          if (!current(stamp)) return;
          toast('Respuesta guardada.');
          await thread(form.dataset.thread);
        }
        if (form.id === 'managementProfileForm') {
          if (!admin()) throw new Error('Se requiere administración.');
          const row = await api.editProfile(form.dataset.id, fields);
          if (!current(stamp)) return;
          await profileChanged(row);
          closeModal();
          toast(`Datos de ${displayName(row)} actualizados con auditoría.`);
          render();
        }
      } catch (error) {
        if (current(stamp)) feedback('managementFeedback', errorText(error));
      }
    });
  });
  return {
    render: () => inboxView(model, admin()),
    load,
    setFilter(value) {
      model.filter = value;
    },
    reset() {
      listRequest++;
      threadRequest++;
      model = { items: null, loading: false, error: null, filter: 'todas' };
      activeThread = null;
      replies = [];
    },
    get items() {
      return model.items;
    },
  };
}
