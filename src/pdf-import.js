const {parseLoteria300Pages,parseX15Pages}=require('./pdf-text');
const {parseTxt}=require('./engine');
function preparePdfReview(pages){
 if(!Array.isArray(pages)||!pages.length||pages.every(p=>!p.plain?.trim()&&!p.layout?.trim()))throw new Error('Este PDF no contiene texto legible. La lectura de escaneos requiere OCR y aún no está disponible.');
 const layout=pages.map(p=>p.layout||p.plain||'');
 const plain=pages.map(p=>p.plain||p.layout||'');
 let parsed;
 if(layout.some(p=>/Total Columnas\s*:/i.test(p))){
  const x=parseX15Pages(layout);parsed={format:'X15 Súper Plus',bets:x.bets,candidates:[],ignored:[]};
 }else{
  let result;
  try{result=parseLoteria300Pages(plain);}catch{result=parseLoteria300Pages(layout);}
  parsed={format:'Lotería 300',bets:result.imports.flatMap(p=>p.bets),candidates:result.imports.flatMap(p=>p.elige8Candidates),ignored:result.ignored};
 }
 parseTxt(parsed.bets.join('\n'));
 if(parsed.candidates.length>1)throw new Error('Este PDF contiene varios Elige 8. Importa cada boleto por separado para no mezclarlos.');
 return {...parsed,reviewText:parsed.bets.join('\n')};
}
module.exports={preparePdfReview};
