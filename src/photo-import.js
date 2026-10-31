function groupObservations(observations){
 const rows=[];
 const valid=observations.filter(o=>typeof o.text==='string'&&Number.isFinite(o.x)&&Number.isFinite(o.y)&&Number.isFinite(o.height)&&o.height>0);
 for(const observation of valid.slice().sort((a,b)=>b.y-a.y)){
  const row=rows.find(r=>Math.abs(r.y-observation.y)<Math.min(r.height,observation.height)*0.6);
  if(row)row.items.push(observation);else rows.push({y:observation.y,height:observation.height,items:[observation]});
 }
 return rows.map(row=>({text:row.items.sort((a,b)=>a.x-b.x).map(o=>o.text).join(' '),confidence:Math.min(...row.items.map(o=>o.confidence??0))}));
}
function preparePhotoReview(observations){
 const lines=groupObservations(observations);
 const all=lines.map(line=>line.text).join('\n');
 if(!/LA\s+QUINIELA/i.test(all))throw new Error('No se identifica un resguardo de La Quiniela. Fotografía el boleto completo, recto y con buena luz.');
 const countMatch=all.match(/(?:^|\n)\s*(\d+)\s+APUESTA\s*\(?S?\)?/i);
 const count=Number(countMatch?.[1]);
 if(!Number.isInteger(count)||count<1||count>8)throw new Error('No se reconoce el número de columnas simples (de 1 a 8). Revisa el encuadre.');
 const rows=new Map(),warnings=[];
 for(const line of lines){
  const match=line.text.match(/^\s*(\d{1,2})[.,]\s*(.*)$/);
  if(!match)continue;
  const number=Number(match[1]);if(number<1||number>14)continue;
  if(rows.has(number))throw new Error('Hay números de partido repetidos en la lectura. Repite la foto.');
  const cells=match[2].toUpperCase().replace(/\s/g,'');
  const clear=line.confidence>=0.75&&cells.length>=count&&cells.length<=count+1;
  rows.set(number,{signs:Array.from({length:count},(_,i)=>clear&&/^[1X2]$/.test(cells[i]||'')?cells[i]:'?'),elige:clear&&cells.length===count+1&&/^[1X2]$/.test(cells[count])?cells[count]:null});
 }
 if(rows.size<8)throw new Error('Se reconocen muy pocas filas del boleto. Repite la foto o utiliza un PDF/TXT.');
 const plenoLine=lines.find(line=>/^\s*15[.,]/.test(line.text));
 const plenoMatch=plenoLine?.text.toUpperCase().match(/^\s*15[.,]\s*([012M])\s*-\s*([012M])\s*$/);
 const pleno=plenoMatch&&plenoLine.confidence>=0.75?plenoMatch[1]+plenoMatch[2]:'??';
 const bets=Array.from({length:count},(_,column)=>Array.from({length:14},(_,i)=>rows.get(i+1)?.signs[column]||'?').join('')+pleno);
 const unknown=bets.reduce((sum,bet)=>sum+[...bet].filter(s=>s==='?').length,0);
 if(unknown)warnings.push(`${unknown} signos sin confirmar: sustituye todos los ? antes de importar.`);
 const eligeRows=[...rows.entries()].filter(([,row])=>row.elige).sort((a,b)=>a[0]-b[0]);
 const candidates=[];
 if(/ELIGE\s*8/i.test(all)){
  if(eligeRows.length===8)candidates.push({numbers:eligeRows.map(([number])=>number),picksFromFirstColumn:eligeRows.map(([number,row])=>({number,sign:row.elige})),requiresSignConfirmation:true,signSource:'Columna Elige 8 de la foto. Revisa los ocho signos.'});
  else warnings.push('No se han reconocido ocho selecciones de Elige 8. Añádelo manualmente después de importar las columnas.');
 }
 return {format:'Foto de resguardo · OCR',bets,reviewText:bets.join('\n'),candidates,ignored:[],warnings};
}
module.exports={groupObservations,preparePhotoReview};
