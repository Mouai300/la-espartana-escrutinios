const {test} = require('node:test');
const assert = require('node:assert/strict');
const {parseLiveScore} = require('../src/next/livescore');
const {applyCommand} = require('../src/next/commands');
const {state, NOW} = require('./support/next-fixtures');
function row(number, sign, cls = '') { return `<tr class="${cls}"><td class="info"><span>${number}</span></td><td class="resultado"><b>${sign}</b></td></tr>`; }
function panel(round = 18) { return `<div id="banner_jornada_tit">Jornada: ${round} <span>ült. act. 11:49</span></div>${Array.from({length:14},(_,i)=>row(i+1,i % 3 === 0 ? '1' : i % 3 === 1 ? 'X' : '2')).join('')}${row(15,'2','pleno15')}${row('', 'M','pleno15')}`; }
test('LiveScore: lee los 14 signos y el Pleno del panel público', () => {
  const value = parseLiveScore(panel(), 18);
  assert.equal(value.signs, '1X21X21X21X21X');
  assert.equal(value.pleno, '2M');
  assert.equal(value.source, 'loteria300');
  assert.equal(value.status, 'provisional');
});
test('LiveScore: nunca aplica una jornada distinta', () => {
  assert.throws(() => parseLiveScore(panel(19), 18), /LIVE_ROUND_MISMATCH/);
});
test('LiveScore: la actualización queda como provisional y conserva una simulación', () => {
  let value = applyCommand(state(), {type:'simulate',fileId:'f1',results:{signs:'XXXXXXXXXXXXXX',pleno:'00'}}, NOW);
  value = applyCommand(value, {type:'liveResults',roundId:'2026-27:18',results:parseLiveScore(panel(),18)}, NOW);
  assert.equal(value.rounds[0].results.source, 'loteria300');
  assert.equal(value.rounds[0].results.status, 'provisional');
  assert.equal(value.files[0].consultation.mode, 'simulation');
});

