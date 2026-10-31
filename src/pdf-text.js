const {parseTxt}=require('./engine');
// Recibe texto ya extraído por páginas; no es un motor PDF ni OCR para iOS.
function parseLoteria300Pages(pages){
 const imports=[],ignored=[];
 pages.forEach((text,index)=>{
  if(!/Juego\s*:\s*La Quiniela\b/i.test(text)){ignored.push({page:index+1,reason:/El Quinigol/i.test(text)?'Quinigol':'Juego o formato no reconocido'});return;}
  const count=text.match(/Apuestas\s*:\s*(\d+)/i);
  const blocks=text.split(/Boleto\s*:\s*\d+/i).slice(1);
  const bets=[],elige8Candidates=[];
  for(const block of blocks){
   const pleno=block.match(/Pleno al 15\s*:\s*([012M])\s*,\s*([012M])/i);
   if(!pleno)throw new Error(`Página ${index+1}: falta el Pleno al 15.`);
   const lines=block.split(/\r?\n/).map(line=>line.trim()).filter(line=>/^[1X2](?:\s*,\s*[1X2]){13}$/i.test(line));
   if(!lines.length)throw new Error(`Página ${index+1}: no se reconocen las columnas.`);
   for(const line of lines)bets.push(line.replace(/[\s,]/g,'').toUpperCase()+pleno[1].toUpperCase()+pleno[2].toUpperCase());
   const elige=block.match(/Elige\s*8\s*:\s*([\d, ]+)/i);
   if(elige){
    const numbers=elige[1].trim().split(/\s*,\s*/).map(Number);
    if(numbers.length!==8||new Set(numbers).size!==8||numbers.some(n=>n<1||n>14))throw new Error('Selección Elige 8 incorrecta.');
    const first=lines[0].replace(/[\s,]/g,'').toUpperCase();
    elige8Candidates.push({numbers,picksFromFirstColumn:numbers.map(number=>({number,sign:first[number-1]})),requiresSignConfirmation:true});
   }
  }
  if(!count||bets.length!==Number(count[1]))throw new Error(`Página ${index+1}: la cantidad de apuestas no coincide.`);
  parseTxt(bets.join('\n'));
  imports.push({page:index+1,bets,elige8Candidates,requiresRoundConfirmation:true,requiresReview:true});
 });
 if(!imports.length)throw new Error('No se ha encontrado una página de Quiniela compatible.');
 return {imports,ignored};
}
function parseX15Pages(pages){
 const text=pages.join('\n');const count=text.match(/Total Columnas\s*:\s*(\d+)/i);
 if(!count)throw new Error('No se reconoce el formato X15.');
 const bets=[];let rows=[],groups=null;
 function flush(){
  if(!groups)return;
  if(rows.length!==14)throw new Error('Boleto X15 incompleto: se esperaban 14 filas.');
 }
 for(const raw of text.split(/\r?\n/)){
  const line=raw.trim();
  if(/^Boleto\s+\d+/i.test(line)){
   if(groups)throw new Error('Falta el Pleno del bloque X15 anterior.');
   groups=(line.match(/Boleto\s+\d+/gi)||[]).length;rows=[];continue;
  }
  if(!groups)continue;
  const segments=line.split(/\s{2,}/);
  if(segments.length===groups&&segments.every(s=>/^[1X2](?:\s+[1X2])*$/i.test(s))){rows.push(segments.map(s=>s.split(/\s+/)));continue;}
  if(segments.length===groups&&segments.every(s=>/^[012M]\s*-\s*[012M]$/i.test(s))){
   flush();
   for(let group=0;group<groups;group++){
    const width=rows[0][group].length;
    if(width<1||width>8||rows.some(r=>r[group].length!==width))throw new Error('Columnas X15 desalineadas.');
    const pleno=segments[group].replace(/[\s-]/g,'').toUpperCase();
    for(let column=0;column<width;column++)bets.push(rows.map(r=>r[group][column]).join('').toUpperCase()+pleno);
   }
   groups=null;rows=[];
  }
 }
 if(groups)throw new Error('Falta el Pleno del último bloque X15.');
 if(bets.length!==Number(count[1]))throw new Error('La cantidad de columnas X15 no coincide con el encabezado.');
 parseTxt(bets.join('\n'));
 return {bets,requiresRoundConfirmation:true,requiresReview:true};
}
module.exports={parseLoteria300Pages,parseX15Pages};
