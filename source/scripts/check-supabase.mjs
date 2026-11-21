import { config } from '../js/config/config.js';

// Diagnóstico de conectividad y contrato público. No lee registros personales,
// no crea cuentas y no modifica la base de datos.
const checks = [
  ['Autenticación', '/auth/v1/settings'],
  ['Perfiles', '/rest/v1/perfiles?select=id,correo,rol,nombres,edad,creado_en&limit=0'],
  [
    'Evaluaciones',
    '/rest/v1/evaluaciones?select=id,usuario_id,respuestas,total,nivel,prom_general,prom_avance,prom_temeraria,prom_hostilidad,creado_en&limit=0',
  ],
  [
    'Diario',
    '/rest/v1/diario?select=id,usuario_id,situacion,factor,intensidad,reaccion,nota,creado_en&limit=0',
  ],
];

console.log(`Proyecto: ${new URL(config.supabaseUrl).hostname}`);
let failed = false;
for (const [name, route] of checks) {
  try {
    const response = await fetch(new URL(route, config.supabaseUrl), {
      headers: { apikey: config.supabaseKey },
      signal: AbortSignal.timeout(15000),
    });
    if (route.startsWith('/auth/') && response.ok) {
      console.log(`${name}: HTTP ${response.status}`);
    } else {
      const error = await response.json().catch(() => ({}));
      if ([401, 403].includes(response.status) && error.code === '42501') {
        console.log(`${name}: acceso anónimo bloqueado correctamente (HTTP ${response.status})`);
      } else {
        failed = true;
        console.error(`${name}: respuesta inesperada HTTP ${response.status} ${error.code || ''}`);
      }
    }
  } catch (error) {
    failed = true;
    console.error(`${name}: ${error.cause?.code || error.name}`);
  }
}
try {
  const response = await fetch(new URL('/rest/v1/rpc/guardar_evaluacion', config.supabaseUrl), {
    method: 'POST',
    headers: { apikey: config.supabaseKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_request_id: crypto.randomUUID(),
      p_respuestas: Array(14).fill(3),
      p_momento: 'Antes de conducir',
      p_vehiculo: 'Particular',
      p_animo: 3,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const error = await response.json();
  if (![401, 403].includes(response.status) || error.code !== '42501')
    throw new Error(`HTTP ${response.status} ${error.code || ''}`);
  console.log('Guardado idempotente: RPC disponible y acceso anónimo bloqueado');
  for (const [rpc, body] of [
    ['calmavial_informe', { p_usuario_id: '00000000-0000-4000-8000-000000000019' }],
    ['calmavial_archivar', { p_tipo: 'evaluaciones', p_id: 1 }],
    ['calmavial_restaurar', { p_tipo: 'evaluaciones', p_id: 1 }],
    ['calmavial_papelera', {}],
    ['calmavial_usuarios_baja', {}],
    [
      'calmavial_baja_usuario',
      {
        p_usuario_id: '00000000-0000-4000-8000-000000000019',
        p_restaurar: false,
        p_motivo: 'Comprobación anónima bloqueada',
        p_confirmacion: 'ELIMINAR',
      },
    ],
    ['calmavial_diagnostico', {}],
  ]) {
    const denied = await fetch(new URL('/rest/v1/rpc/' + rpc, config.supabaseUrl), {
      method: 'POST',
      headers: { apikey: config.supabaseKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const message = await denied.json();
    if (![401, 403].includes(denied.status) || message.code !== '42501')
      throw new Error(`${rpc}: HTTP ${denied.status} ${message.code || ''}`);
    console.log(`${rpc}: acceso anónimo bloqueado`);
  }
  const cors = await fetch(new URL('/auth/v1/token?grant_type=password', config.supabaseUrl), {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://ricardoxorgeflores.github.io',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'apikey,authorization,content-type',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (
    !cors.ok ||
    !['*', 'https://ricardoxorgeflores.github.io'].includes(
      cors.headers.get('access-control-allow-origin'),
    )
  )
    throw new Error('CORS no permite GitHub Pages');
  console.log('GitHub Pages: preflight CORS correcto');
} catch (error) {
  failed = true;
  console.error('RPC/CORS:', error.message);
}
console.log(
  'Este diagnóstico no verifica sesiones reales, escrituras, RLS ni sincronización Android/web.',
);
process.exitCode = failed ? 1 : 0;
