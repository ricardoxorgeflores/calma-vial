import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { jsPDF } from 'jspdf';
import { reportDTO } from '../js/services/dto.js';
import { createReportPdf, REPORT_DISCLAIMER } from '../js/features/report.js';

const uid = '00000000-0000-4000-8000-000000000019';
const fixture = () => ({
  version: 1,
  usuario_id: uid,
  nombre: 'Usuario de demostración - datos sintéticos',
  generado_en: '2026-11-19T16:00:00Z',
  total_evaluaciones: 3,
  evaluaciones: [1, 2, 3].map((id) => ({
    id: String(id),
    creado_en: `2026-11-${16 + id}T12:00:00Z`,
    respuestas: Array(14).fill(id + 1),
    total: 999,
  })),
});

test('El DTO de informe limita campos, recalcula puntajes y exige tres registros de la cuenta', () => {
  const data = fixture();
  const report = reportDTO({ ...data, password: 'no debe salir' }, uid);
  assert.deepEqual(
    report.evaluations.map((row) => row.total),
    [28, 42, 56],
  );
  assert.equal(report.difference, 28);
  assert.equal(report.averages.prom_general, 3);
  assert.equal('password' in report, false);
  assert.throws(() => reportDTO(data, 'otra-cuenta'), /esta cuenta/);
  assert.throws(
    () => reportDTO({ ...data, evaluaciones: data.evaluaciones.slice(0, 2) }, uid),
    /informe válido/,
  );
  assert.throws(
    () =>
      reportDTO(
        {
          ...data,
          evaluaciones: [data.evaluaciones[0], data.evaluaciones[0], data.evaluaciones[2]],
        },
        uid,
      ),
    /evaluaciones/,
  );
  data.evaluaciones[0].respuestas[0] = 6;
  assert.throws(() => reportDTO(data, uid), /1 a 5/);
});

test('El PDF real tiene dos páginas, fuentes incrustadas y advertencia de valoración profesional', async () => {
  const fonts = await Promise.all(
    ['Regular', 'Bold'].map(async (name) =>
      (await readFile(new URL(`../assets/fonts/Roboto-${name}.ttf`, import.meta.url))).toString(
        'base64',
      ),
    ),
  );
  const pdf = createReportPdf(reportDTO(fixture(), uid), jsPDF, fonts);
  assert.equal(pdf.getNumberOfPages(), 2);
  assert.match(REPORT_DISCLAIMER, /valoración médica o psicológica/);
  const bytes = Buffer.from(pdf.output('arraybuffer'));
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.match(bytes.toString('latin1'), /\/FontFile2/);
  await mkdir(new URL('../output/pdf/', import.meta.url), { recursive: true });
  await writeFile(new URL('../output/pdf/CalmaVial-informe-ejemplo.pdf', import.meta.url), bytes);
  const long = fixture();
  long.nombre = 'Álvarez Muñoz '.repeat(30);
  const longPdf = createReportPdf(reportDTO(long, uid), jsPDF, fonts);
  assert.equal(longPdf.getNumberOfPages(), 2);
  await writeFile(
    new URL('../output/pdf/CalmaVial-informe-nombre-largo.pdf', import.meta.url),
    Buffer.from(longPdf.output('arraybuffer')),
  );
});
