/* Interacción de acceso sin dependencias: funciona antes de cargar el SDK y los módulos. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  if (!$('authForm') || window.CalmaAuthUI) return;
  const state = { mode: 'login', role: null, revision: 0, busy: false, service: 'loading' };
  const signup = () => state.mode === 'signup';
  const form = $('authForm');
  form.setAttribute('novalidate', '');

  function message(id, value) {
    const node = $(id);
    if (!node) return;
    node.textContent = value;
    node.hidden = !value;
  }

  function rules() {
    const password = $('authPass').value;
    return {
      length: password.length >= 8 && new TextEncoder().encode(password).length <= 72,
      upper: /\p{Lu}/u.test(password),
      lower: /\p{Ll}/u.test(password),
      digit: /\d/.test(password),
      special: /[^\p{L}\p{N}\s]/u.test(password),
      match: Boolean(password) && password === $('authConfirmPass').value,
    };
  }

  function fieldError(input, reveal = false) {
    const value = input.value || '';
    let error = '';
    if (input.id === 'authEmail') {
      if (!value.trim()) error = 'Escribe tu correo electrónico.';
      else if (value.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))
        error = 'Escribe un correo válido, por ejemplo nombre@correo.com.';
    } else if (input.id === 'authPass') {
      if (!value) error = 'Escribe tu contraseña.';
      else if (value.length < (signup() ? 8 : 6))
        error = `La contraseña debe tener al menos ${signup() ? 8 : 6} caracteres.`;
      else if (signup() && new TextEncoder().encode(value).length > 72)
        error = 'La contraseña admite como máximo 72 bytes; acórtala un poco.';
      else if (signup() && !['upper', 'lower', 'digit', 'special'].every((key) => rules()[key]))
        error = 'Incluye mayúscula, minúscula, número y un carácter especial, como ! @ # $.';
    } else if (input.id === 'authConfirmPass' && signup()) {
      if (!value) error = 'Repite tu contraseña.';
      else if (value !== $('authPass').value) error = 'Las contraseñas deben coincidir.';
    }
    const show = reveal || Boolean(value) || input.dataset.touched === 'true';
    const shownError = show ? error : '';
    input.setAttribute('aria-invalid', String(Boolean(shownError)));
    input.setCustomValidity?.(error);
    const id = {
      authEmail: 'authEmailValidation',
      authPass: 'authPasswordValidation',
      authConfirmPass: 'authConfirmValidation',
    }[input.id];
    message(id, shownError);
    return error;
  }

  function paintRules() {
    $('passwordRequirements').hidden = !signup() && !$('authPass').value;
    const values = rules();
    document.querySelectorAll('#passwordRequirements [data-rule]').forEach((item) => {
      const met = values[item.dataset.rule];
      item.classList.toggle('met', met);
      item.hidden = item.dataset.rule === 'match' && !signup();
      item.setAttribute('aria-label', `${item.textContent}: ${met ? 'cumplido' : 'pendiente'}`);
    });
  }

  function paint() {
    $('loginTab').setAttribute('aria-selected', String(!signup()));
    $('signupTab').setAttribute('aria-selected', String(signup()));
    $('loginTab').tabIndex = signup() ? -1 : 0;
    $('signupTab').tabIndex = signup() ? 0 : -1;
    $('authTitle').textContent = signup() ? 'Crea tu cuenta' : 'Bienvenido de nuevo';
    $('authIntro').textContent = signup()
      ? 'Empieza tu recorrido. Tu cuenta también funciona en la app móvil.'
      : 'Entra a tu espacio y continúa tu recorrido con más calma.';
    $('authPass').autocomplete = signup() ? 'new-password' : 'current-password';
    $('authPass').minLength = signup() ? 8 : 6;
    $('confirmPassWrap').hidden = !signup();
    $('authConfirmPass').required = signup();
    $('authConfirmPass').disabled = !signup() || state.busy;
    $('consentWrap').hidden = !signup();
    $('consent').required = signup();
    $('consent').disabled = !signup() || state.busy;
    $('forgotBtn').hidden = signup();
    $('authPasswordHint').textContent = signup()
      ? 'Mínimo 8 caracteres: mayúscula, minúscula, número y símbolo (! @ # $).'
      : 'Usa tu contraseña actual (mínimo 6 caracteres). Para una cuenta nueva se exige mayúscula, minúscula, número y símbolo.';
    $('loginRoleHint').textContent = signup()
      ? 'El registro público crea una cuenta de usuario.'
      : state.role === 'admin'
        ? 'Administrador: utiliza una cuenta con permisos autorizados.'
        : state.role === 'usuario'
          ? 'Usuario: accede a tus evaluaciones, diario e informes.'
          : 'Tu cuenta determina los permisos. Puedes elegir el perfil de acceso.';
    document.querySelectorAll('[data-action="login-role"]').forEach((button) => {
      button.disabled = false;
      button.setAttribute('aria-pressed', String(button.dataset.value === state.role));
    });
    $('authEmail').disabled = state.busy;
    $('authPass').disabled = state.busy;
    $('authSubmit').disabled = state.busy || state.service !== 'ready';
    $('authSubmit').setAttribute('aria-busy', String(state.busy));
    $('authSubmit').textContent = state.busy
      ? 'Comprobando acceso…'
      : signup()
        ? 'Crear mi cuenta'
        : 'Entrar a mi espacio';
    if (state.busy)
      message(
        'authProgress',
        'Solicitud en curso. Si cambias de opción, no se abrirá la sesión del intento anterior.',
      );
    else message('authProgress', '');
    paintRules();
  }

  function announce() {
    paint();
    document.dispatchEvent(new window.CustomEvent('calma:auth-change', { detail: { ...state } }));
  }

  function setMode(mode) {
    if (!['login', 'signup'].includes(mode)) return;
    if (state.mode !== mode) {
      state.mode = mode;
      state.revision++;
      $('authPass').value = '';
      $('authConfirmPass').value = '';
      for (const id of ['authPass', 'authConfirmPass']) {
        $(id).dataset.touched = 'false';
        fieldError($(id));
      }
    }
    if (signup()) state.role = 'usuario';
    message('authFeedback', '');
    message('roleNotice', '');
    announce();
  }

  function setRole(role) {
    if (!['usuario', 'admin'].includes(role)) return;
    const switched = state.role !== role || (role === 'admin' && signup());
    if (role === 'admin' && signup()) {
      state.mode = 'login';
      $('authPass').value = '';
      $('authConfirmPass').value = '';
      message(
        'roleNotice',
        'Las cuentas administradoras se autorizan desde el servidor. Ingresa con tu cuenta administrativa.',
      );
    } else message('roleNotice', '');
    state.role = role;
    if (switched) state.revision++;
    message('authFeedback', '');
    announce();
  }

  function validate(reveal = true) {
    const fields = ['authEmail', 'authPass', ...(signup() ? ['authConfirmPass'] : [])];
    const invalid = fields.filter((id) => Boolean(fieldError($(id), reveal)));
    if (signup() && !$('consent').checked) {
      message(
        'authFeedback',
        'Confirma tu edad y acepta la política de privacidad y uso para crear la cuenta.',
      );
      return false;
    }
    if (invalid.length) {
      $(invalid[0]).focus?.();
      return false;
    }
    return true;
  }

  window.CalmaAuthUI = {
    getState: () => ({ ...state }),
    setMode,
    setRole,
    validate,
    setBusy(value) {
      state.busy = Boolean(value);
      paint();
    },
    setServiceState(status, detail = '') {
      state.service = status;
      $('startupStatus').hidden = status === 'ready';
      $('startupStatus').textContent =
        detail ||
        (status === 'loading'
          ? 'Conectando el servicio de acceso…'
          : 'No se pudo conectar el acceso. Puedes revisar los campos y volver a cargar la conexión.');
      $('startupStatus').setAttribute('role', status === 'error' ? 'alert' : 'status');
      $('startupStatus').classList.toggle('connection-error', status === 'error');
      if ($('retryConnection')) $('retryConnection').hidden = status !== 'error';
      paint();
    },
  };

  if (location.protocol === 'file:') {
    if ($('runtimeNotice')) $('runtimeNotice').hidden = false;
    $('authScreen').hidden = true;
    return;
  }
  if ($('runtimeNotice')) $('runtimeNotice').hidden = true;
  $('authScreen').hidden = false;
  $('loginTab').addEventListener('click', () => setMode('login'));
  $('signupTab').addEventListener('click', () => setMode('signup'));
  document
    .querySelectorAll('[data-action="login-role"]')
    .forEach((button) => button.addEventListener('click', () => setRole(button.dataset.value)));
  for (const id of ['authEmail', 'authPass', 'authConfirmPass']) {
    $(id).addEventListener('input', () => {
      fieldError($(id));
      if (id === 'authPass' && signup() && $('authConfirmPass').value)
        fieldError($('authConfirmPass'));
      paintRules();
    });
    $(id).addEventListener('blur', () => {
      $(id).dataset.touched = 'true';
      fieldError($(id));
    });
  }
  $('showPass').addEventListener('click', () => {
    const show = $('authPass').type === 'password';
    $('authPass').type = show ? 'text' : 'password';
    $('showPass').textContent = show ? 'Ocultar' : 'Ver';
    $('showPass').setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
  });
  for (const id of ['loginTab', 'signupTab'])
    $(id).addEventListener('keydown', (event) => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        setMode(
          event.key === 'Home'
            ? 'login'
            : event.key === 'End'
              ? 'signup'
              : signup()
                ? 'login'
                : 'signup',
        );
        $(signup() ? 'signupTab' : 'loginTab').focus?.();
      }
    });
  form.addEventListener(
    'submit',
    (event) => {
      if (!validate(true) || state.busy || state.service !== 'ready') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (state.service !== 'ready')
          message('authFeedback', 'El acceso todavía no está conectado. Usa Reintentar conexión.');
      }
    },
    true,
  );
  $('retryConnection')?.addEventListener('click', () => location.reload());
  paint();
})();
