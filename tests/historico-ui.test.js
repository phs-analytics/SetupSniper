// Interface do histórico (public/historico.js): minigráfico SVG e selos, funções puras sem DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sparklineSvg, historyBadges, dailyMin, brl } from '../public/historico.js';
import { computeIndicators } from '../src/price-history.js';

const SERIES = JSON.parse(readFileSync(new URL('./fixtures/historico-series.json', import.meta.url), 'utf8'));
const NOW = Date.parse(SERIES.agora), DIA = 864e5;
const pts = (nome) => SERIES.series[nome].pontos.map((p) => ({ t: new Date(NOW - p.diasAtras * DIA).toISOString(), store: 'kabum', seller: null, pix: p.pix }));
const plain = (s) => s.replace(/ /g, ' ');

test('brl formata centavos', () => {
  assert.equal(plain(brl(189990)), 'R$ 1.899,90');
  assert.equal(brl(null), '—');
});

test('sem pontos: "histórico começando", sem gráfico inventado', () => {
  assert.equal(sparklineSvg([]), '<span class="hist-vazio">histórico começando</span>');
  assert.equal(sparklineSvg(null), '<span class="hist-vazio">histórico começando</span>');
});

test('minigráfico: SVG simples em degraus, dentro da caixa, com resumo acessível', () => {
  const svg = sparklineSvg(pts('estavel'), { width: 120, height: 32 });
  assert.ok(svg.startsWith('<svg class="hist-spark" viewBox="0 0 120 32"'));
  assert.ok(svg.includes('role="img"'));
  const d = svg.match(/ d="([^"]+)"/)[1];
  assert.ok(d.startsWith('M'));
  assert.equal((d.match(/ H/g) ?? []).length, 6, 'um degrau por ponto depois do primeiro');
  const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
  assert.ok(nums.every((n) => n >= 0 && n <= 120), 'nada fora da caixa');
  const label = plain(svg.match(/aria-label="([^"]+)"/)[1]);
  assert.ok(label.includes('7 pontos'));
  assert.ok(label.includes('menor R$ 900,00') && label.includes('maior R$ 990,00') && label.includes('último R$ 980,00'));
  // menor preço fica embaixo (y maior), maior em cima
  const cy = Number(svg.match(/hist-spark-min" cx="[\d.]+" cy="([\d.]+)"/)[1]);
  assert.equal(cy, 29);
});

test('um ponto só e preço sempre igual não quebram o gráfico', () => {
  const um = sparklineSvg([{ t: SERIES.agora, pix: 100000 }]);
  assert.ok(um.includes('1 ponto ') && !um.includes('NaN'));
  const plano = sparklineSvg([{ t: NOW - DIA, pix: 100000 }, { t: NOW, pix: 100000 }]);
  assert.ok(!plano.includes('NaN') && !plano.includes('Infinity'));
});

test('texto do usuário no rótulo é escapado', () => {
  assert.ok(!sparklineSvg(pts('estavel'), { label: '<script>x</script>' }).includes('<script>'));
});

test('dailyMin junta lojas num ponto por dia (o menor), no dia de Brasília', () => {
  const r = dailyMin([
    { t: '2026-11-03T12:00:00Z', pix: 100000 }, { t: '2026-11-03T18:00:00Z', pix: 98000 },
    { t: '2026-11-04T02:00:00Z', pix: 97000 },   // ainda 03/11 em Brasília
    { t: '2026-11-04T12:00:00Z', pix: 99000 },
  ]);
  assert.deepEqual(r.map((p) => p.pix), [97000, 99000]);
});

test('selos: menor em 90 dias, "menor preço em 90 dias" e "preço inflado antes da promoção"', () => {
  const est = plain(historyBadges(computeIndicators(pts('estavel'), { now: NOW })));
  assert.ok(est.includes('menor em 90 dias: R$ 900,00'));
  assert.ok(!est.includes('hist-menor') && !est.includes('hist-inflado'));

  const inf = plain(historyBadges(computeIndicators(pts('inflado'), { now: NOW })));
  assert.ok(inf.includes('menor em 90 dias: R$ 990,00'));
  assert.ok(inf.includes('class="hist-badge hist-menor">menor preço em 90 dias'));
  assert.ok(inf.includes('preço inflado antes da promoção'));
  assert.ok(inf.includes('subiu 20%') && inf.includes('Estimativa') && inf.includes('não é acusação'));

  const real = historyBadges(computeIndicators(pts('quedaReal'), { now: NOW }));
  assert.ok(!real.includes('hist-inflado'));
});

test('selos sem dados e com fonte Keepa', () => {
  assert.equal(historyBadges(computeIndicators(pts('comecando'), { now: NOW })), '<span class="hist-badge hist-comecando">histórico começando</span>');
  assert.equal(historyBadges(null), '<span class="hist-badge hist-comecando">histórico começando</span>');
  assert.ok(historyBadges(computeIndicators(pts('estavel'), { now: NOW }), { fonte: 'Keepa' }).includes('fonte: Keepa'));
});
