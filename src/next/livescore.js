'use strict';

// Lee únicamente el panel público que Lotería 300 ya muestra en su web.
// No ejecuta scripts, no utiliza credenciales y solo se invoca por acción expresa.
const URL = 'https://www.loteria300.es/css/plugins/include/iframe_resultados_livescore.php';
function plain(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
}
function selected(row) {
  const values = [...String(row).matchAll(/<b\b[^>]*>\s*([012XM])\s*<\/b>/gi)].map(match => match[1].toUpperCase());
  if (values.length > 1) throw Error('LIVE_INVALID');
  return values[0] || '?';
}
function parseLiveScore(html, expectedRound) {
  if (typeof html !== 'string' || html.length > 500000) throw Error('LIVE_INVALID');
  const heading = html.match(/id=["']banner_jornada_tit["'][^>]*>([\s\S]*?)<\/div>/i);
  const round = Number(plain(heading?.[1]).match(/Jornada:\s*(\d+)/i)?.[1]);
  if (!Number.isInteger(round) || round < 1 || round > 99) throw Error('LIVE_INVALID');
  if (expectedRound !== undefined && round !== expectedRound) throw Error('LIVE_ROUND_MISMATCH');
  const rows = [...html.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)].map(match => ({attrs:match[1], html:match[2]}));
  const normal = rows.filter(row => !/pleno15/i.test(row.attrs));
  if (normal.length !== 14) throw Error('LIVE_INVALID');
  const signs = normal.map(row => selected(row.html)).join('');
  const plenoRows = rows.filter(row => /pleno15/i.test(row.attrs));
  if (plenoRows.length !== 2) throw Error('LIVE_INVALID');
  const pleno = plenoRows.map(row => selected(row.html)).join('');
  if (!/^[1X2?]{14}$/.test(signs) || !/^[012M?]{2}$/.test(pleno)) throw Error('LIVE_INVALID');
  return {round, signs, pleno, status:'provisional', source:'loteria300', checkedAt:new Date().toISOString()};
}
async function fetchLiveScore(expectedRound, fetcher = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetcher(URL, {method:'GET', signal:controller.signal, headers:{Accept:'text/html'}});
    if (!response?.ok) throw Error('LIVE_UNAVAILABLE');
    return parseLiveScore(await response.text(), expectedRound);
  } catch (error) {
    if (error?.message === 'LIVE_ROUND_MISMATCH' || error?.message === 'LIVE_INVALID') throw error;
    throw Error('LIVE_UNAVAILABLE');
  } finally {
    clearTimeout(timer);
  }
}
module.exports = {URL, parseLiveScore, fetchLiveScore};

