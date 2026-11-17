// Mantener deshabilitado el envío si no se pueden cargar el SDK o los módulos.
try {
  await import('./app.js');
} catch {
  const status = document.getElementById('startupStatus');
  status.textContent =
    'No se pudo iniciar el acceso seguro. Comprueba tu conexión y recarga la página.';
  status.className = 'feedback';
  status.setAttribute('role', 'alert');
  document.getElementById('authSubmit').disabled = true;
}
