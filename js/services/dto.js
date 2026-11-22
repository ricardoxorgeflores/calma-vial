import { calculate } from '../domain/domain.js?v=c08542ce77f3';

// DTO de salida: limita campos y comprueba el contrato antes de generar el documento.
export function reportDTO(value, expectedUserId) {
  if (
    !value ||
    value.version !== 1 ||
    value.usuario_id !== expectedUserId ||
    !Array.isArray(value.evaluaciones) ||
    value.evaluaciones.length !== 3 ||
    !Number.isInteger(value.total_evaluaciones) ||
    value.total_evaluaciones < 3 ||
    !Number.isFinite(Date.parse(value.generado_en))
  )
    throw new Error('El servidor no devolvió un informe válido para esta cuenta.');
  const seen = new Set();
  const evaluations = value.evaluaciones
    .map((row) => {
      const id = String(row.id ?? '');
      if (!/^\d+$/.test(id) || seen.has(id) || !Number.isFinite(Date.parse(row.creado_en)))
        throw new Error('Las evaluaciones del informe no son válidas.');
      seen.add(id);
      return { id, creado_en: row.creado_en, ...calculate(row.respuestas) };
    })
    .sort(
      (a, b) =>
        Date.parse(a.creado_en) - Date.parse(b.creado_en) || (BigInt(a.id) > BigInt(b.id) ? 1 : -1),
    );
  const averages = Object.fromEntries(
    ['prom_general', 'prom_avance', 'prom_temeraria', 'prom_hostilidad'].map((key) => [
      key,
      evaluations.reduce((sum, row) => sum + row[key], 0) / 3,
    ]),
  );
  return {
    userId: expectedUserId,
    name: String(value.nombre || 'Usuario de Calma Vial')
      .replace(/[\u0000-\u001f]/g, ' ')
      .slice(0, 200),
    generatedAt: value.generado_en,
    totalEvaluations: value.total_evaluaciones,
    evaluations,
    averages,
    difference: evaluations[2].total - evaluations[0].total,
  };
}
