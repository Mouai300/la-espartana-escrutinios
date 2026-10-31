(()=>{
 'use strict';
 const C=window.EspartanaCompartir,$=id=>document.getElementById(id);
 let state=null,visible=100,lastResult=null;
 const euros=c=>c===null?'Pendiente':(c/100).toLocaleString('es-ES',{style:'currency',currency:'EUR'});
 function message(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);}
 function safe(fn){return async event=>{try{await fn(event);}catch(error){if(error.name!=='AbortError')message(error.message||'No se ha podido completar la operación.',true);}};}
 function node(tag,text,className){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;}
 function controls(){return {name:$('name').value.trim(),season:$('season').value.trim(),round:Number($('round').value),price:C.amount($('price').value)};}
 function invalidateLink(){$('link-box').hidden=true;$('link').value='';}
 function sync(){if(!state)return;const prizes={};for(const c of C.categories)prizes[c]=C.amount($('prize-'+c).value);state=C.validate({...state,...controls(),prizes});invalidateLink();update();}
 function pickRow(label,index,choices,kind){const row=node('div',undefined,'pick');row.append(node('span',label));for(const value of choices){const b=node('button',value);b.type='button';b.dataset.kind=kind;b.dataset.index=String(index);b.dataset.value=value;b.setAttribute('aria-label',(kind==='pleno'?'Pleno '+label:'Partido '+label)+': '+(value==='?'?'pendiente':value));row.append(b);}return row;}
 for(let i=0;i<14;i++)$('picks').append(pickRow(String(i+1),i,['?','1','X','2'],'signs'));
 for(let i=0;i<2;i++)$('pleno').append(pickRow(i===0?'L':'V',i,['?','0','1','2','M'],'pleno'));
 for(const c of C.categories){const label=node('label',c===15?'14 + Pleno':c+' aciertos'),input=node('input');input.id='prize-'+c;input.inputMode='decimal';input.placeholder='Pendiente';label.append(input);$('prizes').append(label);input.addEventListener('input',safe(()=>{sync();message('');}));}
 function open(input,received=false){state=C.validate(input);visible=100;for(const id of ['name','season','round'])$(id).value=String(state[id]);$('price').value=(state.price/100).toFixed(2).replace('.',',');for(const c of C.categories)$('prize-'+c).value=state.prizes[c]===null?'':(state.prizes[c]/100).toFixed(2).replace('.',',');$('create').hidden=received;$('consultation').hidden=false;$('empty').hidden=true;invalidateLink();update();}
 function update(){
  if(!state)return;const r=C.calculate(state);lastResult=r;$('title').textContent=state.name;$('round-title').textContent='TEMPORADA '+state.season+' · JORNADA '+state.round;$('file-info').textContent=state.bets.length+' apuestas · '+euros(state.price)+' por apuesta · Cada TXT se escruta por separado.';
  for(const b of document.querySelectorAll('[data-kind]'))b.setAttribute('aria-pressed',String(state[b.dataset.kind][Number(b.dataset.index)]===b.dataset.value));
  $('cost').textContent=euros(r.totals.cost);$('winnings').textContent=euros(r.totals.winnings);$('net').textContent=euros(r.totals.net);
  const pending=[...state.signs].filter(s=>s==='?').length;$('result-status').textContent=r.complete?'Resultados completos introducidos manualmente. Los premios vacíos siguen pendientes.':'Consulta provisional: '+pending+' partidos pendientes'+(state.pleno.includes('?')?' y Pleno pendiente':'')+'. Se muestran máximos alcanzables, no premios definitivos.';
  $('category-heading').textContent=r.complete?'Categoría':'Máximo alcanzable';$('detail-heading').textContent=r.complete?'Aciertos / categoría':'Aciertos conocidos / máximo';
  const summary=document.createDocumentFragment();for(const c of C.categories){const row=node('tr');row.append(node('td',c===15?(r.complete?'14 + Pleno':'Opciones de 14 + Pleno'):c+' aciertos'));row.append(node('td',String(r.complete?r.categories[c]:r.rows.filter(v=>c===15?v.canReach15:v.maxHits===c).length)));summary.append(row);}$('categories').replaceChildren(summary);renderBets();
 }
 function renderBets(){const body=document.createDocumentFragment();for(const row of lastResult.rows.slice(0,visible)){const tr=node('tr');tr.append(node('td',String(row.number)),node('td',state.bets[row.number-1]),node('td',lastResult.complete?row.hits+' / '+(row.category===15?'14 + Pleno':row.category??'sin premio'):row.hits+' / '+row.maxHits));body.append(tr);}$('bets').replaceChildren(body);$('more').hidden=visible>=state.bets.length;}
 function link(){sync();const url=C.makeLink(state,location.href);$('link').value=url;$('link-box').hidden=false;return url;}
 $('txt').addEventListener('change',safe(async event=>{const f=event.target.files[0];if(!f)return;try{if(f.size>65536)throw new Error('El TXT supera 64 KiB. Esta prueba admite hasta 1.000 apuestas por enlace.');const bets=C.readTxt(await f.text()),name=(f.name.replace(/\.txt$/i,'').replace(/[\x00-\x1f\x7f]/g,'').slice(0,80)||'Mi combinación');open({...controls(),name,bets,signs:'??????????????',pleno:'??',prizes:{}});message('Combinación preparada. Revisa la temporada, la jornada y el precio antes de compartir.');}finally{event.target.value='';}}));
 for(const id of ['name','season','round','price'])$(id).addEventListener('input',safe(()=>{invalidateLink();sync();message('');}));
 for(const id of ['picks','pleno'])$(id).addEventListener('click',safe(event=>{const b=event.target.closest('button[data-kind]');if(!b||!state)return;sync();const key=b.dataset.kind,values=[...state[key]];values[Number(b.dataset.index)]=b.dataset.value;state=C.validate({...state,[key]:values.join('')});invalidateLink();update();message('');}));
 $('reset').addEventListener('click',safe(()=>{sync();state={...state,signs:'??????????????',pleno:'??'};invalidateLink();update();message('Consulta restablecida.');}));
 $('demo').addEventListener('click',safe(()=>{open({name:'EJEMPLO FICTICIO · 4 apuestas',season:'2026-27',round:1,price:75,bets:['1111111111111121','1111111111111100','X111111111111121','XX11111111111121'],signs:'11111111111111',pleno:'21',prizes:{15:1000000,14:100000,13:10000,12:1000}});message('Ejemplo ficticio: apuestas, resultados y premios de demostración.');}));
 $('more').addEventListener('click',()=>{visible+=100;renderBets();});
 $('copy').addEventListener('click',safe(async()=>{const url=link();if(navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(url);message('Enlace copiado. Pégalo en el chat de WhatsApp.');return;}catch{}}$('link').focus();$('link').select();message('Mantén pulsado el enlace, elige Copiar y pégalo en WhatsApp.');}));
 $('share').addEventListener('click',safe(async()=>{const url=link();if(navigator.share){await navigator.share({title:'La Espartana · '+state.name,text:'Jornada '+state.round+' · '+state.bets.length+' apuestas. Consulta manual, sin instalar nada.',url});}else{message('Copia el enlace de abajo y pégalo en WhatsApp.');$('link').focus();$('link').select();}}));
 $('print').addEventListener('click',safe(()=>{sync();window.print();}));
 function receive(){if(!location.hash)return;try{open(C.decode(location.hash.slice(1)),true);message('Combinación recibida. Los cambios que hagas serán una consulta propia; no modifican el enlace original.');}catch(error){$('create').hidden=false;$('consultation').hidden=true;$('empty').hidden=false;state=null;message(error.message,true);}}
 window.addEventListener('hashchange',receive);receive();
})();
