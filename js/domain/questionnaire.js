import { QUESTIONS } from './domain.js?v=4aad031f6e83';

export function validateQuestionnaire(questions, reason) {
  if (!Array.isArray(questions) || questions.length !== 14)
    throw new Error('Debes conservar las 14 preguntas.');
  const clean = questions.map((text) => {
    if (
      typeof text !== 'string' ||
      text.trim().length < 15 ||
      text.trim().length > 700 ||
      /[<>\u0000-\u001f]/u.test(text) ||
      !/\p{L}/u.test(text)
    )
      throw new Error('Cada pregunta debe tener entre 15 y 700 caracteres, sin etiquetas.');
    return text.trim();
  });
  if (new Set(clean.map((text) => text.toLocaleLowerCase('es'))).size !== 14)
    throw new Error('No repitas preguntas.');
  if (typeof reason !== 'string' || reason.trim().length < 10 || reason.trim().length > 300)
    throw new Error('Describe el motivo de la actualización en 10 a 300 caracteres.');
  return { questions: clean, reason: reason.trim() };
}

export const originalQuestionnaire = () => ({ id: 1, preguntas: QUESTIONS.map(([text]) => text) });
export const questionsFor = (row, catalog = [], versions = []) => {
  const embedded = row.calmavial_evaluacion_version?.calmavial_cuestionarios;
  if (embedded?.preguntas?.length === 14) return embedded;
  const id =
    versions.find((item) => String(item.evaluacion_id) === String(row.id))?.cuestionario_id || 1;
  return catalog.find((item) => String(item.id) === String(id)) || originalQuestionnaire();
};
