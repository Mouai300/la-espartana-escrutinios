function validateElige8(ticket){
  if(!ticket||!Array.isArray(ticket.picks)||ticket.picks.length!==8)throw new Error('Elige exactamente ocho partidos.');
  const numbers=new Set();
  for(const pick of ticket.picks){
    if(!Number.isInteger(pick.number)||pick.number<1||pick.number>14||numbers.has(pick.number)||!/^[1X2]$/.test(pick.sign))throw new Error('Elige 8: revisa partidos y signos.');
    numbers.add(pick.number);
  }
  if(!Number.isSafeInteger(ticket.cost)||ticket.cost<0)throw new Error('Importe de Elige 8 incorrecto.');
  return ticket;
}
function scrutinizeElige8(ticket,signs,prizeCents=null){
  validateElige8(ticket);
  if(!/^[1X2?]{14}$/.test(signs))throw new Error('Resultados incorrectos para Elige 8.');
  if(prizeCents!==null&&(!Number.isSafeInteger(prizeCents)||prizeCents<0))throw new Error('Premio de Elige 8 incorrecto.');
  let hits=0,pending=0;
  for(const pick of ticket.picks){const actual=signs[pick.number-1];if(actual==='?')pending++;else if(actual===pick.sign)hits++;}
  const complete=pending===0;
  const winnings=complete?(hits===8?prizeCents:0):null;
  return {hits,pending,maxHits:hits+pending,complete,winning:complete?hits===8:null,cost:ticket.cost,winnings,net:winnings===null?null:winnings-ticket.cost};
}
module.exports={validateElige8,scrutinizeElige8};
