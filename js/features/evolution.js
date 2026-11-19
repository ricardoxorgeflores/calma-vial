import { evolution } from '../domain/management.js?v=0af7c1752fca';
import { escapeHtml as e, displayDate } from '../ui/format.js?v=0af7c1752fca';
// SVG nativo: legible sin librerías externas y acompañado de una tabla accesible.
export function evolutionChart(rows, title = 'Evolución de las evaluaciones') {
  const points = evolution(rows);
  if (!points.length)
    return `<section class="card evolution-card"><h2>${e(title)}</h2><p class="subtle">El gráfico aparecerá cuando haya evaluaciones guardadas.</p></section>`;
  const samples =
    points.length > 40
      ? Array.from({ length: 40 }, (_, i) => points[Math.round((i * (points.length - 1)) / 39)])
      : points;
  const firstDate = Date.parse(points[0].creado_en);
  const timeSpan = Date.parse(points.at(-1).creado_en) - firstDate;
  const xy = samples.map((row) => [
    52 + (timeSpan ? (Date.parse(row.creado_en) - firstDate) / timeSpan : 0.5) * 636,
    190 - (Number(row.prom_general) - 1) * 39,
  ]);
  const path = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const change = Number(points.at(-1).prom_general) - Number(points[0].prom_general);
  const description =
    points.length === 1
      ? 'Primera evaluación registrada'
      : Math.abs(change) < 0.01
        ? 'Sin cambio entre primera y última'
        : `${change < 0 ? 'Disminución' : 'Aumento'} descriptivo de ${Math.abs(change).toFixed(2)} puntos`;
  return `<section class="card evolution-card"><div class="card-title"><div><span class="section-tag">SEGUIMIENTO EN EL TIEMPO</span><h2>${e(title)}</h2></div><span class="trend-chip ${change < 0 ? 'trend-down' : ''}">${e(description)}</span></div><p class="subtle">Promedio de ira reportada · escala de 1 a 5. Una línea no es un diagnóstico.</p><div class="evolution-plot"><svg viewBox="0 0 740 240" role="img" aria-label="${e(title)}: ${points.length} evaluaciones. ${e(description)}.">
    ${[1, 2, 3, 4, 5].map((value) => `<line x1="52" x2="688" y1="${190 - (value - 1) * 39}" y2="${190 - (value - 1) * 39}" class="chart-grid"/><text x="24" y="${194 - (value - 1) * 39}">${value}</text>`).join('')}
    <path d="${path}" class="chart-line"/>
    ${xy.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="4.5" class="chart-point"><title>${e(displayDate(samples[i].creado_en))}: ${Number(samples[i].prom_general).toFixed(2)} / 5</title></circle>`).join('')}
    <text x="52" y="223">${e(displayDate(points[0].creado_en))}</text><text x="688" y="223" text-anchor="end">${e(displayDate(points.at(-1).creado_en))}</text></svg></div>
    ${samples.length < points.length ? '<p class="mini-note">El gráfico resume hasta 40 puntos; la tabla conserva todos los registros autorizados.</p>' : ''}
    <details class="chart-data"><summary>Ver datos del gráfico (${points.length})</summary><div class="table-wrap"><table class="data-table"><thead><tr><th>Fecha</th><th>Total</th><th>Promedio</th></tr></thead><tbody>${points.map((row) => `<tr><td>${e(displayDate(row.creado_en))}</td><td>${e(row.total)} / 70</td><td>${Number(row.prom_general).toFixed(2)} / 5</td></tr>`).join('')}</tbody></table></div></details></section>`;
}
