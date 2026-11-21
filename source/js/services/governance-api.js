import { validateQuestionnaire } from '../domain/questionnaire.js';
const unwrap = (result) => {
  if (result.error) throw result.error;
  return result.data;
};
const uuid = (value) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
    throw new Error('Cuenta inválida.');
  return value;
};
export function createGovernanceApi(db) {
  return {
    accountActive: async () => unwrap(await db.rpc('calmavial_cuenta_activa')),
    questionnaires: async () =>
      unwrap(
        await db.from('calmavial_cuestionarios').select('*').order('id', { ascending: false }),
      ),
    evaluationVersions: async () => {
      const rows = [];
      for (let start = 0; ; start += 500) {
        const page =
          unwrap(
            await db
              .from('calmavial_evaluacion_version')
              .select('*')
              .order('evaluacion_id')
              .range(start, start + 499),
          ) || [];
        rows.push(...page);
        if (page.length < 500) return rows;
      }
    },
    accountStates: async () => unwrap(await db.rpc('calmavial_estado_usuarios')),
    deletedAccounts: async () => unwrap(await db.rpc('calmavial_usuarios_baja')),
    deleteAccount: async (id, restore, reason, confirmation) => {
      if (
        typeof restore !== 'boolean' ||
        typeof reason !== 'string' ||
        reason.trim().length < 10 ||
        reason.trim().length > 300
      )
        throw new Error('Escribe un motivo de 10 a 300 caracteres.');
      if (confirmation !== (restore ? 'RESTAURAR' : 'ELIMINAR'))
        throw new Error(`Escribe ${restore ? 'RESTAURAR' : 'ELIMINAR'} para confirmar.`);
      const result = unwrap(
        await db.rpc('calmavial_baja_usuario', {
          p_usuario_id: uuid(id),
          p_restaurar: restore,
          p_motivo: reason.trim(),
          p_confirmacion: confirmation,
        }),
      );
      if (result !== true) throw new Error('El servidor no confirmó el cambio.');
      return result;
    },
    changeAccount: async (id, removed, reason) => {
      if (
        typeof removed !== 'boolean' ||
        typeof reason !== 'string' ||
        reason.trim().length < 10 ||
        reason.trim().length > 300
      )
        throw new Error('Escribe un motivo de 10 a 300 caracteres.');
      const result = unwrap(
        await db.rpc('calmavial_cambiar_usuario', {
          p_usuario_id: uuid(id),
          p_eliminar: removed,
          p_motivo: reason.trim(),
        }),
      );
      if (result !== true) throw new Error('El servidor no confirmó el cambio.');
      return result;
    },
    publishQuestions: async (questions, reason, base) => {
      const valid = validateQuestionnaire(questions, reason);
      return unwrap(
        await db.rpc('calmavial_publicar_preguntas', {
          p_preguntas: valid.questions,
          p_motivo: valid.reason,
          p_base: base,
        }),
      );
    },
    diagnostics: async () => {
      const data = unwrap(await db.rpc('calmavial_diagnostico'));
      const counters = [
        'hashes_bcrypt',
        'cuentas_con_password',
        'tablas_rls',
        'usuarios_eliminados',
      ];
      if (
        !data ||
        data.conexion !== 'ok' ||
        !Number.isFinite(Date.parse(data.comprobado_en)) ||
        counters.some((key) => !Number.isInteger(data[key]) || data[key] < 0) ||
        data.hashes_bcrypt > data.cuentas_con_password ||
        data.tablas_rls > 7 ||
        !Array.isArray(data.auditoria)
      )
        throw new Error('El servicio devolvió un diagnóstico incompleto. Vuelve a comprobar.');
      return data;
    },
  };
}
