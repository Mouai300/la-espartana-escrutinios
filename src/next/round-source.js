'use strict';

const URL = 'https://www.loteria300.es/quiniela.php';
function plain(value) { return String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&ntilde;/gi, 'ñ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim(); }
function roundNumber(html) {
  const direct = html.match(/id=["']p_1_sorteo_jornada_dato["'][^>]*>\s*(\d+)/i)?.[1];
  const nearby = html.match(/p_1_sorteo_jornada["'][\s\S]{0,500}?JORNADA[^\d]{0,100}(\d{1,2})/i)?.[1];
  const value = Number(direct || nearby);
  if (!Number.isInteger(value) || value < 1 || value > 99) throw Error('ROUND_SOURCE_INVALID');
  return value;
}
function label(row) {
  const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m => plain(m[1])).filter(value => value.length > 2);
  const value = cells.sort((a, b) => b.length - a.length)[0];
  if (!value || value.length > 90) throw Error('ROUND_SOURCE_INVALID');
  return value;
}
function parseRound(html, expectedRound) {
  if (typeof html !== 'string' || html.length > 1000000) throw Error('ROUND_SOURCE_INVALID');
  const number = roundNumber(html);
  if (expectedRound !== undefined && number !== expectedRound) throw Error('ROUND_SOURCE_MISMATCH');
  const rows = new Map();
  for (const match of html.matchAll(/<tr\b[^>]*id=["']partido_f(\d+)["'][^>]*>([\s\S]*?)<\/tr>/gi)) rows.set(Number(match[1]), label(match[2]));
  if (rows.size < 16 || !Array.from({length:16},(_,i)=>rows.has(i+1)).every(Boolean)) throw Error('ROUND_SOURCE_INVALID');
  const matches = Array.from({length:14},(_,i)=>({number:i+1,label:rows.get(i+1),startsAt:null,sourceId:'loteria300:'+(i+1)}));
  matches.push({number:15,label:rows.get(15)+' - '+rows.get(16),startsAt:null,sourceId:'loteria300:15'});
  return {number, matches, source:'loteria300', checkedAt:new Date().toISOString()};
}
async function fetchRound(expectedRound, fetcher = fetch) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetcher(URL, {method:'GET',signal:controller.signal,headers:{Accept:'text/html'}});
    if (!response?.ok) throw Error('ROUND_SOURCE_UNAVAILABLE');
    return parseRound(await response.text(), expectedRound);
  } catch (error) {
    if (/^ROUND_SOURCE_(INVALID|MISMATCH)$/.test(error?.message)) throw error;
    throw Error('ROUND_SOURCE_UNAVAILABLE');
  } finally { clearTimeout(timer); }
}
module.exports = {URL, parseRound, fetchRound};

