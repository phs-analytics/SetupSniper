// Limites de chamadas (balde de fichas) e pausa após bloqueio, com relógio falso: sem rede e sem esperar de verdade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLimiter, limiterFor, resetLimiters, SOURCE_LIMITS, pauseHours,
  blockPause, startBlockPause, clearBlockPause, listBlockPauses } from '../src/rate-limit.js';

function fakeClock(t0 = Date.UTC(2026, 10, 4, 12, 0, 0)) {
  const c = { t: t0, slept: [] };
  c.now = () => c.t;
  c.sleep = async (ms) => { c.slept.push(ms); c.t += ms; };
  return c;
}

test('source-limits.json: cada limite tem número, fonte e data', () => {
  const j = JSON.parse(readFileSync(new URL('../data/source-limits.json', import.meta.url), 'utf8'));
  for (const [id, f] of Object.entries(j.fontes)) {
    assert.ok(Number.isInteger(f.porMinuto) && f.porMinuto > 0, id);
    assert.ok(f.fonte && /^\d{4}-\d{2}-\d{2}$/.test(f.data), id);
  }
  assert.equal(j.fontes.awin.porMinuto, 20);
  assert.equal(j.fontes.lomadee.porMinuto, 10);
  assert.equal(j.pausaAposBloqueioHoras.valor, 6);
  assert.ok(j.pausaAposBloqueioHoras.fonte && j.pausaAposBloqueioHoras.data);
  assert.equal(pauseHours(), 6);
  assert.equal(SOURCE_LIMITS.fontes.awin.porMinuto, 20);
});

test('balde de fichas: nunca passa de N chamadas em 60 s e espera a vez', async () => {
  const c = fakeClock();
  const lim = createLimiter({ porMinuto: 10, nome: 'Teste' }, { now: c.now, sleep: c.sleep });
  const t0 = c.t;
  const times = [];
  for (let i = 0; i < 25; i++) { await lim.take({ maxWaitMs: 1e9 }); times.push(c.t - t0); }
  // em qualquer janela de 60 s, no máximo 10 chamadas
  for (const start of times) assert.ok(times.filter(x => x >= start && x < start + 60000).length <= 10);
  assert.equal(times[0], 0);
  assert.equal(times[1], 6000);
});

test('balde de fichas: chamadas simultâneas entram na fila, sem estourar o limite', async () => {
  const c = fakeClock();
  // aqui o relógio fica parado: as cinco chamadas chegam no mesmo instante
  const lim = createLimiter({ porMinuto: 20 }, { now: c.now, sleep: async (ms) => { c.slept.push(ms); } });
  await Promise.all(Array.from({ length: 5 }, () => lim.take({ maxWaitMs: 1e9 })));
  // 1 imediata + 4 esperas de 3 s, 6 s, 9 s e 12 s (reservadas na hora, em ordem)
  assert.deepEqual([...c.slept].sort((a, b) => a - b), [3000, 6000, 9000, 12000]);
});

test('balde de fichas: espera longa demais falha com mensagem clara', async () => {
  const c = fakeClock();
  const lim = createLimiter({ porMinuto: 2, nome: 'Lomadee' }, { now: c.now, sleep: c.sleep });
  await lim.take({ maxWaitMs: 1000 });
  await assert.rejects(lim.take({ maxWaitMs: 1000 }), /Lomadee.*2 chamadas por minuto.*30 s/);
  // a tentativa recusada não gasta ficha
  c.t += 30000;
  await lim.take({ maxWaitMs: 0 });
});

test('balde de fichas: teto diário', async () => {
  const c = fakeClock();
  const lim = createLimiter({ porMinuto: 600, porDia: 3, nome: 'Amazon Creators API' }, { now: c.now, sleep: c.sleep });
  for (let i = 0; i < 3; i++) await lim.take({ maxWaitMs: 1e9 });
  await assert.rejects(lim.take({ maxWaitMs: 1e9 }), /limite diário de 3 chamadas/);
  c.t += 24 * 3600e3;
  await lim.take({ maxWaitMs: 1e9 });
});

test('limiterFor usa o limite do JSON e é o mesmo objeto por fonte', async () => {
  resetLimiters();
  const c = fakeClock();
  const a = limiterFor('awin', { now: c.now, sleep: c.sleep });
  assert.equal(a, limiterFor('awin'));
  assert.equal(a.porMinuto, 20);
  assert.throws(() => limiterFor('fonte-que-nao-existe'), /sem limite cadastrado/);
  resetLimiters();
});

test('pausa após bloqueio: dura 6 h, informa até quando e pode ser limpa', () => {
  clearBlockPause();
  const t = Date.UTC(2026, 10, 4, 12, 0, 0);
  assert.equal(blockPause('pichau', { now: t }), null);
  const p = startBlockPause('pichau', { now: t, reason: 'HTTP 403 (bloqueio anti-bot)' });
  assert.equal(p.until, new Date(t + 6 * 3600e3).toISOString());
  assert.equal(blockPause('pichau', { now: t + 3600e3 }).until, p.until);
  assert.equal(blockPause('pichau', { now: t + 3600e3 }).reason, 'HTTP 403 (bloqueio anti-bot)');
  assert.equal(blockPause('kabum', { now: t }), null);
  assert.deepEqual(Object.keys(listBlockPauses({ now: t })), ['pichau']);
  // depois de 6 h a pausa acaba sozinha
  assert.equal(blockPause('pichau', { now: t + 6 * 3600e3 }), null);
  startBlockPause('pichau', { now: t });
  clearBlockPause('pichau');
  assert.equal(blockPause('pichau', { now: t }), null);
});
