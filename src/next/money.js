'use strict';

function fail() {
  throw Object.assign(new Error('MONEY_INVALID'), {
    code: 'MONEY_INVALID'
  });
}
function parseEuro(value) {
  if (typeof value !== 'string' || value.length > 64) fail();
  const text = value.trim();
  if (!text) return null;
  if (!/^\d{1,14}([,.]\d{1,2})?$/.test(text)) fail();
  const [whole, fraction = ''] = text.replace(',', '.').split('.');
  const cents = Number(whole + fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents < 0) fail();
  return cents;
}
function inputEuro(value) {
  if (value === null || value === undefined) return '';
  if (!Number.isSafeInteger(value)) fail();
  const digits = String(Math.abs(value)).padStart(3, '0');
  return (value < 0 ? '-' : '') + digits.slice(0, -2) + ',' + digits.slice(-2);
}
function formatEuro(value) {
  if (value === null || value === undefined) return 'Pendiente';
  const input = inputEuro(value),
    [whole, fraction] = input.split(',');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + fraction + ' €';
}
function sum(a, b) {
  const value = a + b;
  if (!Number.isSafeInteger(value)) fail();
  return value;
}
function combined(quiniela, elige) {
  for (const item of [quiniela, elige].filter(Boolean)) {
    if (!Number.isSafeInteger(item.cost) || item.cost < 0 || item.winnings !== null && (!Number.isSafeInteger(item.winnings) || item.winnings < 0)) fail();
  }
  const cost = sum(quiniela.cost, elige?.cost ?? 0),
    winnings = quiniela.winnings === null || elige && elige.winnings === null ? null : sum(quiniela.winnings, elige?.winnings ?? 0);
  return {
    cost,
    winnings,
    net: winnings === null ? null : sum(winnings, -cost)
  };
}
function parsePrizeInputs(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).sort().join(',') !== '10,11,12,13,14,15') fail();
  return Object.fromEntries([15, 14, 13, 12, 11, 10].map(n => [n, parseEuro(raw[n])]));
}
module.exports = {
  parseEuro,
  inputEuro,
  formatEuro,
  combined,
  parsePrizeInputs
};
