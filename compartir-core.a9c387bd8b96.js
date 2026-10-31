(()=>{'use strict';const modules={'./engine.cjs':(module,exports,require)=>{
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

},'./core.cjs':(module,exports,require)=>{
const {parseTxt,scrutinize,preview,balance}=require('./engine.cjs');
const MAX_BETS=1000, MAX_FRAGMENT=9500, MAX_LINK=10000, MAX_AMOUNT=10000000000;
const categories=[15,14,13,12,11,10];
function check(condition,message){if(!condition)throw new Error(message);}
function amount(text){text=String(text).trim();if(!text)return null;check(/^\d+(?:[.,]\d{1,2})?$/.test(text),'Introduce euros sin separadores de miles, con hasta dos decimales.');const cents=Math.round(Number(text.replace(',','.'))*100);check(Number.isSafeInteger(cents)&&cents>=0&&cents<=MAX_AMOUNT,'Importe fuera del límite de esta prueba.');return cents;}
function validate(input){
 check(input&&typeof input==='object'&&!Array.isArray(input),'Combinación incorrecta.');
 const {name,season,round,price,bets,signs,pleno,prizes}=input;
 const matches=input.matches??[];
 check(Array.isArray(matches)&&(matches.length===0||matches.length===15),'Incluye los 15 partidos, con el Pleno al 15 en la última línea.');
 check(matches.every(m=>typeof m==='string'&&m.trim().length>0&&m.length<=90&&!/[\x00-\x1f\x7f]/.test(m)),'Cada partido debe tener entre 1 y 90 caracteres, sin saltos de línea.');
 check(typeof name==='string'&&name.trim().length>0&&name.length<=80&&!/[\x00-\x1f\x7f]/.test(name),'El nombre debe tener entre 1 y 80 caracteres.');
 check(typeof season==='string'&&/^\d{4}-\d{2}$/.test(season)&&Number(season.slice(5))===(Number(season.slice(0,4))+1)%100,'Temporada incorrecta. Usa 2026-27.');
 check(Number.isInteger(round)&&round>=1&&round<=100,'La jornada debe estar entre 1 y 100.');
 check(Number.isSafeInteger(price)&&price>0&&price<=100000,'El precio debe estar entre 0,01 y 1.000 euros.');
 check(Array.isArray(bets)&&bets.length>0&&bets.length<=MAX_BETS,`Esta prueba admite hasta ${MAX_BETS} apuestas por enlace.`);
 check(bets.every(b=>typeof b==='string'&&/^[1X2]{14}[012M]{2}$/.test(b)),'Hay apuestas incorrectas.');check(new Set(bets).size===bets.length,'La combinación contiene apuestas repetidas.');
 check(typeof signs==='string'&&/^[1X2?]{14}$/.test(signs)&&typeof pleno==='string'&&/^[012M?]{2}$/.test(pleno),'Resultados incorrectos.');
 check(prizes&&typeof prizes==='object'&&!Array.isArray(prizes)&&Object.keys(prizes).every(k=>categories.includes(Number(k))),'Premios incorrectos.');
 const cleanPrizes={};for(const c of categories){const p=prizes[c]??null;check(p===null||(Number.isSafeInteger(p)&&p>=0&&p<=MAX_AMOUNT),'Premio fuera de los límites de esta prueba.');cleanPrizes[c]=p;}
 return {name:name.trim(),season,round,price,bets:bets.slice(),signs,pleno,prizes:cleanPrizes,matches:matches.map(m=>m.trim())};
}
function pack(bets){const bytes=new Uint8Array(bets.length*4),view=new DataView(bytes.buffer);bets.forEach((b,i)=>{let n=0;for(const s of b.slice(0,14))n=n*3+'1X2'.indexOf(s);n=(n*4+'012M'.indexOf(b[14]))*4+'012M'.indexOf(b[15]);view.setUint32(i*4,n);});return bytes;}
function unpack(bytes){check(bytes.length>0&&bytes.length%4===0&&bytes.length/4<=MAX_BETS,'Columnas incompletas o demasiadas apuestas.');const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),bets=[];for(let i=0;i<bytes.length;i+=4){let n=view.getUint32(i);const b='012M'[n%4];n=Math.floor(n/4);const a='012M'[n%4];n=Math.floor(n/4);let signs='';for(let j=0;j<14;j++){signs='1X2'[n%3]+signs;n=Math.floor(n/3);}check(n===0,'Columna codificada incorrectamente.');bets.push(signs+a+b);}return bets;}
function to64(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function from64(text){check(typeof text==='string'&&text.length>0&&/^[A-Za-z0-9_-]+$/.test(text),'El enlace está incompleto o tiene un formato incorrecto.');let raw;try{raw=atob(text.replace(/-/g,'+').replace(/_/g,'/'));}catch{throw new Error('El enlace está incompleto. Pide que te lo envíen de nuevo.');}return Uint8Array.from(raw,c=>c.charCodeAt(0));}
function encode(input){const s=validate(input),payload={v:1,n:s.name,s:s.season,j:s.round,p:s.price,b:to64(pack(s.bets)),r:s.signs,f:s.pleno,w:s.prizes,...(s.matches.length?{m:s.matches}:{})};const fragment='q1.'+to64(new TextEncoder().encode(JSON.stringify(payload)));check(fragment.length<=MAX_FRAGMENT,'La combinación no cabe en un enlace de esta prueba.');return fragment;}
function decode(fragment){check(typeof fragment==='string'&&fragment.length<=MAX_FRAGMENT&&fragment.startsWith('q1.'),'Enlace incompatible, incompleto o demasiado grande.');let p;try{p=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(from64(fragment.slice(3))));}catch{throw new Error('No se puede leer el enlace. Pide que te lo envíen completo.');}check(p&&p.v===1,'Versión de enlace no compatible.');check(typeof p.b==='string'&&p.b.length<=Math.ceil(MAX_BETS*4/3)*4,'Demasiadas apuestas en el enlace.');return validate({name:p.n,season:p.s,round:p.j,price:p.p,bets:unpack(from64(p.b)),signs:p.r,pleno:p.f,prizes:p.w,matches:p.m??[]});}
function makeLink(input,base){const url=new URL(base);check(url.protocol==='https:'||(['localhost','127.0.0.1'].includes(url.hostname)&&url.protocol==='http:'),'Abre la página publicada mediante HTTPS.');url.search='';url.hash=encode(input);check(url.href.length<=MAX_LINK,'El enlace es demasiado largo para esta prueba.');return url.href;}
function calculate(input){const s=validate(input),complete=!s.signs.includes('?')&&!s.pleno.includes('?');if(!complete)return {complete:false,rows:preview(s.bets,s.signs,s.pleno),totals:{cost:s.bets.length*s.price,winnings:null,net:null}};const result=scrutinize(s.bets,s.signs,s.pleno);return {complete:true,...result,totals:balance(result.categories,s.prizes,s.bets.length,s.price)};}
function readTxt(text){check(typeof text==='string'&&text.length<=65536,'El TXT supera el tamaño admitido en esta prueba.');const bets=parseTxt(text);check(bets.length<=MAX_BETS,`Esta prueba admite hasta ${MAX_BETS} apuestas por enlace. Divide el TXT en archivos independientes.`);return bets;}
function readMatches(text){check(typeof text==='string'&&text.length<=3000,'La lista de partidos es demasiado grande.');if(!text.trim())return [];const lines=text.trim().split(/\r?\n/).map(s=>s.trim()).filter(Boolean);check(lines.length===15,'Pega los 15 partidos en orden, uno por línea. El último es el Pleno al 15.');return lines.map((line,index)=>{const numbered=line.match(/^(\d{1,2})[.)]\s*/);if(numbered){check(Number(numbered[1])===index+1,'La numeración debe ir del 1 al 15, en el orden de la Quiniela.');line=line.slice(numbered[0].length);}check(line.length>0&&line.length<=90&&!/[\x00-\x1f\x7f]/.test(line),'Revisa el nombre del partido '+(index+1)+'.');return line;});}
module.exports={MAX_BETS,MAX_FRAGMENT,MAX_LINK,categories,amount,validate,encode,decode,makeLink,calculate,readTxt,readMatches};


}};const cache={};function require(id){if(cache[id])return cache[id].exports;const module={exports:{}};cache[id]=module;modules[id](module,module.exports,require);return module.exports;}window.EspartanaCompartir=require('./core.cjs');})();

(function(factory){if(typeof module==='object'&&module.exports)module.exports=factory();else window.EspartanaFixtures=factory();})(function(){
 'use strict';
 const SOURCE='https://www.loteria300.es/quiniela.php';
 function check(ok,message){if(!ok)throw new Error(message);}
 function text(value){const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',aacute:'á',eacute:'é',iacute:'í',oacute:'ó',uacute:'ú',ntilde:'ñ',uuml:'ü',ccedil:'ç',Aacute:'Á',Eacute:'É',Iacute:'Í',Oacute:'Ó',Uacute:'Ú',Ntilde:'Ñ',Uuml:'Ü',Ccedil:'Ç'};return String(value).replace(/<[^>]*>/g,'').replace(/&(#x[\da-f]+|#\d+|\w+);/gi,(raw,key)=>{if(key[0]!=='#')return entities[key]??raw;const n=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));check(Number.isInteger(n)&&n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff),'Entidad de texto incorrecta.');return String.fromCodePoint(n);}).replace(/\s+/g,' ').trim();}
 function seasonForDate(date){check(typeof date==='string'&&/^20\d\d-\d\d-\d\d$/.test(date)&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date,'Fecha de jornada incorrecta.');const year=Number(date.slice(0,4))-(Number(date.slice(5,7))<7?1:0);return year+'-'+String((year+1)%100).padStart(2,'0');}
 function matchesFromRows(rows){check(rows&&typeof rows==='object'&&!Array.isArray(rows),'No se han recibido los partidos.');const names=[];for(let n=1;n<=16;n++){check(typeof rows[n]==='string','Falta el partido '+n+'.');const name=text(rows[n]);check(name.length>0&&name.length<=90&&!/[\x00-\x1f\x7f\ufffd]/.test(name),'Nombre de equipo incorrecto.');names.push(name);}const full=[...names.slice(0,14),names[14]+' - '+names[15]];check(full[14].length<=90,'Nombre del Pleno demasiado largo.');return full;}
 function publicPage(html){check(typeof html==='string'&&html.length<=2000000,'La página de origen es demasiado grande.');const selected=html.match(/\bid=["']p_1_sorteo_jornada_dato["'][^>]*>\s*(\d+)\s*</i);check(selected,'No se identifica la jornada de Lotería 300.');const start=html.search(/\bid=["']dropdownJornadas["']/i);check(start>=0,'No se identifican las fechas disponibles.');const refs=[];for(const match of html.slice(start,start+14000).matchAll(/<a\b([^>]+)>/gi)){const attr={};for(const a of match[1].matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/g))attr[a[1].toLowerCase()]=a[3];if(!attr.idj||!attr.valor||!attr.fechastr)continue;check(/^\d{1,8}$/.test(attr.idj)&&/^\d{1,3}$/.test(attr.valor),'Identificador de jornada incorrecto.');const m=attr.fechastr.match(/^(\d\d)\/(\d\d)\/(\d\d)$/);check(m,'Fecha de Lotería 300 no reconocida.');const date='20'+m[3]+'-'+m[2]+'-'+m[1],round=Number(attr.valor);check(round>=1&&round<=100,'Jornada fuera de rango.');refs.push({id:attr.idj,round,date,season:seasonForDate(date)});}
 check(refs.length>0&&refs.length<=10&&new Set(refs.map(r=>r.season+':'+r.round)).size===refs.length,'Lista de jornadas incompatible.');const current=refs.find(r=>r.round===Number(selected[1]));check(current,'No se identifica la fecha de la jornada actual.');const table=html.match(/<table\b[^>]*\bid=["']tabla_partidos["'][^>]*>([\s\S]*?)<\/table>/i);check(table,'No se identifica el boleto de partidos.');const rows={};for(const row of table[1].matchAll(/<tr\b[^>]*\bid=["']partido_f(\d+)["'][^>]*>([\s\S]*?)<\/tr>/gi)){const n=Number(row[1]);if(n<1||n>16)continue;check(!Object.hasOwn(rows,n),'Partido repetido en origen.');const cell=row[2].match(/<td\b[^>]*>([\s\S]*?)<\/td>/i);check(cell,'Falta la celda de un partido.');rows[n]=cell[1];}return {current,refs,matches:matchesFromRows(rows)};}
 function catalogue(raw){check(raw&&raw.version===1&&raw.source===SOURCE&&typeof raw.fetchedAt==='string'&&Number.isFinite(Date.parse(raw.fetchedAt)),'Catálogo de partidos incompatible.');check(Array.isArray(raw.rounds)&&raw.rounds.length>0&&raw.rounds.length<=220,'Número de jornadas incorrecto.');const seen=new Set(),rounds=raw.rounds.map(r=>{check(r&&typeof r.season==='string'&&Number.isInteger(r.round)&&r.round>=1&&r.round<=100&&seasonForDate(r.date)===r.season,'Jornada o temporada incorrecta en el catálogo.');check(Array.isArray(r.matches)&&r.matches.length===15&&r.matches.every(m=>typeof m==='string'&&m.trim().length>0&&m.length<=90&&!/[\x00-\x1f\x7f\ufffd]/.test(m)),'Partidos incompletos o incorrectos en el catálogo.');const key=r.season+':'+r.round;check(!seen.has(key),'Jornada duplicada en el catálogo.');seen.add(key);return {season:r.season,round:r.round,date:r.date,matches:r.matches.map(m=>m.trim())};});check(raw.current&&rounds.some(r=>r.season===raw.current.season&&r.round===raw.current.round),'La jornada actual no aparece en el catálogo.');return {version:1,source:SOURCE,fetchedAt:raw.fetchedAt,current:{season:raw.current.season,round:raw.current.round},rounds};}
 function find(raw,season,round){const data=catalogue(raw);return data.rounds.find(r=>r.season===season&&r.round===round)||null;}
 return {SOURCE,text,seasonForDate,matchesFromRows,publicPage,catalogue,find};
});
