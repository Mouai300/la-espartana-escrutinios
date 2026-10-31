const PRICE = 75;
function parseTxt(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const bets = [], seen = new Map();
  lines.forEach((raw, index) => {
    const bet = raw.trim().toUpperCase();
    if (!bet) return;
    if (!/^[1X2]{14}[012M]{2}$/.test(bet)) throw new Error(`Línea ${index + 1}: formato incorrecto.`);
    if (seen.has(bet)) throw new Error(`Apuesta repetida en las líneas ${seen.get(bet)} y ${index + 1}.`);
    seen.set(bet, index + 1);
    bets.push(bet);
  });
  if (!bets.length) throw new Error('El archivo no contiene apuestas.');
  return bets;
}
function scrutinize(bets, signs, pleno) {
  if (!/^[1X2]{14}$/.test(signs) || !/^[012M]{2}$/.test(pleno)) throw new Error('Introduce los 14 signos y el Pleno completo.');
  const categories = {15: 0, 14: 0, 13: 0, 12: 0, 11: 0, 10: 0};
  const rows = bets.map((bet, index) => {
    let hits = 0;
    for (let i = 0; i < 14; i++) if (bet[i] === signs[i]) hits++;
    const category = hits === 14 && bet.slice(14) === pleno ? 15 : hits >= 10 ? hits : null;
    if (category !== null) categories[category]++;
    return {number: index + 1, bet, hits, category};
  });
  return {categories, rows};
}
function balance(categories, prizesCents, betCount, priceCents = PRICE) {
  const complete = Object.entries(categories).every(([key, count]) => !count || Number.isInteger(prizesCents[key]));
  const cost = betCount * priceCents;
  if (!complete) return {cost, winnings: null, net: null};
  const winnings = Object.entries(categories).reduce((sum, [key, count]) => sum + count * (prizesCents[key] || 0), 0);
  return {cost, winnings, net: winnings - cost};
}
function preview(bets, signs, pleno = '??') {
  if (!/^[1X2?]{14}$/.test(signs) || !/^[012M?]{2}$/.test(pleno)) throw new Error('Usa ? para los partidos pendientes.');
  const pending = [...signs].filter(s=>s==='?').length;
  return bets.map((bet,index)=>{
    let hits=0;
    for(let i=0;i<14;i++)if(signs[i]!=='?'&&signs[i]===bet[i])hits++;
    const canReach15=hits+pending===14&&[...pleno].every((s,i)=>s==='?'||s===bet[14+i]);
    return {number:index+1,hits,pending,maxHits:hits+pending,canReach15};
  });
}
module.exports = {parseTxt, scrutinize, balance, preview};
