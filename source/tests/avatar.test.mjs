import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAvatarFile, prepareAvatar } from '../js/features/avatar.js';
import { validateNotice } from '../js/domain/domain.js';

test('La foto rechaza formatos activos, exceso de tamaño y MIME falsificado', async () => {
  await assert.rejects(validateAvatarFile(new Blob(['<svg/>'], { type: 'image/svg+xml' })), /JPG/);
  await assert.rejects(
    validateAvatarFile(new Blob([new Uint8Array(2097153)], { type: 'image/jpeg' })),
    /2 MB/,
  );
  await assert.rejects(
    validateAvatarFile(new Blob(['no soy una imagen'], { type: 'image/jpeg' })),
    /contenido/,
  );
  await validateAvatarFile(new Blob([new Uint8Array([255, 216, 255, 0])], { type: 'image/jpeg' }));
});

test('La foto se recorta, se convierte a JPEG y libera la imagen decodificada', async () => {
  const originalDocument = globalThis.document;
  const originalBitmap = globalThis.createImageBitmap;
  let closed = 0;
  let argumentsDraw;
  const bitmap = { width: 800, height: 600, close: () => closed++ };
  globalThis.createImageBitmap = async () => bitmap;
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({
        fillRect() {},
        drawImage(...args) {
          argumentsDraw = args;
        },
      }),
      toBlob: (callback, type) => callback(new Blob(['jpeg'], { type })),
    }),
  };
  try {
    const result = await prepareAvatar(
      new Blob([new Uint8Array([255, 216, 255, 0])], { type: 'image/jpeg' }),
    );
    assert.equal(result.type, 'image/jpeg');
    assert.deepEqual(argumentsDraw.slice(1), [100, 0, 600, 600, 0, 0, 512, 512]);
    assert.equal(closed, 1);
    bitmap.width = 10000;
    bitmap.height = 10000;
    await assert.rejects(
      prepareAvatar(new Blob([new Uint8Array([255, 216, 255, 0])], { type: 'image/jpeg' })),
      /20 megapíxeles/,
    );
    assert.equal(closed, 2);
  } finally {
    globalThis.document = originalDocument;
    globalThis.createImageBitmap = originalBitmap;
  }
});

test('Los avisos rechazan textos insuficientes y no aceptan propiedades administrativas', () => {
  assert.throws(() => validateNotice({ titulo: 'abc', mensaje: 'Un mensaje válido' }), /título/);
  assert.throws(() => validateNotice({ titulo: 'Título válido', mensaje: 'corto' }), /mensaje/);
  assert.deepEqual(
    validateNotice({
      titulo: ' Aviso válido ',
      mensaje: ' Mensaje publicado correctamente. ',
      activo: true,
      creado_por: 'otro',
    }),
    { titulo: 'Aviso válido', mensaje: 'Mensaje publicado correctamente.' },
  );
});
