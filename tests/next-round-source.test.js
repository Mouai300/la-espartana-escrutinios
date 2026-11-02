const {test} = require('node:test');
const assert = require('node:assert/strict');
const {parseRound} = require('../src/next/round-source');
function page(round = 18) {
  const rows = Array.from({length:16}, (_, i) => `<tr id="partido_f${i+1}"><td class="partido">Equipo ${i+1} A - Equipo ${i+1} B</td><td>${i+1}</td></tr>`).join('');
  return `<div id="p_1_sorteo_jornada_dato">${round}</div><table>${rows}</table>`;
}
test('jornada Lotería 300: carga partidos y pleno', () => {
  const value = parseRound(page(), 18);
  assert.equal(value.matches.length, 15);
  assert.equal(value.matches[0].label, 'Equipo 1 A - Equipo 1 B');
  assert.equal(value.matches[14].label, 'Equipo 15 A - Equipo 15 B - Equipo 16 A - Equipo 16 B');
});
test('jornada Lotería 300: rechaza otra jornada o una lista incompleta', () => {
  assert.throws(() => parseRound(page(19), 18), /ROUND_SOURCE_MISMATCH/);
  assert.throws(() => parseRound(page().replace('partido_f8', 'partido_x8'), 18), /ROUND_SOURCE_INVALID/);
});

