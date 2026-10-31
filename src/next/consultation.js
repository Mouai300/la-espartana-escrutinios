'use strict';
const {validateResults}=require('./engine');
function check(ok,message){if(!ok)throw new Error(message);}
function roundIdentity(id){check(typeof id==='string'&&/^\d{4}-\d{2}:\d{1,3}$/.test(id),'Identificador de jornada incorrecto.');const [season,n]=id.split(':');check(Number(season.slice(5))===(Number(season.slice(0,4))+1)%100&&Number(n)>=1&&Number(n)<=100&&String(Number(n))===n,'Temporada o jornada incorrecta.');return id;}
function snapshot(input){const values=validateResults(input);check(['manual','loteria300'].includes(input.source),'Origen de resultados incorrecto.');check(typeof input.checkedAt==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(input.checkedAt)&&Number.isFinite(Date.parse(input.checkedAt)),'Falta una fecha de consulta válida.');const status=input.status??'provisional';check(['provisional','final'].includes(status),'Estado de resultados incorrecto.');check(status!=='final'||(!values.signs.includes('?')&&!values.pleno.includes('?')),'Los resultados finales no pueden tener pendientes.');return {...values,status,source:input.source,checkedAt:input.checkedAt};}
function session(input){check(input&&input.version===1&&['round','simulation'].includes(input.mode),'Sesión de consulta incorrecta.');const roundId=roundIdentity(input.roundId),roundResults=snapshot(input.roundResults),simulation=input.simulation===null?null:validateResults(input.simulation);check(input.mode!=='simulation'||simulation!==null,'Falta la simulación.');return {version:1,roundId,mode:input.mode,roundResults,simulation};}
function createSession(roundId,results){return session({version:1,roundId,mode:'round',roundResults:results,simulation:null});}
function startSimulation(raw){const s=session(raw);return {...s,mode:'simulation',simulation:s.simulation||validateResults(s.roundResults)};}
function editSimulation(raw,values){const s=session(raw);check(s.mode==='simulation','Activa la simulación antes de cambiar sus signos.');return {...s,simulation:validateResults(values)};}
function updateRound(raw,roundId,results){const s=session(raw);check(s.roundId===roundIdentity(roundId),'La actualización corresponde a otra jornada.');return {...s,roundResults:snapshot(results)};}
function showRound(raw){return {...session(raw),mode:'round'};}
function activeResults(raw){const s=session(raw);return s.mode==='simulation'?{...s.simulation}:{...s.roundResults};}
function changeRound(raw,roundId,results){session(raw);return createSession(roundId,results);}
module.exports={createSession,startSimulation,editSimulation,updateRound,showRound,activeResults,changeRound,validateSession:session,validateSnapshot:snapshot};
