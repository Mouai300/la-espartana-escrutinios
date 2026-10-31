'use strict';

const S = require('./state'),
  E = require('./engine'),
  {
    sessionFor
  } = require('./commands'),
  {
    activeResults
  } = require('./consultation');
const {
    overview,
    totals
  } = require('./overview'),
  {
    scrutinizeElige8
  } = require('../elige8'),
  {
    formatEuro,
    combined
  } = require('./money');
const MAX_HTML = 6000000;
function fault(code) {
  throw Object.assign(new Error(code), {
    code
  });
}
function escape(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);
}
function createReport(raw, fileId, {
  variant = 'summary',
  createdAt,
  logo = null,
  sample = false
} = {}) {
  if (!['summary', 'full'].includes(variant)) fault('REPORT_VARIANT');
  if (typeof createdAt !== 'string' || !Number.isFinite(Date.parse(createdAt)) || new Date(createdAt).toISOString() !== createdAt) fault('REPORT_DATE');
  const state = S.validateState(raw),
    file = state.files.find(f => f.id === fileId);
  if (!file) fault('FILE_REQUIRED');
  if (logo !== null && (typeof logo !== 'string' || logo.length > 3000000 || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(logo))) fault('REPORT_LOGO');
  const round = state.rounds.find(r => r.id === file.roundId),
    session = sessionFor(state, file),
    results = activeResults(session),
    summary = overview(file.bets, results),
    quiniela = totals(summary, round.prizes, file.price),
    elige = file.elige8 ? scrutinizeElige8(file.elige8, results.signs, round.elige8Prize) : null;
  const total = combined(quiniela, elige),
    label = session.mode === 'simulation' ? 'SIMULACIÓN' : summary.final ? 'RESULTADOS GUARDADOS COMO FINALIZADOS' : 'CONSULTA PROVISIONAL';
  const model = {
    file,
    round,
    results,
    summary,
    quiniela,
    elige,
    total,
    label,
    variant,
    createdAt,
    sample: sample === true
  };
  const html = renderHtml(model, logo);
  if (html.length > MAX_HTML) fault('REPORT_TOO_LARGE');
  return {
    model,
    html,
    label: 'La-Espartana-' + round.season + '-J' + round.number + '-' + (variant === 'full' ? 'completo' : 'resumen'),
    footer: 'La Espartana - ' + label + (sample === true ? ' - MUESTRA FICTICIA' : '') + ' - J' + round.number + ' ' + round.season
  };
}
function renderHtml(m, logo) {
  const e = escape,
    q = m.quiniela,
    cat = n => n === 15 ? '15 (14 + Pleno)' : String(n),
    unit = n => formatEuro(m.round.prizes[n]);
  const prizeRows = E.PRIZE_CATEGORIES.map(n => {
    const count = m.summary.prizeCounts?.[n] ?? null,
      prize = m.round.prizes[n],
      value = count === null ? null : count === 0 ? 0 : prize === null ? null : count * prize;
    return `<tr><td>${cat(n)}</td><td>${count === null ? 'Pendiente' : count}</td><td>${unit(n)}</td><td>${formatEuro(value)}</td></tr>`;
  }).join('');
  const fixtures = Array.from({
    length: 15
  }, (_, i) => {
    const match = m.round.matches[i],
      result = i < 14 ? m.results.signs[i] : m.results.pleno;
    return `<tr><td>${i + 1}</td><td>${e(match?.label || 'Partido sin nombre guardado')}</td><td>${match?.startsAt ? e(match.startsAt) : 'Sin horario guardado'}</td><td class="mono">${e(result)}</td></tr>`;
  }).join('');
  const histogram = Array.from({
      length: 15
    }, (_, i) => `<td>${i}</td>`).join(''),
    histCounts = m.summary.knownHistogram.map(n => `<td>${n}</td>`).join('');
  const elige = m.elige ? `<section><h2>Elige 8 independiente</h2><p>Jugado: ${formatEuro(m.elige.cost)} · Aciertos: ${m.elige.hits}/8 · Pendientes: ${m.elige.pending} · Premio unitario: ${formatEuro(m.round.elige8Prize)}</p><p>Premios calculados: ${formatEuro(m.elige.winnings)} · Balance: ${formatEuro(m.elige.net)}</p>${m.variant === 'full' ? `<table><thead><tr><th>Partido</th><th>Jugado</th><th>Resultado</th></tr></thead><tbody>${m.file.elige8.picks.map(p => `<tr><td>${p.number}. ${e(m.round.matches[p.number - 1]?.label || 'Sin nombre guardado')}</td><td>${e(p.sign)}</td><td>${e(m.results.signs[p.number - 1])}</td></tr>`).join('')}</tbody></table>` : ''}</section>` : '<section><h2>Elige 8</h2><p>Este archivo no tiene un Elige 8 guardado.</p></section>';
  const pending = m.summary.complete ? '' : '<p class="warning">Hay resultados pendientes. Los aciertos conocidos y las opciones no son premios adjudicados. El total de premios permanece pendiente.</p>';
  const potential = m.summary.complete ? '' : `<p>Opciones aún posibles: ${E.PRIZE_CATEGORIES.map(c => `${cat(c)}: ${m.summary.possiblePrizes[c]}`).join(' · ')}. Son opciones solapadas; no se suman como apuestas distintas.</p>`;
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>La Espartana - escrutinio</title><style>
 @page{size:A4;margin:12mm 11mm 14mm}*{box-sizing:border-box}body{margin:0;color:#142b49;font:10pt Arial,Helvetica,sans-serif;line-height:1.35}header{display:flex;align-items:center;border-bottom:3px solid #c39b47;padding-bottom:10pt;margin-bottom:12pt}header img{width:62pt;height:62pt;object-fit:contain;margin-right:14pt}h1{font-size:23pt;margin:0;color:#09224a}h2{font-size:13pt;color:#143c69;margin:15pt 0 6pt}p{margin:6pt 0}.kicker{font-size:9pt;letter-spacing:1.5pt}.badge,.warning{background:#fff3d9;border-left:4pt solid #c39b47;padding:8pt}.badge{font-weight:bold;margin:10pt 0}.sample{background:#9e2630;color:white;font-weight:bold;padding:9pt}.meta{font-size:9pt;color:#3e5068}.filename{overflow-wrap:anywhere;unicode-bidi:plaintext}table{width:100%;border-collapse:collapse;table-layout:fixed;margin:6pt 0 10pt;font-size:9pt}th{background:#123457;color:#fff;text-align:left;font-size:8pt}td,th{border:0.5pt solid #c3ccd7;padding:5pt;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}.mono{font-family:Consolas,Menlo,monospace}.hist td{text-align:center;padding:4pt 1pt;font-size:8pt}.totals{border:1pt solid #c39b47;padding:10pt;margin:12pt 0;break-inside:avoid}.totals p{margin:3pt 0}.foot{font-size:8pt;border-top:1pt solid #c3ccd7;margin-top:12pt;padding-top:7pt}h2{break-after:avoid;page-break-after:avoid}
 </style></head><body>${m.sample ? '<p class="sample">MUESTRA FICTICIA - No son resultados ni premios reales</p>' : ''}<header>${logo ? `<img src="${logo}" alt="La Espartana">` : ''}<div><h1>La Espartana</h1><div class="kicker">ESCRUTINIOS</div><p>Jornada ${m.round.number} · ${e(m.round.season)} · ${m.variant === 'full' ? 'Informe completo' : 'Informe resumido'}</p></div></header>
 <h2 class="filename">${e(m.file.name)}</h2><p>${m.file.bets.length} columnas · Precio por apuesta: ${formatEuro(m.file.price)}</p><div class="badge">${m.label}</div><p class="meta">Generado: ${e(m.createdAt)} (UTC). ${m.round.prizeInfo ? 'Premios manuales guardados: ' + e(m.round.prizeInfo.checkedAt) : 'Premios guardados sin verificación automática de su procedencia.'}</p><p class="meta">${m.label === 'SIMULACIÓN' ? 'Este informe utiliza la simulación guardada del archivo.' : 'Origen de resultados: ' + e(m.round.results?.source || 'Sin consulta guardada') + '. Consulta: ' + e(m.round.results?.checkedAt || 'Pendiente') + '.'} Los importes introducidos a mano no se certifican como premios oficiales.</p>${pending}
 <h2>Quiniela: categorías de premio</h2><table><thead><tr><th>Categoría</th><th>Columnas</th><th>Premio unitario</th><th>Total calculado</th></tr></thead><tbody>${prizeRows}</tbody></table><p>Una columna de 15 recibe también el premio de 14: se suman ambos importes. El Pleno no añade aciertos a las categorías de 10 a 14.</p>${potential}
 <h2>${m.summary.complete ? 'Aciertos por columna' : 'Aciertos conocidos por columna'}</h2><table class="hist"><tbody><tr>${histogram}</tr><tr>${histCounts}</tr></tbody></table><p>Los grupos de 0 a 9 son informativos. Este histograma cuenta cada columna una sola vez.</p>
 <div class="totals"><p><strong>Quiniela:</strong> jugado ${formatEuro(q.cost)} · premios ${formatEuro(q.winnings)} · balance ${formatEuro(q.net)}</p><p><strong>Total con Elige 8:</strong> jugado ${formatEuro(m.total.cost)} · premios ${formatEuro(m.total.winnings)} · balance ${formatEuro(m.total.net)}</p></div>${elige}
 ${m.variant === 'full' ? `<h2>Partidos y resultados de esta consulta</h2><table><thead><tr><th style="width:7%">N.º</th><th style="width:49%">Partido</th><th style="width:32%">Horario guardado (UTC)</th><th style="width:12%">Signo</th></tr></thead><tbody>${fixtures}</tbody></table>` : ''}<p class="foot">Consulta informativa. Los resultados guardados o simulados no constituyen validación oficial del resguardo. No se ha consultado una fuente nueva al generar este informe.</p></body></html>`;
}
module.exports = {
  createReport,
  MAX_HTML
};
