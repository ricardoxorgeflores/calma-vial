const shapes = {
  edit: '<path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15Z"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff:
    '<path d="m3 3 18 18M10 5a11 11 0 0 1 12 7 15 15 0 0 1-4 4M6 6a18 18 0 0 0-4 6s4 7 10 7a12 12 0 0 0 4-1"/>',
  chat: '<path d="M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 1 1 17-5Z"/><path d="M8 10h8M8 14h5"/>',
  users:
    '<circle cx="9" cy="8" r="3"/><path d="M2 21v-3a7 7 0 0 1 14 0v3M17 5a3 3 0 0 1 0 6M20 21v-3a6 6 0 0 0-2-4"/>',
  chart: '<path d="M4 3v17h17M8 14l4-5 4 3 5-7"/>',
  archive: '<path d="M3 4h18v5H3zM5 9v12h14V9M9 13h6"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
};
export const icon = (name) =>
  `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name] || shapes.arrow}</svg>`;
export const passwordToggle = (id) =>
  `<button class="password-toggle" type="button" data-password-toggle="${id}" aria-controls="${id}" aria-label="Mostrar contraseña" aria-pressed="false"><span data-eye="open">${icon('eye')}</span><span data-eye="closed" hidden>${icon('eyeOff')}</span></button>`;
