// La interfaz independiente permanece disponible si el SDK o los módulos fallan.
if (location.protocol !== 'file:') {
  let watchdog;
  try {
    await new Promise((resolve, reject) => {
      if (window.supabase?.createClient && window.CalmaAuthUI) return resolve();
      const started = Date.now();
      const timer = setInterval(() => {
        if (window.supabase?.createClient && window.CalmaAuthUI) {
          clearInterval(timer);
          resolve();
        } else if (Date.now() - started > 8000) {
          clearInterval(timer);
          reject(new Error('Servicio de acceso no disponible.'));
        }
      }, 50);
    });
    watchdog = setTimeout(
      () =>
        window.CalmaAuthUI.setServiceState(
          'error',
          'El inicio tardó demasiado. Reintenta la conexión.',
        ),
      10000,
    );
    await import('./app.js?v=1c52f699db4b');
  } catch {
    window.CalmaAuthUI?.setServiceState(
      'error',
      'No se pudo iniciar el acceso seguro. Reintenta la conexión. Las opciones y validaciones siguen disponibles.',
    );
  } finally {
    clearTimeout(watchdog);
  }
}
