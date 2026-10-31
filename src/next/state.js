'use strict';

const {
    validateBets
  } = require('./engine'),
  {
    validateSession,
    validateSnapshot,
    createSession,
    startSimulation,
    editSimulation
  } = require('./consultation'),
  {
    validateElige8
  } = require('../elige8');
const VERSION = 3,
  MAX_STATE_CHARS = 8000000,
  MAX_TOTAL_COLUMNS = 100000;
const CATEGORIES = ['15', '14', '13', '12', '11', '10'];
function check(ok, msg) {
  if (!ok) throw new Error(msg);
}
function object(value, label) {
  check(value && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null), label + ' incorrecto.');
  check(!Object.keys(value).some(k => ['__proto__', 'constructor', 'prototype'].includes(k)), label + ' contiene claves no permitidas.');
  return value;
}
function string(value, max, label) {
  check(typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value), label + ' incorrecto.');
  return value;
}
function season(value) {
  check(typeof value === 'string' && value.length === 7 && /^\d{4}-\d{2}$/.test(value) && Number(value.slice(5)) === (Number(value.slice(0, 4)) + 1) % 100, 'Temporada incorrecta.');
  return value;
}
function cents(value, positive = false) {
  check(Number.isSafeInteger(value) && (positive ? value > 0 : value >= 0), 'Importe en céntimos incorrecto.');
  return value;
}
function date(value) {
  check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value)), 'Fecha de datos incorrecta.');
  check(new Date(value).toISOString() === (value.includes('.') ? value : value.replace('Z', '.000Z')), 'Fecha de calendario incorrecta.');
  return value;
}
function prizes(value) {
  object(value, 'Premios');
  check(Object.keys(value).every(k => CATEGORIES.includes(k)), 'Categoría de premio incorrecta.');
  return Object.fromEntries(CATEGORIES.map(k => [k, value[k] === null || value[k] === undefined ? null : cents(value[k])]));
}
function emptyState(now) {
  date(now);
  return {
    version: VERSION,
    price: 75,
    seasons: {},
    rounds: [],
    files: [],
    lastView: null,
    modifiedAt: now,
    lastBackupAt: null
  };
}
function validateState(raw) {
  object(raw, 'Estado');
  check(raw.version === VERSION, 'Versión de datos incompatible.');
  check(Array.isArray(raw.rounds) && raw.rounds.length <= 2000 && Array.isArray(raw.files) && raw.files.length <= 2000, 'Listado de jornadas o archivos incorrecto.');
  const seasons = {};
  object(raw.seasons, 'Temporadas');
  check(Object.keys(raw.seasons).length <= 2000, 'Demasiadas temporadas.');
  for (const [id, price] of Object.entries(raw.seasons)) seasons[season(id)] = cents(price, true);
  const ids = new Set(),
    rounds = raw.rounds.map(r => {
      object(r, 'Jornada');
      season(r.season);
      check(Number.isInteger(r.number) && r.number >= 1 && r.number <= 100 && r.id === r.season + ':' + r.number && !ids.has(r.id), 'Jornada duplicada o identificador incorrecto.');
      ids.add(r.id);
      check(Object.hasOwn(seasons, r.season), 'La temporada de la jornada no tiene precio.');
      check(Array.isArray(r.matches) && (r.matches.length === 0 || r.matches.length === 15), 'Lista de partidos incorrecta.');
      const matches = r.matches.map((m, i) => {
        object(m, 'Partido');
        check(m.number === i + 1, 'Orden de partidos incorrecto.');
        return {
          number: i + 1,
          label: string(m.label, 90, 'Equipo'),
          startsAt: m.startsAt === null ? null : date(m.startsAt),
          sourceId: m.sourceId === null ? null : string(m.sourceId, 100, 'Identificador de origen')
        };
      });
      const results = r.results === null ? null : validateSnapshot(r.results);
      if (results) date(results.checkedAt);
      let prizeInfo = null;
      if (r.prizeInfo !== null && r.prizeInfo !== undefined) {
        object(r.prizeInfo, 'Origen de premios');
        check(r.prizeInfo.source === 'manual', 'Origen de premios no compatible.');
        prizeInfo = {
          source: 'manual',
          checkedAt: date(r.prizeInfo.checkedAt)
        };
      }
      return {
        id: r.id,
        season: r.season,
        number: r.number,
        matches,
        results,
        prizes: prizes(r.prizes),
        prizeInfo,
        elige8Prize: r.elige8Prize === null ? null : cents(r.elige8Prize),
        createdAt: date(r.createdAt)
      };
    });
  const fileIds = new Set();
  let total = 0;
  const files = raw.files.map(f => {
    object(f, 'Archivo');
    string(f.id, 100, 'Identificador de archivo');
    check(!fileIds.has(f.id) && ids.has(f.roundId), 'Archivo repetido o sin jornada válida.');
    fileIds.add(f.id);
    validateBets(f.bets);
    total += f.bets.length;
    check(total <= MAX_TOTAL_COLUMNS, 'El conjunto de archivos supera el límite de columnas.');
    let consultation = null;
    if (f.consultation !== null) {
      consultation = validateSession(f.consultation);
      check(consultation.roundId === f.roundId, 'La consulta corresponde a otra jornada.');
      date(consultation.roundResults.checkedAt);
      const source = rounds.find(r => r.id === f.roundId).results;
      check(source === null ? consultation.roundResults.signs === '??????????????' && consultation.roundResults.pleno === '??' : JSON.stringify(source) === JSON.stringify(consultation.roundResults), 'La consulta no contiene los últimos resultados guardados de su jornada.');
    }
    if (f.elige8 !== null) {
      object(f.elige8, 'Elige 8');
      check(Array.isArray(f.elige8.picks), 'Selecciones de Elige 8 incorrectas.');
      for (const p of f.elige8.picks) {
        object(p, 'Selección de Elige 8');
        check(typeof p.sign === 'string' && p.sign.length === 1, 'El signo de Elige 8 debe ser texto de un carácter.');
      }
    }
    const ticket = f.elige8 === null ? null : validateElige8(f.elige8);
    const price = cents(f.price, true);
    check(Number.isSafeInteger(price * f.bets.length + (ticket?.cost ?? 0)), 'El coste del archivo supera la precisión permitida.');
    let importReview = null;
    if (f.importReview !== undefined && f.importReview !== null) {
      const meta = object(f.importReview, 'Revisión de importación');
      check(['photo', 'pdf-loteria300', 'pdf-x15'].includes(meta.format) && meta.columns === f.bets.length && meta.elige8 === (ticket ? 'included' : 'excluded'), 'Revisión de importación incorrecta.');
      importReview = {
        format: meta.format,
        confirmedAt: date(meta.confirmedAt),
        columns: meta.columns,
        elige8: meta.elige8
      };
    }
    return {
      id: f.id,
      roundId: f.roundId,
      name: string(f.name, 200, 'Nombre del archivo'),
      bets: f.bets.slice(),
      price,
      importReview,
      elige8: ticket ? {
        cost: ticket.cost,
        picks: ticket.picks.map(p => ({
          number: p.number,
          sign: p.sign
        }))
      } : null,
      consultation,
      createdAt: date(f.createdAt)
    };
  });
  let lastView = null;
  if (raw.lastView !== null) {
    object(raw.lastView, 'Última pantalla');
    const v = raw.lastView;
    check(ids.has(v.roundId) && ['files', 'consultation', 'columns'].includes(v.screen), 'Pantalla guardada incorrecta.');
    check(v.fileId === null || files.some(f => f.id === v.fileId && f.roundId === v.roundId), 'Archivo seleccionado incorrecto.');
    check(v.hits === null || Number.isInteger(v.hits) && v.hits >= 0 && v.hits <= 14, 'Filtro guardado incorrecto.');
    check(v.columnNumber === null || v.fileId !== null && Number.isInteger(v.columnNumber) && v.columnNumber >= 1 && v.columnNumber <= files.find(f => f.id === v.fileId).bets.length, 'Columna seleccionada incorrecta.');
    lastView = {
      roundId: v.roundId,
      fileId: v.fileId,
      screen: v.screen,
      hits: v.hits,
      columnNumber: v.columnNumber
    };
  }
  return {
    version: VERSION,
    price: cents(raw.price, true),
    seasons,
    rounds,
    files,
    lastView,
    modifiedAt: date(raw.modifiedAt),
    lastBackupAt: raw.lastBackupAt === null ? null : date(raw.lastBackupAt)
  };
}
function encodeState(raw) {
  const clean = validateState(raw),
    json = JSON.stringify(clean);
  check(json.length <= MAX_STATE_CHARS, 'El historial supera el límite de almacenamiento.');
  return json;
}
function decodeState(text) {
  check(typeof text === 'string' && text.length <= MAX_STATE_CHARS, 'Archivo de datos demasiado grande.');
  return validateState(JSON.parse(text));
}
function migrateLegacy(text, {
  now,
  roundMapping = {}
} = {}) {
  date(now);
  check(typeof text === 'string' && text.length <= MAX_STATE_CHARS, 'Copia antigua demasiado grande.');
  const old = object(JSON.parse(text), 'Copia antigua');
  check(old.version === 1 || old.version === 2, 'Versión de copia antigua no compatible.');
  check(Array.isArray(old.rounds) && Array.isArray(old.files), 'La copia antigua está incompleta.');
  check(old.rounds.length <= 2000 && old.files.length <= 2000, 'Demasiados registros en la copia.');
  const next = emptyState(now);
  next.price = cents(old.price, true);
  object(old.seasons ?? {}, 'Precios de temporada');
  for (const [id, value] of Object.entries(old.seasons || {})) next.seasons[season(id)] = cents(value, true);
  next.rounds = old.rounds.map(r => {
    object(r, 'Jornada antigua');
    season(r.season);
    next.seasons[r.season] ??= next.price;
    return {
      id: r.id,
      season: r.season,
      number: r.number,
      matches: [],
      results: null,
      prizes: prizes(r.prizes || {}),
      elige8Prize: r.elige8Prize ?? null,
      createdAt: r.createdAt || now
    };
  });
  const orphanFiles = [];
  next.files = old.files.map(f => {
    object(f, 'Archivo antiguo');
    const roundId = next.rounds.some(r => r.id === f.roundId) ? f.roundId : Object.hasOwn(roundMapping, f.id) ? roundMapping[f.id] : null;
    if (!roundId || !next.rounds.some(r => r.id === roundId)) orphanFiles.push({
      id: f.id,
      name: f.name
    });
    let consultation = null;
    if (f.consultation && roundId) {
      const baseline = {
        signs: '??????????????',
        pleno: '??',
        status: 'provisional',
        source: 'manual',
        checkedAt: now
      };
      consultation = editSimulation(startSimulation(createSession(roundId, baseline)), f.consultation);
    }
    return {
      id: f.id,
      roundId: roundId || null,
      name: f.name,
      bets: f.bets,
      price: f.price,
      elige8: f.elige8 || null,
      consultation,
      createdAt: f.createdAt || now
    };
  });
  check(orphanFiles.length === 0, 'Hay archivos sin jornada. Asigna una jornada expresamente antes de importar: ' + orphanFiles.length + '.');
  const state = validateState(next);
  return {
    state,
    review: {
      rounds: state.rounds.length,
      files: state.files.length,
      columns: state.files.reduce((n, f) => n + f.bets.length, 0),
      simulations: state.files.filter(f => f.consultation).length,
      notes: ['Las consultas antiguas se conservan como simulación provisional.', 'Los premios se recalcularán con 15 más 14.', 'La copia original no se modifica ni se elimina.']
    }
  };
}
module.exports = {
  VERSION,
  MAX_STATE_CHARS,
  MAX_TOTAL_COLUMNS,
  emptyState,
  validateState,
  encodeState,
  decodeState,
  migrateLegacy
};
