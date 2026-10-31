'use strict';

const {
    preparePdfReview
  } = require('../pdf-import'),
  {
    preparePhotoReview
  } = require('../photo-import');
const E = require('./engine');
function fail(code) {
  throw Object.assign(new Error(code), {
    code
  });
}
function validateReading(kind, raw) {
  if (!raw || typeof raw !== 'object') fail('DOCUMENT_UNREADABLE');
  if (raw.preview !== null && raw.preview !== undefined && (typeof raw.preview !== 'string' || raw.preview.length > 2000000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(raw.preview))) fail('DOCUMENT_UNREADABLE');
  if (kind === 'pdf') {
    if (!Array.isArray(raw.pages) || raw.pages.length < 1 || raw.pages.length > 50) fail('DOCUMENT_LIMIT');
    let chars = 0;
    for (const p of raw.pages) {
      if (!p || typeof p.plain !== 'string' || typeof p.layout !== 'string') fail('DOCUMENT_UNREADABLE');
      chars += p.plain.length + p.layout.length;
      if (chars > 2000000) fail('DOCUMENT_LIMIT');
    }
    const parsed = preparePdfReview(raw.pages);
    if (parsed.ignored.some(page => page.reason !== 'Quinigol')) fail('DOCUMENT_PARTIAL_UNKNOWN');
    return parsed;
  }
  if (kind !== 'photo' || !Array.isArray(raw.observations) || raw.observations.length > 1500) fail('DOCUMENT_LIMIT');
  let chars = 0;
  for (const o of raw.observations) {
    if (!o || typeof o.text !== 'string' || o.text.length > 2000 || ![o.x, o.y, o.height, o.confidence].every(Number.isFinite) || o.x < 0 || o.x > 1 || o.y < 0 || o.y > 1 || o.height <= 0 || o.height > 1 || o.confidence < 0 || o.confidence > 1) fail('DOCUMENT_UNREADABLE');
    chars += o.text.length;
    if (chars > 100000) fail('DOCUMENT_LIMIT');
  }
  return preparePhotoReview(raw.observations);
}
function eligeDecision(value) {
  if (!value || !['include', 'exclude'].includes(value.mode)) fail('ELIGE_DECISION_REQUIRED');
  if (value.mode === 'exclude') return null;
  if (typeof value.numbers !== 'string' || typeof value.signs !== 'string' || typeof value.cost !== 'string') fail('ELIGE_INVALID');
  if (value.numbers.length > 128 || value.signs.length > 8 || value.cost.length > 16) fail('ELIGE_INVALID');
  const costText = value.cost.trim();
  const text = value.numbers.replace(/\s/g, ''),
    signs = value.signs.toUpperCase();
  if (!/^\d{1,2}(,\d{1,2}){7}$/.test(text) || signs.length !== 8 || !/^[1X2]{8}$/.test(signs) || !/^\d{1,6}([,.]\d{1,2})?$/.test(costText)) fail('ELIGE_INVALID');
  const numbers = text.split(',').map(Number);
  if (new Set(numbers).size !== 8 || numbers.some(n => n < 1 || n > 14)) fail('ELIGE_INVALID');
  return {
    cost: Math.round(Number(costText.replace(',', '.')) * 100),
    picks: numbers.map((number, i) => ({
      number,
      sign: signs[i]
    }))
  };
}
function createDocumentReview({
  access,
  workspace,
  reader
}) {
  let epoch = 0,
    pending = null,
    busy = false,
    disposed = false,
    unsubscribe = null;
  function clear() {
    epoch++;
    pending = null;
  }
  function connect() {
    if (unsubscribe) return;
    disposed = false;
    unsubscribe = access.subscribe(({
      status
    }) => {
      if (status !== 'unlocked') clear();
    });
  }
  return {
    cancel: clear,
    connect,
    async prepare({
      kind,
      uri,
      name,
      roundId
    }) {
      if (disposed) fail('REVIEW_REQUIRED');
      connect();
      if (busy) fail('DOCUMENT_BUSY');
      clear();
      const stamp = epoch,
        ticket = workspace.ticket();
      if (!workspace.snapshot().state.rounds.some(r => r.id === roundId)) fail('ROUND_REQUIRED');
      if (typeof name !== 'string' || name.length < 1 || name.length > 200) fail('DOCUMENT_UNREADABLE');
      busy = true;
      try {
        const raw = await reader(uri, kind);
        workspace.assertTicket(ticket);
        if (stamp !== epoch) fail('STALE_VIEW');
        let parsed;
        try {
          parsed = validateReading(kind, raw);
        } catch (error) {
          if (error.code) throw error;
          fail('DOCUMENT_UNREADABLE');
        }
        const count = parsed.bets.length;
        if (count < 1 || count > E.MAX_COLUMNS) fail('DOCUMENT_LIMIT');
        const token = Object.freeze({}),
          candidate = parsed.candidates[0] || null;
        pending = {
          token,
          ticket,
          stamp,
          roundId,
          name,
          count,
          format: kind === 'photo' ? 'photo' : parsed.format === 'Lotería 300' ? 'pdf-loteria300' : 'pdf-x15'
        };
        return {
          token,
          roundId,
          name,
          count,
          format: pending.format,
          reviewText: parsed.reviewText,
          preview: raw.preview || null,
          pageCount: raw.pages?.length || 1,
          warnings: [...(parsed.warnings || []), ...(parsed.ignored || []).map(x => 'Página ' + x.page + ': ' + x.reason + ' (sin importar).')],
          eligeNumbers: candidate ? candidate.numbers.join(',') : '',
          eligeSigns: kind === 'photo' && candidate ? candidate.picksFromFirstColumn.map(p => p.sign).join('') : ''
        };
      } finally {
        busy = false;
      }
    },
    async confirm(token, values) {
      if (busy) fail('DOCUMENT_BUSY');
      const item = pending;
      if (!item || item.token !== token || item.stamp !== epoch) fail('REVIEW_REQUIRED');
      workspace.assertTicket(item.ticket);
      if (!values || typeof values !== 'object' || values.reviewed !== true) fail('REVIEW_REQUIRED');
      let bets;
      try {
        bets = E.parseTxt(values.text);
      } catch {
        fail('DOCUMENT_BETS_INVALID');
      }
      if (bets.length !== item.count) fail('DOCUMENT_COUNT_CHANGED');
      const elige8 = eligeDecision(values.elige);
      busy = true;
      try {
        const result = await workspace.apply({
          type: 'importReviewed',
          roundId: item.roundId,
          id: values.id,
          name: item.name,
          text: bets.join('\n'),
          elige8,
          format: item.format,
          reviewed: true,
          allowDuplicate: values.allowDuplicate === true
        }, item.ticket);
        if (item.stamp === epoch) clear();
        return result;
      } finally {
        busy = false;
      }
    },
    dispose() {
      clear();
      unsubscribe?.();
      unsubscribe = null;
      disposed = true;
    }
  };
}
module.exports = {
  createDocumentReview,
  validateReading,
  eligeDecision
};
