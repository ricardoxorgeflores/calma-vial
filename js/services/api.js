import { createGovernanceApi } from './governance-api.js?v=de5064fc2f9b';
import { config } from '../config/config.js?v=de5064fc2f9b';
import { reportDTO } from './dto.js?v=de5064fc2f9b';
import {
  validateDiary,
  validateProfile,
  evaluationPayload,
  normalizeFactor,
  DIARY_FACTORS,
  validateNotice,
} from '../domain/domain.js?v=de5064fc2f9b';
if (!window.supabase)
  throw new Error('No se pudo cargar el servicio de acceso. Recarga la página.');

// Cliente público: nunca incluir una clave administrativa en el navegador.
// El plazo también cancela la lectura del cuerpo, no solo la espera de cabeceras.
export function fetchWithDeadline(input, options = {}, timeoutMs = 20000, fetcher = fetch) {
  const deadline = AbortSignal.timeout(timeoutMs);
  const originalSignal = options.signal || (input instanceof Request ? input.signal : null);
  const signal = originalSignal ? AbortSignal.any([originalSignal, deadline]) : deadline;
  return fetcher(input, { ...options, signal });
}

// Mantener la exclusión entre pestañas, pero no esperar indefinidamente un bloqueo ajeno.
export async function authLock(
  name,
  acquireTimeout,
  action,
  manager = globalThis.navigator?.locks,
  maxWaitMs = 10000,
) {
  if (!manager) return action();
  const controller = new AbortController();
  let acquired = false;
  const timer =
    acquireTimeout === 0
      ? null
      : setTimeout(
          () => controller.abort(),
          acquireTimeout > 0 ? Math.min(acquireTimeout, maxWaitMs) : maxWaitMs,
        );
  try {
    return await manager.request(
      name,
      acquireTimeout === 0
        ? { mode: 'exclusive', ifAvailable: true }
        : { mode: 'exclusive', signal: controller.signal },
      async (lock) => {
        clearTimeout(timer);
        if (!lock) {
          const error = new Error('La sesión está ocupada en otra pestaña.');
          error.isAcquireTimeout = true;
          throw error;
        }
        acquired = true;
        return action();
      },
    );
  } catch (error) {
    if (!acquired && controller.signal.aborted) {
      const timeout = new Error(
        'La sesión está ocupada en otra pestaña de Calma Vial. Cierra las otras pestañas y vuelve a iniciar sesión.',
      );
      timeout.isAcquireTimeout = true;
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const db = window.supabase.createClient(config.supabaseUrl, config.supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    lock: authLock,
  },
  global: { fetch: fetchWithDeadline },
});

export function unwrap(result) {
  if (result.error) throw result.error;
  return result.data;
}

// Leer todas las páginas autorizadas; no presentar límites parciales como totales.
async function allRows(factory) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const page = unwrap(await factory().range(offset, offset + 499)) || [];
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}

// Lista permitida: el formulario personal no puede cambiar identificador, correo ni rol.
const profileFields = [
  'nombres',
  'apellido_paterno',
  'apellido_materno',
  'usuario',
  'documento',
  'edad',
  'direccion',
  'telefono',
  'genero',
];

// Acceso compartido con Android. Filtrar por propietario complementa las políticas RLS.
export const api = {
  ...createGovernanceApi(db),
  async report(userId) {
    if (!userId) throw new Error('Inicia sesión para generar tu informe.');
    return reportDTO(unwrap(await db.rpc('calmavial_informe', { p_usuario_id: userId })), userId);
  },
  async archive(type, id, restore = false) {
    if (!['evaluaciones', 'diario'].includes(type) || !/^[1-9]\d*$/.test(String(id)))
      throw new Error('Registro no válido.');
    const result = unwrap(
      await db.rpc(restore ? 'calmavial_restaurar' : 'calmavial_archivar', {
        p_tipo: type,
        p_id: String(id),
      }),
    );
    if (result !== true) throw new Error('El servidor no confirmó el cambio del registro.');
  },
  async archived() {
    const rows = unwrap(await db.rpc('calmavial_papelera'));
    if (!Array.isArray(rows)) throw new Error('No se pudo leer la papelera de tu cuenta.');
    return rows.map((row) => {
      if (
        !['evaluaciones', 'diario'].includes(row.tipo) ||
        !/^[1-9]\d*$/.test(String(row.id)) ||
        !Number.isFinite(Date.parse(row.archivado_en))
      )
        throw new Error('Registro archivado no válido.');
      return {
        tipo: row.tipo,
        id: String(row.id),
        detalle: String(row.detalle || ''),
        archivado_en: row.archivado_en,
      };
    });
  },
  async avatar(id) {
    if (!db.storage) return null;
    const bucket = db.storage.from('calmavial-avatars');
    const rows = unwrap(await bucket.list(id, { limit: 1, search: 'profile.jpg' }));
    if (!rows?.some((item) => item.name === 'profile.jpg')) return null;
    return unwrap(await bucket.createSignedUrl(`${id}/profile.jpg`, 3600)).signedUrl;
  },
  async saveAvatar(id, blob) {
    if (!id || blob?.type !== 'image/jpeg' || !blob.size || blob.size > 524288)
      throw new Error('La foto preparada no es válida.');
    unwrap(
      await db.storage.from('calmavial-avatars').upload(`${id}/profile.jpg`, blob, {
        upsert: true,
        contentType: 'image/jpeg',
        cacheControl: '0',
      }),
    );
  },
  async removeAvatar(id) {
    if (!id) throw new Error('Inicia sesión.');
    unwrap(await db.storage.from('calmavial-avatars').remove([`${id}/profile.jpg`]));
  },
  async notices(admin = false) {
    let query = db
      .from('calmavial_avisos')
      .select('*')
      .order('creado_en', { ascending: false })
      .order('id', { ascending: false })
      .limit(100);
    if (!admin) query = query.eq('activo', true);
    return unwrap(await query);
  },
  async saveNotice(userId, fields, id) {
    const values = validateNotice(fields);
    return unwrap(
      id
        ? await db.from('calmavial_avisos').update(values).eq('id', id).select().single()
        : await db
            .from('calmavial_avisos')
            .insert({ ...values, creado_por: userId })
            .select()
            .single(),
    );
  },
  async setNoticeActive(id, active) {
    if (typeof active !== 'boolean') throw new Error('Estado no válido.');
    return unwrap(
      await db.from('calmavial_avisos').update({ activo: active }).eq('id', id).select().single(),
    );
  },
  async noticeAudit() {
    return unwrap(
      await db
        .from('calmavial_auditoria')
        .select('*')
        .order('creado_en', { ascending: false })
        .order('id', { ascending: false })
        .limit(30),
    );
  },
  async profile(id) {
    return unwrap(await db.from('perfiles').select('*').eq('id', id).maybeSingle());
  },
  async evaluations(id) {
    return allRows(() =>
      db
        .from('evaluaciones')
        .select('*,calmavial_evaluacion_version(calmavial_cuestionarios(id,preguntas))')
        .eq('usuario_id', id)
        .order('creado_en', { ascending: false })
        .order('id', { ascending: false }),
    );
  },
  async diary(id) {
    const rows = await allRows(() =>
      db
        .from('diario')
        .select('*')
        .eq('usuario_id', id)
        .order('creado_en', { ascending: false })
        .order('id', { ascending: false }),
    );
    return rows.map((row) => ({ ...row, factor: normalizeFactor(row.factor) }));
  },
  async saveProfile(user, p, exists) {
    validateProfile(p);
    const data = Object.fromEntries(
      profileFields
        .filter((k) => Object.hasOwn(p, k))
        .map((k) => [k, k === 'edad' ? Number(p[k]) : String(p[k] ?? '').trim()]),
    );
    return unwrap(
      exists
        ? await db.from('perfiles').update(data).eq('id', user.id).select().single()
        : await db
            .from('perfiles')
            .insert({ ...data, id: user.id, correo: user.email, rol: 'usuario' })
            .select()
            .single(),
    );
  },
  async saveEvaluation(userId, data, requestId = crypto.randomUUID()) {
    if (!userId) throw new Error('Inicia sesión para guardar tu evaluación.');
    const payload = evaluationPayload(data);
    return unwrap(
      await db
        .rpc(data.questionnaireVersion ? 'guardar_evaluacion_versionada' : 'guardar_evaluacion', {
          ...(data.questionnaireVersion ? { p_version: data.questionnaireVersion } : {}),
          p_request_id: requestId,
          p_respuestas: payload.respuestas,
          p_momento: payload.momento,
          p_vehiculo: payload.vehiculo,
          p_animo: payload.animo,
        })
        .single(),
    );
  },
  async saveDiary(userId, p, id) {
    validateDiary(p);
    const data = {
      situacion: p.situacion.trim(),
      factor: DIARY_FACTORS[normalizeFactor(p.factor)],
      intensidad: Number(p.intensidad),
      reaccion: String(p.reaccion || '').trim(),
      nota: String(p.nota || '').trim(),
    };
    const saved = unwrap(
      id
        ? await db
            .from('diario')
            .update(data)
            .eq('id', id)
            .eq('usuario_id', userId)
            .select()
            .single()
        : await db
            .from('diario')
            .insert({ ...data, usuario_id: userId })
            .select()
            .single(),
    );
    return { ...saved, factor: normalizeFactor(saved.factor) };
  },
  async deleteDiary(userId, id) {
    const rows = unwrap(
      await db.from('diario').delete().eq('id', id).eq('usuario_id', userId).select('id'),
    );
    if (!rows?.length) throw new Error('No se pudo eliminar el registro. Verifica tus permisos.');
  },
  async deleteEvaluation(userId, id) {
    const rows = unwrap(
      await db.from('evaluaciones').delete().eq('id', id).eq('usuario_id', userId).select('id'),
    );
    if (!rows?.length) throw new Error('No se pudo eliminar la evaluación. Verifica tus permisos.');
  },
  async admin() {
    const profiles = await allRows(() =>
      db
        .from('perfiles')
        .select(
          'id,nombres,apellido_paterno,apellido_materno,edad,direccion,correo,telefono,usuario,rol,creado_en',
        )
        .order('creado_en', { ascending: false })
        .order('id', { ascending: false }),
    );
    const evaluations = await allRows(() =>
      db
        .from('evaluaciones')
        .select(
          'id,usuario_id,respuestas,animo,momento,vehiculo,total,nivel,prom_general,prom_avance,prom_temeraria,prom_hostilidad,creado_en,calmavial_evaluacion_version(calmavial_cuestionarios(id,preguntas))',
        )
        .order('creado_en', { ascending: false })
        .order('id', { ascending: false }),
    );
    return { profiles, evaluations };
  },
};
