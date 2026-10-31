'use strict';

const S = require('./state'),
  E = require('./engine'),
  C = require('./consultation');
const {
  parsePrizeInputs,
  parseEuro
} = require('./money');
function fail(code) {
  throw Object.assign(new Error(code), {
    code
  });
}
function round(state, id) {
  const value = state.rounds.find(r => r.id === id);
  if (!value) fail('ROUND_REQUIRED');
  return value;
}
function file(state, id) {
  const value = state.files.find(f => f.id === id);
  if (!value) fail('FILE_REQUIRED');
  return value;
}
function baseline(r) {
  return r.results || {
    signs: '??????????????',
    pleno: '??',
    source: 'manual',
    status: 'provisional',
    checkedAt: r.createdAt
  };
}
function sessionFor(state, f) {
  return f.consultation || C.createSession(f.roundId, baseline(round(state, f.roundId)));
}
function view(roundId, fileId = null) {
  return {
    roundId,
    fileId,
    screen: fileId ? 'consultation' : 'files',
    hits: null,
    columnNumber: null
  };
}
function applyCommand(raw, command, now) {
  const state = S.validateState(raw),
    c = command;
  if (!c || typeof c !== 'object') fail('INVALID_COMMAND');
  switch (c.type) {
    case 'addRound':
      {
        const id = c.season + ':' + c.number;
        if (state.rounds.some(r => r.id === id)) fail('ROUND_EXISTS');
        const price = state.seasons[c.season] ?? state.price;
        state.seasons = {
          ...state.seasons,
          [c.season]: price
        };
        state.rounds.push({
          id,
          season: c.season,
          number: c.number,
          matches: c.matches || [],
          results: null,
          prizes: {},
          elige8Prize: null,
          createdAt: now
        });
        state.lastView = view(id);
        break;
      }
    case 'selectRound':
      round(state, c.roundId);
      state.lastView = view(c.roundId);
      break;
    case 'selectFile':
      {
        const f = file(state, c.fileId);
        state.lastView = view(f.roundId, f.id);
        break;
      }
    case 'importTxt':
    case 'importReviewed':
      {
        if (c.type === 'importReviewed' && (c.reviewed !== true || !['photo', 'pdf-loteria300', 'pdf-x15'].includes(c.format))) fail('REVIEW_REQUIRED');
        const r = round(state, c.roundId),
          bets = E.parseTxt(c.text);
        if (state.files.some(f => f.id === c.id)) fail('FILE_ID_EXISTS');
        const set = new Set(bets),
          duplicate = state.files.some(f => f.roundId === r.id && f.bets.length === bets.length && f.bets.every(b => set.has(b)));
        if (duplicate && c.allowDuplicate !== true) fail('DUPLICATE_FILE');
        state.files.push({
          id: c.id,
          roundId: r.id,
          name: c.name,
          bets,
          price: state.seasons[r.season],
          elige8: c.type === 'importReviewed' ? c.elige8 : null,
          importReview: c.type === 'importReviewed' ? {
            format: c.format,
            confirmedAt: now,
            columns: bets.length,
            elige8: c.elige8 === null ? 'excluded' : 'included'
          } : null,
          consultation: null,
          createdAt: now
        });
        state.lastView = view(r.id, c.id);
        break;
      }
    case 'simulate':
      {
        const f = file(state, c.fileId);
        f.consultation = C.editSimulation(C.startSimulation(sessionFor(state, f)), c.results);
        break;
      }
    case 'showRound':
      {
        const f = file(state, c.fileId);
        f.consultation = C.showRound(sessionFor(state, f));
        break;
      }
    case 'roundResults':
      {
        const r = round(state, c.roundId);
        const value = C.validateSnapshot({
          ...c.results,
          source: 'manual',
          status: 'provisional',
          checkedAt: now
        });
        for (const f of state.files.filter(f => f.roundId === r.id)) f.consultation = C.updateRound(sessionFor(state, f), r.id, value);
        r.results = value;
        break;
      }
    case 'filter':
      {
        const f = file(state, c.fileId);
        state.lastView = {
          ...view(f.roundId, f.id),
          screen: 'columns',
          hits: c.hits,
          columnNumber: null
        };
        break;
      }
    case 'column':
      {
        const f = file(state, c.fileId);
        state.lastView = {
          ...view(f.roundId, f.id),
          screen: 'columns',
          hits: null,
          columnNumber: c.number
        };
        break;
      }
    case 'seasonPrice':
      {
        if (typeof c.season !== 'string' || !/^\d{4}-\d{2}$/.test(c.season) || c.season.length !== 7 || Number(c.season.slice(5)) !== (Number(c.season.slice(0, 4)) + 1) % 100) fail('INVALID_SEASON');
        state.price = c.price;
        state.seasons = {
          ...state.seasons,
          [c.season]: c.price
        };
        break;
      }
    case 'setPrizes':
      {
        const r = round(state, c.roundId);
        r.prizes = parsePrizeInputs(c.inputs);
        r.elige8Prize = parseEuro(c.elige8Input);
        r.prizeInfo = {
          source: 'manual',
          checkedAt: now
        };
        break;
      }
    default:
      fail('INVALID_COMMAND');
  }
  state.modifiedAt = now;
  return S.validateState(state);
}
function consultationView(state, fileId) {
  const f = file(state, fileId),
    r = round(state, f.roundId),
    session = sessionFor(state, f),
    results = C.activeResults(session),
    scrutiny = E.scrutinize(f.bets, results);
  return {
    file: f,
    round: r,
    session,
    results,
    scrutiny,
    balance: E.balance(scrutiny, r.prizes, f.price)
  };
}
module.exports = {
  applyCommand,
  consultationView,
  sessionFor
};
