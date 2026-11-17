import { config } from './config.js';
import {
  validateDiary,
  validateProfile,
  evaluationPayload,
  normalizeFactor,
  DIARY_FACTORS,
} from './domain.js';
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

export const db = window.supabase.createClient(config.supabaseUrl, config.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
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
  async profile(id) {
    return unwrap(await db.from('perfiles').select('*').eq('id', id).maybeSingle());
  },
  async evaluations(id) {
    return allRows(() =>
      db
        .from('evaluaciones')
        .select('*')
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
        .rpc('guardar_evaluacion', {
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
        .select('id,nombres,apellido_paterno,correo,rol,creado_en')
        .order('creado_en', { ascending: false })
        .order('id', { ascending: false }),
    );
    const evaluations = await allRows(() =>
      db
        .from('evaluaciones')
        .select(
          'id,usuario_id,total,nivel,prom_general,prom_avance,prom_temeraria,prom_hostilidad,creado_en',
        )
        .order('creado_en', { ascending: false })
        .order('id', { ascending: false }),
    );
    return { profiles, evaluations };
  },
};
