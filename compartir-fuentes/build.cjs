const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=__dirname,dest=process.argv[2]?path.resolve(process.argv[2]):path.resolve(root,'../dist-compartir');fs.mkdirSync(dest,{recursive:true});
const enginePath=fs.existsSync(path.join(root,'../src/engine.js'))?path.join(root,'../src/engine.js'):path.join(root,'engine.cjs');
const engine=fs.readFileSync(enginePath,'utf8');fs.writeFileSync(path.join(root,'engine.cjs'),engine);
const core=fs.readFileSync(path.join(root,'core.cjs'),'utf8')+'\n';
const bundled=`(()=>{'use strict';const modules={'./engine.cjs':(module,exports,require)=>{\n${engine}\n},'./core.cjs':(module,exports,require)=>{\n${core}\n}};const cache={};function require(id){if(cache[id])return cache[id].exports;const module={exports:{}};cache[id]=module;modules[id](module,module.exports,require);return module.exports;}window.EspartanaCompartir=require('./core.cjs');})();\n`;
function asset(label,ext,content){const hash=crypto.createHash('sha256').update(content).digest('hex').slice(0,12),name=`compartir-${label}.${hash}.${ext}`;fs.writeFileSync(path.join(dest,name),content);return name;}
const files={CORE:asset('core','js',bundled+'\n'+fs.readFileSync(path.join(root,'fixtures.cjs'),'utf8')),UI:asset('ui','js',fs.readFileSync(path.join(root,'ui.js'),'utf8')),CSS:asset('estilo','css',fs.readFileSync(path.join(root,'style.css'),'utf8'))};
let html=fs.readFileSync(path.join(root,'compartir.html'),'utf8');for(const [key,name]of Object.entries(files))html=html.replace(`__${key}__`,'./'+name);fs.writeFileSync(path.join(dest,'compartir.html'),html);
const list=['compartir.html',...Object.values(files)];fs.writeFileSync(path.join(dest,'archivos-publicacion.json'),JSON.stringify(list,null,2));console.log(JSON.stringify({dest,files:list}));
