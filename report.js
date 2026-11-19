import { recommendations, FACTORS } from './domain.js?v=e2dd13250420';

export const REPORT_DISCLAIMER =
  'Este informe es educativo y orientativo. No es un diagnóstico, no evalúa la aptitud para conducir y no sustituye una valoración médica o psicológica. Si el malestar persiste, afecta tu vida cotidiana o te preocupa, busca valoración de un profesional de salud. No tomes decisiones clínicas basándote solo en estos resultados.';
const WHO_URL = 'https://www.who.int/news-room/questions-and-answers/item/stress';
let fontsPromise;

export function loadReportFonts() {
  fontsPromise ||= Promise.all(
    [
      new URL('./vendor/fonts/Roboto-Regular.ttf?v=e2dd13250420', import.meta.url),
      new URL('./vendor/fonts/Roboto-Bold.ttf?v=e2dd13250420', import.meta.url),
    ].map(async (url) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('No se pudo cargar la tipografía del informe.');
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return btoa(binary);
    }),
  ).catch((error) => {
    fontsPromise = null;
    throw error;
  });
  return fontsPromise;
}

export function createReportPdf(report, Pdf, fonts) {
  if (!Pdf || !fonts || report.evaluations?.length !== 3)
    throw new Error('No se pudo preparar el generador PDF.');
  const pdf = new Pdf({ unit: 'mm', format: 'a4', compress: true });
  for (const [i, style] of ['normal', 'bold'].entries()) {
    const file = `Roboto-${style}.ttf`;
    pdf.addFileToVFS(file, fonts[i]);
    pdf.addFont(file, 'Roboto', style);
  }
  pdf.setProperties({
    title: 'Calma Vial - Informe de seguimiento',
    subject: 'Resumen orientativo de tres evaluaciones DAS',
    creator: 'Calma Vial',
  });
  const indigo = [59, 59, 152],
    ink = [37, 37, 62],
    muted = [93, 98, 118];
  const day = (value) =>
    new Date(value).toLocaleDateString('es-BO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'America/La_Paz',
    });
  function text(value, x, y, size = 10, bold = false, color = ink) {
    pdf.setFont('Roboto', bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
    pdf.text(Array.isArray(value) ? value : String(value), x, y);
  }
  function paragraph(value, y, width = 166, size = 10, x = 22) {
    pdf.setFont('Roboto', 'normal');
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(value, width);
    text(lines, x, y, size);
    return y + lines.length * size * 0.46;
  }
  function header(number, title) {
    pdf.setFillColor(...indigo);
    pdf.rect(0, 0, 210, 43, 'F');
    text('CALMA VIAL', 22, 16, 12, true, [255, 255, 255]);
    text(title, 22, 30, 21, true, [255, 255, 255]);
    text(`INFORME PERSONAL  /  ${number} DE 2`, 22, 54, 8, true, muted);
  }
  function footer(number) {
    pdf.setDrawColor(224, 227, 237);
    pdf.line(22, 278, 188, 278);
    text(
      'Documento privado - Comparte solo con personas de tu confianza.',
      22,
      284,
      8,
      false,
      muted,
    );
    text(`${number} / 2`, 180, 284, 8, false, muted);
  }
  header(1, 'Seguimiento de tus evaluaciones');
  pdf.setFont('Roboto', 'bold');
  pdf.setFontSize(13);
  const nameLines = pdf.splitTextToSize(report.name, 166);
  if (nameLines.length > 2) nameLines[1] = nameLines[1].slice(0, -3) + '...';
  text(nameLines.slice(0, 2), 22, 65, 13, true);
  let y = 83;
  text(
    `Emitido: ${day(report.generatedAt)}   |   Evaluaciones válidas en tu cuenta: ${report.totalEvaluations}`,
    22,
    y,
    9,
    false,
    muted,
  );
  y += 13;
  text('Tus tres evaluaciones más recientes', 22, y, 13, true);
  y += 10;
  const columns = [22, 55, 93, 128];
  ['FECHA', 'TOTAL / 70', 'PROMEDIO / 5', 'NIVEL ORIENTATIVO'].forEach((value, i) =>
    text(value, columns[i], y, 8, true, muted),
  );
  y += 5;
  for (const row of report.evaluations) {
    pdf.setFillColor(246, 247, 251);
    pdf.roundedRect(20, y, 170, 13, 2, 2, 'F');
    [day(row.creado_en), row.total, row.prom_general.toFixed(2), row.nivel].forEach((value, i) =>
      text(value, columns[i], y + 8, 10, i === 1),
    );
    y += 14;
  }
  y += 10;
  text('Promedios de los tres registros', 22, y, 13, true);
  y += 12;
  for (const [label, key] of [
    ['Avance impedido', 'prom_avance'],
    ['Conducción temeraria', 'prom_temeraria'],
    ['Hostilidad directa', 'prom_hostilidad'],
  ]) {
    text(label, 22, y, 10);
    text(`${report.averages[key].toFixed(2)} / 5`, 165, y, 10, true);
    pdf.setFillColor(234, 236, 245);
    pdf.roundedRect(22, y + 4, 166, 3, 1, 1, 'F');
    pdf.setFillColor(46, 196, 160);
    pdf.roundedRect(22, y + 4, (166 * report.averages[key]) / 5, 3, 1, 1, 'F');
    y += 16;
  }
  y += 5;
  y = paragraph(
    `Cambio entre el primer y el último registro de este resumen: ${report.difference > 0 ? '+' : ''}${report.difference} puntos. Una diferencia entre tres autoevaluaciones describe tus respuestas; no demuestra por sí sola mejoría, empeoramiento clínico ni un efecto del programa.`,
    y,
  );
  y += 7;
  paragraph(
    'Escala DAS de 14 situaciones, con respuestas de 1 a 5. Los niveles son orientativos y no constituyen puntos de corte diagnósticos.',
    y,
    166,
    9,
  );
  footer(1);
  pdf.addPage();
  header(2, 'Recomendaciones para tu recorrido');
  const advice = recommendations(report.averages);
  y = 68;
  text(`Factor con mayor promedio: ${FACTORS[advice.factor]}`, 22, y, 12, true);
  y += 12;
  for (const [index, item] of advice.items.entries()) {
    text(String(index + 1).padStart(2, '0'), 22, y, 12, true, indigo);
    y = paragraph(item, y, 150, 11, 32) + 10;
  }
  // Las recomendaciones generales no se presentan como tratamiento médico.
  y += 3;
  text('Para usar este informe con cuidado', 22, y, 13, true);
  y += 10;
  y =
    paragraph(
      'Realiza las evaluaciones y los ejercicios solo cuando estés detenido en un lugar seguro. Puedes registrar situaciones y reflexiones en tu diario para conversar sobre ellas con un profesional si lo necesitas.',
      y,
    ) + 12;
  pdf.setFillColor(237, 241, 251);
  pdf.roundedRect(20, y - 5, 170, 53, 3, 3, 'F');
  y = paragraph(REPORT_DISCLAIMER, y + 2, 162, 10) + 14;
  text('Referencia general sobre estrés y búsqueda de apoyo:', 22, y, 9, true, muted);
  y += 6;
  pdf.setFont('Roboto', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(...indigo);
  pdf.textWithLink('Organización Mundial de la Salud - Stress', 22, y, { url: WHO_URL });
  footer(2);
  return pdf;
}
