export const THREAD_STATES = {
  abierta: 'Abierta',
  en_revision: 'En revisión',
  resuelta: 'Resuelta',
};
export const DIARY_INTENSITIES = ['Muy leve', 'Leve', 'Moderada', 'Intensa', 'Muy intensa'];
export const THREAD_TYPES = {
  sugerencia: 'Sugerencia',
  consulta: 'Consulta',
  seguimiento: 'Seguimiento',
};
export const EMOTIONS = {
  calmado: '😌 Calmado',
  furioso: '😠 Furioso',
  triste: '😢 Triste',
  ansioso: '😟 Ansioso',
  frustrado: '😣 Frustrado',
  otro: '💭 Otra emoción',
};
export function validateThread(fields) {
  const asunto = String(fields.asunto ?? '').trim();
  const mensaje = String(fields.mensaje ?? '').trim();
  if (asunto.length < 5 || asunto.length > 120)
    throw new Error('Escribe un asunto de 5 a 120 caracteres.');
  if (mensaje.length < 10 || mensaje.length > 3000)
    throw new Error('Escribe un mensaje de 10 a 3000 caracteres.');
  const tipo = fields.tipo || 'sugerencia';
  if (!Object.hasOwn(THREAD_TYPES, tipo)) throw new Error('Elige un tipo de mensaje válido.');
  return { asunto, mensaje, tipo };
}
export function validateReply(value) {
  const mensaje = String(value ?? '').trim();
  if (mensaje.length < 5 || mensaje.length > 3000)
    throw new Error('Escribe una respuesta de 5 a 3000 caracteres.');
  return { mensaje };
}
export function diaryEmotion(reaction) {
  const match = String(reaction || '').match(
    /^Me sentí (calmado|furioso|triste|ansioso|frustrado|otro)\.\s*/,
  );
  return {
    emotion: match?.[1] || '',
    reaction: match ? String(reaction).slice(match[0].length) : String(reaction || ''),
  };
}
export function composeReaction(emotion, reaction) {
  if (emotion && !Object.hasOwn(EMOTIONS, emotion)) throw new Error('Elige una emoción válida.');
  return [emotion ? `Me sentí ${emotion}.` : '', String(reaction || '').trim()]
    .filter(Boolean)
    .join(' ');
}
export function evolution(rows) {
  return rows
    .filter(
      (row) =>
        Number.isFinite(Date.parse(row.creado_en)) &&
        Number.isFinite(Number(row.prom_general)) &&
        Number(row.prom_general) >= 1 &&
        Number(row.prom_general) <= 5,
    )
    .toSorted((a, b) => Date.parse(a.creado_en) - Date.parse(b.creado_en));
}
