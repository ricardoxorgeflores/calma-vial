import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { parseHTML } from 'linkedom';
const html = await readFile(new URL('../html/index.html', import.meta.url), 'utf8');
const source = await readFile(new URL('../js/auth/auth-ui.js', import.meta.url), 'utf8');
function setup(protocol = 'https:') {
  const { window, document } = parseHTML(html);
  // Linkedom comparte las propiedades globales del proxy window entre documentos.
  delete window.CalmaAuthUI;
  runInNewContext(source, { window, document, location: { protocol, reload() {} }, TextEncoder });
  const $ = (id) => document.getElementById(id);
  const click = (id) => $(id).dispatchEvent(new window.Event('click', { bubbles: true }));
  const input = (id, value) => {
    $(id).value = value;
    $(id).dispatchEvent(new window.Event('input', { bubbles: true }));
  };
  const role = (value) =>
    document
      .querySelector(`[data-action="login-role"][data-value="${value}"]`)
      .dispatchEvent(new window.Event('click', { bubbles: true }));
  return { $, click, input, role, ui: window.CalmaAuthUI, window, document };
}
test('Las pestañas y los dos roles responden sin SDK ni red', () => {
  const { $, click, role, ui } = setup();
  for (let i = 0; i < 8; i++) {
    click('signupTab');
    assert.equal($('authTitle').textContent, 'Crea tu cuenta');
    role('admin');
    assert.equal(ui.getState().mode, 'login');
    assert.equal(ui.getState().role, 'admin');
    role('usuario');
    assert.equal(ui.getState().role, 'usuario');
    click('loginTab');
    assert.equal($('confirmPassWrap').hidden, true);
  }
  assert.equal($('authSubmit').disabled, true);
});
test('Una conexión fallida muestra reintento sin desactivar roles y pestañas', () => {
  const { $, click, role, ui } = setup();
  ui.setServiceState('error');
  assert.equal($('retryConnection').hidden, false);
  assert.equal($('startupStatus').getAttribute('role'), 'alert');
  click('signupTab');
  role('admin');
  assert.equal(ui.getState().role, 'admin');
  assert.equal($('authSubmit').disabled, true);
});
test('Correo incorrecto, pocos caracteres y símbolo ausente producen alertas accesibles', () => {
  const { $, click, input } = setup();
  input('authEmail', 'sin-correo');
  assert.match($('authEmailValidation').textContent, /correo válido/);
  input('authPass', 'abc');
  assert.match($('authPasswordValidation').textContent, /al menos 6/);
  click('signupTab');
  input('authPass', 'Abcdef12');
  assert.match($('authPasswordValidation').textContent, /carácter especial/);
  assert.equal($('authPass').getAttribute('aria-invalid'), 'true');
  input('authPass', 'Abcdef12!');
  assert.equal($('authPasswordValidation').hidden, true);
});
test('Registro exige confirmación, consentimiento y límite UTF-8 de la contraseña', () => {
  const { $, click, input, ui } = setup();
  click('signupTab');
  input('authEmail', 'test@example.com');
  input('authPass', 'Abcdef12!');
  input('authConfirmPass', 'OtraClave1!');
  $('consent').checked = true;
  assert.equal(ui.validate(), false);
  assert.match($('authConfirmValidation').textContent, /coincidir/);
  input('authConfirmPass', 'Abcdef12!');
  $('consent').checked = false;
  assert.equal(ui.validate(), false);
  assert.match($('authFeedback').textContent, /privacidad/);
  $('consent').checked = true;
  assert.equal(ui.validate(), true);
  input('authPass', 'Aa1!' + 'é'.repeat(35));
  assert.match($('authPasswordValidation').textContent, /72 bytes/);
});
test('Cambiar de opción durante un envío permanece disponible y cambia la revisión', () => {
  const { $, click, role, ui } = setup();
  ui.setServiceState('ready');
  ui.setBusy(true);
  const revision = ui.getState().revision;
  click('signupTab');
  assert.equal($('signupTab').getAttribute('aria-selected'), 'true');
  role('admin');
  assert.ok(ui.getState().revision > revision);
  assert.equal($('authSubmit').disabled, true);
  ui.setBusy(false);
  assert.equal($('authSubmit').textContent, 'Entrar a mi espacio');
  assert.equal($('authSubmit').disabled, false);
});
test('Una contraseña vigente no recibe restricciones nuevas de registro', () => {
  const { input, ui } = setup();
  input('authEmail', 'test@example.com');
  input('authPass', 'abcdef');
  assert.equal(ui.validate(), true);
});
test('Abrir HTML por file muestra una explicación y oculta el formulario', () => {
  const { $ } = setup('file:');
  assert.equal($('runtimeNotice').hidden, false);
  assert.equal($('authScreen').hidden, true);
});

test('Los iconos de ojo muestran y ocultan login y confirmación sin enviar el formulario', () => {
  const { $, click, document, window } = setup();
  $('authPass').value = 'NoEsUnaClaveReal1!';
  click('showPass');
  assert.equal($('authPass').type, 'text');
  assert.equal($('showPass').getAttribute('aria-label'), 'Ocultar contraseña');
  click('showPass');
  assert.equal($('authPass').type, 'password');
  click('signupTab');
  const confirmation = document.querySelector('[data-password-toggle="authConfirmPass"]');
  confirmation.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal($('authConfirmPass').type, 'text');
  confirmation.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal($('authConfirmPass').type, 'password');
});
