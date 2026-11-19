// Todo texto recibido del backend se escapa antes de incluirlo en una plantilla.
export const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );
export const displayDate = (value) =>
  Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleDateString('es-BO', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'America/La_Paz',
      })
    : 'Sin fecha';
export const displayName = (profile) =>
  [profile?.nombres, profile?.apellido_paterno].filter(Boolean).join(' ') || 'Cuenta de usuario';
