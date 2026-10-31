'use strict';

const E = require('./engine');
// Conserva los detalles de un bloque pequeño, no los de todo el historial en la vista.
function overview(bets, results) {
  E.validateBets(bets);
  const hist = Array(15).fill(0),
    maximum = Array(15).fill(0),
    prizes = Object.fromEntries(E.PRIZE_CATEGORIES.map(c => [c, 0])),
    possible = {
      ...prizes
    };
  let last;
  for (let start = 0; start < bets.length; start += 500) {
    last = E.scrutinize(bets.slice(start, start + 500), results);
    for (let n = 0; n <= 14; n++) {
      hist[n] += last.knownHistogram[n];
      maximum[n] += last.maximumHistogram[n];
    }
    for (const c of E.PRIZE_CATEGORIES) {
      prizes[c] += last.prizeCounts?.[c] || 0;
      possible[c] += last.possiblePrizes[c];
    }
  }
  return {
    columnCount: bets.length,
    complete: last.complete,
    final: last.final,
    knownHistogram: hist,
    histogram: last.complete ? hist.slice() : null,
    maximumHistogram: maximum,
    prizeCounts: last.complete ? prizes : null,
    possiblePrizes: possible
  };
}
function totals(summary, prizes, price) {
  // El motor monetario solo utiliza la longitud, no necesita construir detalles.
  return E.balance({
    ...summary,
    rows: new Array(summary.columnCount)
  }, prizes, price);
}
function displayTotals(summary, prizes, price) {
  try {
    return {
      ...totals(summary, prizes, price),
      calculationError: false
    };
  } catch {
    return {
      cost: Number.isSafeInteger(summary.columnCount * price) ? summary.columnCount * price : null,
      winnings: null,
      net: null,
      missingPrizes: [],
      provisional: true,
      calculationError: true
    };
  }
}
function page(bets, results, {
  hits = null,
  number = null,
  offset = 0,
  limit = 25
} = {}) {
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 50) throw Error('Página incorrecta.');
  if (hits !== null && (!Number.isInteger(hits) || hits < 0 || hits > 14)) throw Error('Filtro incorrecto.');
  if (number !== null && (!Number.isInteger(number) || number < 1 || number > bets.length)) throw Error('Columna incorrecta.');
  E.validateResults(results);
  let matched = 0;
  const rows = [];
  for (let i = number === null ? 0 : number - 1; i < (number === null ? bets.length : number); i++) {
    const bet = bets[i];
    let count = 0;
    for (let p = 0; p < 14; p++) if (results.signs[p] !== '?' && bet[p] === results.signs[p]) count++;
    if (hits !== null && count !== hits) continue;
    if (matched++ < offset) continue;
    const row = E.scrutinize([bet], results).rows[0];
    rows.push({
      ...row,
      number: i + 1
    });
    if (number !== null || rows.length === limit) break;
  }
  return rows;
}
module.exports = {
  overview,
  totals,
  displayTotals,
  page
};
