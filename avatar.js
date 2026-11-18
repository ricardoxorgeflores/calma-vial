// Solo imágenes raster. El JPEG generado elimina metadatos y limita el tamaño almacenado.
export async function validateAvatarFile(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('Selecciona una foto JPG, PNG o WebP. No se admiten SVG ni GIF.');
  if (!file.size || file.size > 2 * 1024 * 1024)
    throw new Error('La foto debe pesar como máximo 2 MB.');
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value);
  const webp =
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (!(file.type === 'image/jpeg' ? jpeg : file.type === 'image/png' ? png : webp))
    throw new Error('El contenido de la foto no coincide con el formato indicado.');
}

export async function prepareAvatar(file) {
  await validateAvatarFile(file);
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    if (Math.min(bitmap.width, bitmap.height) < 32 || bitmap.width * bitmap.height > 20000000)
      throw new Error('Usa una foto de al menos 32 píxeles y como máximo 20 megapíxeles.');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo preparar la imagen en este navegador.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 512, 512);
    const side = Math.min(bitmap.width, bitmap.height);
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      512,
      512,
    );
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob || blob.size > 512 * 1024)
      throw new Error('No se pudo reducir la foto. Prueba otra imagen.');
    return blob;
  } catch (error) {
    if (error.name === 'InvalidStateError')
      throw new Error('El archivo no contiene una imagen válida.');
    throw error;
  } finally {
    bitmap?.close();
  }
}
