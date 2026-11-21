// Factores e ítems contrastados con el módulo Das del APK de Calma Vial.
export const FACTORS = {
  AVANCE: 'Avance impedido',
  TEMERARIA: 'Conducción temeraria',
  HOSTILIDAD: 'Hostilidad directa',
};
export const QUESTIONS = [
  ['Alguien está conduciendo en zigzag.', 'TEMERARIA'],
  [
    'Un vehículo lento que circula por una carretera de montaña no se hace a un lado, de forma que no deja pasar a los autos que van detrás.',
    'AVANCE',
  ],
  ['Alguien que está delante de ti da marcha atrás sin mirar.', 'TEMERARIA'],
  ['Alguien se pasa un semáforo en rojo o una señal de PARE.', 'TEMERARIA'],
  [
    'Yendo a más velocidad de la permitida, te das cuenta de que había un radar de control de velocidad.',
    'AVANCE',
  ],
  ['Alguien acelera justo cuando intentas rebasarlo.', 'TEMERARIA'],
  ['Alguien está estacionando muy despacio y provoca una trancadera.', 'AVANCE'],
  ['Te encuentras en medio de una gran trancadera (atasco).', 'AVANCE'],
  ['Alguien te hace un gesto obsceno por tu forma de conducir.', 'HOSTILIDAD'],
  ['Alguien te toca la bocina por tu forma de conducir.', 'HOSTILIDAD'],
  ['Un ciclista circula por la mitad del carril y hace más lento el tráfico.', 'AVANCE'],
  ['Un policía te ordena que te detengas a un lado de la vía.', 'AVANCE'],
  ['Un camión pesado lanza gravilla de la calzada sobre tu auto.', 'TEMERARIA'],
  ['Estás conduciendo detrás de un camión grande que no te deja ver lo que hay delante.', 'AVANCE'],
];
export const LABELS = ['Nada', 'Poco', 'Algo', 'Bastante', 'Muchísimo'];
export const MOODS = ['Muy calmado', 'Calmado', 'Neutral', 'Molesto', 'Furioso'];
export const MOOD_ICONS = ['😌', '🙂', '😐', '😟', '😠'];
export const MOMENTS = ['Antes de conducir', 'Después de conducir', 'En otro momento'];
export const VEHICLES = ['Particular', 'Transporte público', 'Transporte comercial'];
export const DIARY_FACTORS = { ...FACTORS, OTRA: 'Otra' };
export function normalizeFactor(value) {
  return (
    Object.entries(DIARY_FACTORS).find(([key, label]) => key === value || label === value)?.[0] ||
    value
  );
}
export const roleLabel = (role) => (role === 'admin' ? 'Administrador' : 'Usuario');

export function validateNotice(fields) {
  const titulo = String(fields.titulo ?? '').trim();
  const mensaje = String(fields.mensaje ?? '').trim();
  if (titulo.length < 5 || titulo.length > 100)
    throw new Error('El título debe tener entre 5 y 100 caracteres.');
  if (mensaje.length < 10 || mensaje.length > 2000)
    throw new Error('El mensaje debe tener entre 10 y 2000 caracteres.');
  return { titulo, mensaje };
}

export function validateEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error('Escribe un correo electrónico válido.');
  return email;
}

export function validatePassword(password, confirmation) {
  if (typeof password !== 'string' || password.length < 8)
    throw new Error('Utiliza al menos 8 caracteres para tu contraseña.');
  if (new TextEncoder().encode(password).length > 72)
    throw new Error('La contraseña admite como máximo 72 bytes.');
  if (password !== confirmation) throw new Error('Las contraseñas deben coincidir.');
  if (
    !/\p{Ll}/u.test(password) ||
    !/\p{Lu}/u.test(password) ||
    !/\d/.test(password) ||
    !/[^\p{L}\p{N}\s]/u.test(password)
  )
    throw new Error(
      'Incluye una mayúscula, una minúscula, un número y un carácter especial, como ! @ # $.',
    );
}

function integerInput(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? value : NaN;
  return typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : NaN;
}

export function appRedirectUrl({ origin, pathname }) {
  const directory = pathname.endsWith('/')
    ? pathname
    : pathname.endsWith('.html')
      ? pathname.slice(0, pathname.lastIndexOf('/') + 1)
      : pathname + '/';
  return new URL(directory, origin).href;
}

export function evaluationPayload(data) {
  const result = calculate(data.respuestas);
  if (!MOMENTS.includes(data.momento)) throw new Error('Selecciona el momento de evaluación.');
  if (!VEHICLES.includes(data.vehiculo)) throw new Error('Selecciona el tipo de vehículo.');
  const mood = integerInput(data.animo);
  if (!Number.isInteger(mood) || mood < 1 || mood > 5)
    throw new Error('Selecciona cómo te sientes antes de empezar.');
  return { ...result, momento: data.momento, vehiculo: data.vehiculo, animo: mood };
}

export function recommendations(evaluation) {
  const factors = [
    ['AVANCE', Number(evaluation.prom_avance)],
    ['TEMERARIA', Number(evaluation.prom_temeraria)],
    ['HOSTILIDAD', Number(evaluation.prom_hostilidad)],
  ];
  factors.sort((a, b) => b[1] - a[1]);
  const advice = {
    AVANCE: [
      'Planifica tu salida con tiempo suficiente.',
      'Recuerda que una demora no suele ser algo personal.',
      'Anota qué pensamientos aparecen cuando no puedes avanzar.',
    ],
    TEMERARIA: [
      'Mantén distancia y prioriza tu seguridad.',
      'Evita perseguir o intentar corregir a otro conductor.',
      'Si necesitas una pausa, detente primero en un lugar seguro.',
    ],
    HOSTILIDAD: [
      'Evita responder a gestos o provocaciones.',
      'Considera una explicación alternativa antes de reaccionar.',
      'Busca un lugar seguro si una interacción te hace sentir en riesgo.',
    ],
  };
  return { factor: factors[0][0], items: advice[factors[0][0]] };
}

export function adminSummary(evaluations) {
  const count = evaluations.length;
  const mean = (key) =>
    count ? evaluations.reduce((sum, e) => sum + Number(e[key] || 0), 0) / count : 0;
  return {
    count,
    active: new Set(evaluations.map((e) => e.usuario_id)).size,
    mean: mean('prom_general'),
    factors: {
      prom_avance: mean('prom_avance'),
      prom_temeraria: mean('prom_temeraria'),
      prom_hostilidad: mean('prom_hostilidad'),
    },
    levels: Object.fromEntries(
      ['Bajo', 'Moderado', 'Elevado'].map((level) => [
        level,
        evaluations.filter((e) => e.nivel === level).length,
      ]),
    ),
  };
}

/** Calcula los puntajes usando exactamente 14 respuestas enteras de 1 a 5.
 * Los umbrales 2,34 y 3,67 son orientativos; no son puntos de corte clínicos.
 */
export function calculate(answers) {
  if (
    !Array.isArray(answers) ||
    answers.length !== 14 ||
    !Array.from(answers).every((n) => Number.isInteger(n) && n >= 1 && n <= 5)
  )
    throw new Error('Responde las 14 situaciones con un valor de 1 a 5.');
  const total = answers.reduce((a, b) => a + b, 0),
    mean = total / 14;
  const avg = (f) => {
    const items = answers.filter((_, i) => QUESTIONS[i][1] === f);
    return items.reduce((a, b) => a + b, 0) / items.length;
  };
  return {
    respuestas: [...answers],
    total,
    prom_general: mean,
    prom_avance: avg('AVANCE'),
    prom_temeraria: avg('TEMERARIA'),
    prom_hostilidad: avg('HOSTILIDAD'),
    nivel: mean < 2.34 ? 'Bajo' : mean < 3.67 ? 'Moderado' : 'Elevado',
  };
}

// Validaciones compatibles con las restricciones de los registros móviles.
export function validateProfile(p) {
  if (!p.nombres?.trim()) throw new Error('Escribe tus nombres.');
  for (const key of ['nombres', 'apellido_paterno', 'apellido_materno'])
    if (
      p[key]?.trim() &&
      (p[key].trim().length < 2 ||
        !/^[\p{L}][\p{L}\p{M} ’'.-]*$/u.test(p[key].trim()) ||
        /[.]{2,}|[-]{2,}/.test(p[key]))
    )
      throw new Error(
        'Nombres y apellidos: mínimo 2 caracteres, solo letras y separadores válidos.',
      );
  if (
    p.documento?.trim() &&
    (!/^[\p{L}\p{N}][\p{L}\p{N} .-]{3,29}$/u.test(p.documento.trim()) || !/\d/.test(p.documento))
  )
    throw new Error('Documento inválido: utiliza de 4 a 30 caracteres y al menos un número.');
  if (
    p.direccion?.trim() &&
    (p.direccion.trim().length < 5 ||
      /[<>\u0000-\u001f]/u.test(p.direccion) ||
      !/\p{L}/u.test(p.direccion))
  )
    throw new Error('Escribe una dirección de al menos 5 caracteres.');
  if (
    p.genero?.trim() &&
    !['Masculino', 'Femenino', 'Otro', 'Prefiero no decirlo'].includes(p.genero)
  )
    throw new Error('Selecciona un género válido.');
  if (p.usuario != null && !/^[\p{L}\p{N}_.-]{3,50}$/u.test(p.usuario.trim()))
    throw new Error(
      'El usuario debe tener de 3 a 50 letras, números, puntos, guiones o guiones bajos.',
    );
  for (const [key, max] of Object.entries({
    nombres: 100,
    apellido_paterno: 100,
    apellido_materno: 100,
    usuario: 50,
    documento: 30,
    direccion: 250,
    telefono: 30,
  }))
    if (p[key] != null && String(p[key]).length > max)
      throw new Error(`El campo ${key.replaceAll('_', ' ')} admite hasta ${max} caracteres.`);
  if (
    p.telefono?.trim() &&
    (!/^[+\d()\s-]{6,30}$/.test(p.telefono.trim()) ||
      !/^\d{6,15}$/.test(p.telefono.replace(/\D/g, '')))
  )
    throw new Error('Escribe un teléfono válido o deja el campo vacío.');
  if (
    !Number.isInteger(integerInput(p.edad)) ||
    integerInput(p.edad) < 18 ||
    integerInput(p.edad) > 99
  )
    throw new Error('La edad debe estar entre 18 y 99 años.');
}

export function validateDiary(p) {
  if (!p.situacion?.trim()) throw new Error('Describe la situación.');
  for (const key of ['situacion', 'reaccion', 'nota'])
    if (String(p[key] || '').length > 2000)
      throw new Error('Cada texto del diario admite hasta 2.000 caracteres.');
  if (!Object.hasOwn(DIARY_FACTORS, normalizeFactor(p.factor)))
    throw new Error('Elige el factor que describe la situación.');
  if (
    !Number.isInteger(integerInput(p.intensidad)) ||
    integerInput(p.intensidad) < 1 ||
    integerInput(p.intensidad) > 5
  )
    throw new Error('Elige una intensidad de 1 a 5.');
}

// Escapar celdas y neutralizar prefijos que una hoja de cálculo interpreta como fórmulas.
export function csv(rows) {
  const cell = (v) =>
    '"' +
    String(v ?? '')
      .replace(/^[=+@\-\t\r]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  return '\ufeff' + rows.map((row) => row.map(cell).join(',')).join('\r\n');
}
