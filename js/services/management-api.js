import { validateThread, validateReply, THREAD_STATES } from '../domain/management.js?v=4aad031f6e83';
import { validateProfile } from '../domain/domain.js?v=4aad031f6e83';
const unwrap = (result) => {
  if (result.error) throw result.error;
  return result.data;
};
const uuid = (value) => {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
    throw new Error('El identificador no es válido.');
  return value;
};
async function allRows(factory) {
  const rows = [];
  for (let start = 0; ; start += 500) {
    const page = unwrap(await factory().range(start, start + 499)) || [];
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}
async function changed(query) {
  const row = unwrap(await query.select('*').single());
  if (!row?.id) throw new Error('El servidor no confirmó el cambio.');
  return row;
}
export function createManagementApi(db) {
  return {
    threads: () =>
      allRows(() =>
        db.from('calmavial_sugerencias').select('*').order('actualizado_en', { ascending: false }),
      ),
    replies: (id) =>
      allRows(() =>
        db
          .from('calmavial_respuestas')
          .select('*')
          .eq('sugerencia_id', uuid(id))
          .order('creado_en', { ascending: true }),
      ),
    audit: () =>
      allRows(() =>
        db
          .from('calmavial_gestion_auditoria')
          .select('id,actor_id,recurso,registro_id,accion,creado_en')
          .order('creado_en', { ascending: false }),
      ),
    createThread: (actor, fields, owner = actor, evaluation = null) => {
      if (evaluation !== null && !/^[1-9]\d*$/.test(String(evaluation)))
        throw new Error('La evaluación no es válida.');
      return changed(
        db.from('calmavial_sugerencias').insert({
          ...validateThread(fields),
          usuario_id: uuid(owner),
          creado_por: uuid(actor),
          evaluacion_id: evaluation,
        }),
      );
    },
    updateThread: (id, fields) => {
      const valid = validateThread(fields);
      return changed(
        db
          .from('calmavial_sugerencias')
          .update({ asunto: valid.asunto, mensaje: valid.mensaje })
          .eq('id', uuid(id)),
      );
    },
    archiveThread: (id, eliminado = true) =>
      changed(db.from('calmavial_sugerencias').update({ eliminado }).eq('id', uuid(id))),
    status: (id, estado) => {
      if (!Object.hasOwn(THREAD_STATES, estado)) throw new Error('El estado no es válido.');
      return changed(db.from('calmavial_sugerencias').update({ estado }).eq('id', uuid(id)));
    },
    reply: (actor, id, message) =>
      changed(
        db
          .from('calmavial_respuestas')
          .insert({ ...validateReply(message), autor_id: uuid(actor), sugerencia_id: uuid(id) }),
      ),
    editReply: (id, message) =>
      changed(db.from('calmavial_respuestas').update(validateReply(message)).eq('id', uuid(id))),
    archiveReply: (id, eliminado = true) =>
      changed(db.from('calmavial_respuestas').update({ eliminado }).eq('id', uuid(id))),
    editProfile: (id, fields) => {
      validateProfile(fields);
      const data = Object.fromEntries(
        ['nombres', 'apellido_paterno', 'apellido_materno', 'telefono', 'direccion'].map((key) => [
          key,
          String(fields[key] ?? '').trim(),
        ]),
      );
      data.edad = Number(fields.edad);
      return changed(db.from('perfiles').update(data).eq('id', uuid(id)));
    },
  };
}
