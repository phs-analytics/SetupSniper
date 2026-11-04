// Histórico próprio de preços (Etapa 3 do plano 3.0): JSONL por mês, sem rede, relógio injetado e pasta temporária.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createPriceHistory, computeIndicators, signatureKey, parseSignatureKey, monthOf, loadHistoryRules,
  keepaConfigured, fetchKeepa, keepaToPoints,
} from '../src/price-history.js';
import { productSignature, sameProduct } from '../src/compare.js';

const FIX = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));
const SERIES = FIX('historico-series.json');
const NOW = Date.parse(SERIES.agora);
const DIA = 864e5, HORA = 3600e3;
const TITULO = SERIES.titulo;
const SIG = signatureKey(TITULO);

async function novoHistorico(t, clock = { t: NOW }) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'setupsniper-hist-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const h = createPriceHistory({ dir: dataDir, now: () => clock.t, onError: (e) => { throw e; } });
  return { h, dataDir, clock, histDir: path.join(dataDir, 'history') };
}
const linhas = async (file) => (await readFile(file, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l));
const pontosDe = (nome, extra = {}) => SERIES.series[nome].pontos.map((p) => ({
  t: new Date(NOW - p.diasAtras * DIA).toISOString(), sig: SIG, store: 'kabum', seller: null, pix: p.pix, origem: 'busca', ...extra,
}));

// ---------- assinatura ----------
test('signatureKey: títulos diferentes do mesmo modelo dão a mesma chave, e a chave volta a ser assinatura', () => {
  const a = signatureKey('Processador AMD Ryzen 7 7800X3D Box Preto');
  const b = signatureKey('PROCESSADOR AMD RYZEN 7 7800X3D');
  assert.equal(typeof a, 'string');
  assert.equal(a, b);
  const back = parseSignatureKey(a);
  assert.ok(sameProduct(back, productSignature('Ryzen 7 7800X3D Box')));
  assert.equal(signatureKey(productSignature(TITULO)), SIG, 'aceita a assinatura em conjuntos');
  assert.equal(signatureKey(SIG), SIG, 'chave já pronta passa direto');
});

test('monthOf: arquivo do mês em UTC', () => {
  assert.equal(monthOf(Date.parse('2026-11-04T15:00:00Z')), '2026-11');
  assert.equal(monthOf('2026-12-31T23:59:00Z'), '2026-12');
});

test('regras do histórico têm fonte e data', () => {
  const r = loadHistoryRules();
  assert.ok(r._fonte && r._data);
  assert.equal(r.inflado.altaMinimaPct, 10);
  assert.equal(r.inflado.janelaDias, 30);
  assert.ok(r.inflado.fonte.includes('[não verificado]'));
  assert.equal(r.retencao.compactarAposDias, 180);
});

// ---------- gravação ----------
test('grava em JSONL por mês, com append e só os campos do ponto', async (t) => {
  const { h, histDir } = await novoHistorico(t);
  assert.equal(await h.record({ sig: SIG, store: 'kabum', seller: null, pix: 189990, origem: 'busca' }), true);
  assert.equal(await h.record({ title: 'Ryzen 7 7800X3D', store: 'mercadolivre', seller: 'Loja X', pix: 185000, origem: 'fixado', key: 'cpu:mercadolivre' }), true);
  await h.flush();
  assert.deepEqual(await readdir(histDir), ['2026-11.jsonl']);
  const ls = await linhas(path.join(histDir, '2026-11.jsonl'));
  assert.equal(ls.length, 2);
  assert.deepEqual(ls[0], { t: '2026-11-04T15:00:00.000Z', sig: SIG, store: 'kabum', seller: null, pix: 189990, origem: 'busca' });
  assert.equal(ls[1].sig, SIG, 'título vira assinatura');
  assert.equal(ls[1].key, 'cpu:mercadolivre');
});

test('recusa ponto inválido: preço fora de centavos inteiros, sem loja, origem desconhecida', async (t) => {
  const { h } = await novoHistorico(t);
  assert.equal(await h.record({ sig: SIG, store: 'kabum', pix: 1899.9, origem: 'busca' }), false);
  assert.equal(await h.record({ sig: SIG, store: 'kabum', pix: 0, origem: 'busca' }), false);
  assert.equal(await h.record({ sig: SIG, pix: 189990, origem: 'busca' }), false);
  assert.equal(await h.record({ sig: SIG, store: 'kabum', pix: 189990, origem: 'raspagem' }), false);
  assert.equal(await h.record({ store: 'kabum', pix: 189990, origem: 'busca' }), false);
  assert.deepEqual(await h.series({ sig: SIG, days: 90 }), []);
});

test('sem inchaço: 1 ponto por produto × loja × vendedor por hora, salvo se o preço mudar', async (t) => {
  const { h, clock, histDir } = await novoHistorico(t);
  const p = { sig: SIG, store: 'kabum', seller: null, pix: 189990, origem: 'busca' };
  assert.equal(await h.record(p), true);
  clock.t += 10 * 60e3;
  assert.equal(await h.record(p), false, 'mesmo preço 10 min depois: ignorado');
  assert.equal(await h.record({ ...p, seller: 'Outro' }), true, 'outro vendedor conta à parte');
  assert.equal(await h.record({ ...p, store: 'pichau' }), true, 'outra loja conta à parte');
  clock.t += 5 * 60e3;
  assert.equal(await h.record({ ...p, pix: 179990 }), true, 'preço mudou: grava');
  clock.t += 30 * 60e3;
  assert.equal(await h.record({ ...p, pix: 179990 }), false);
  clock.t += 31 * 60e3;
  assert.equal(await h.record({ ...p, pix: 179990 }), true, 'passou 1 h do último ponto: grava');
  await h.flush();
  assert.equal((await linhas(path.join(histDir, '2026-11.jsonl'))).length, 5);
});

test('recordMany grava em lote, com dedupe, e chamadas simultâneas não duplicam', async (t) => {
  const { h, histDir } = await novoHistorico(t);
  const p = { sig: SIG, store: 'kabum', seller: null, pix: 189990, origem: 'extensao' };
  const n = await h.recordMany([p, p, { ...p, store: 'terabyte' }, { ...p, pix: -5 }]);
  assert.equal(n, 2);
  await Promise.all([h.record(p), h.record(p), h.record({ ...p, store: 'amazon' })]);
  await h.flush();
  assert.equal((await linhas(path.join(histDir, '2026-11.jsonl'))).length, 3);
});

test('o índice do mês corrente sobrevive a reiniciar o servidor', async (t) => {
  const { h, dataDir, clock } = await novoHistorico(t);
  const p = { sig: SIG, store: 'kabum', seller: null, pix: 189990, origem: 'busca' };
  await h.record(p);
  await h.flush();
  clock.t += 20 * 60e3;
  const h2 = createPriceHistory({ dir: dataDir, now: () => clock.t });
  assert.equal(await h2.record(p), false, 'lê o mês corrente para montar o dedupe');
  assert.equal(await h2.record({ ...p, pix: 188000 }), true);
});

test('virada de mês abre arquivo novo; series lê os dois', async (t) => {
  const clock = { t: Date.parse('2026-10-31T23:30:00Z') };
  const { h, histDir } = await novoHistorico(t, clock);
  await h.record({ sig: SIG, store: 'kabum', pix: 190000, origem: 'busca' });
  clock.t = Date.parse('2026-11-01T01:00:00Z');
  await h.record({ sig: SIG, store: 'kabum', pix: 189000, origem: 'busca' });
  await h.flush();
  assert.deepEqual((await readdir(histDir)).sort(), ['2026-10.jsonl', '2026-11.jsonl']);
  const s = await h.series({ sig: SIG, days: 30 });
  assert.deepEqual(s.map((x) => x.pix), [190000, 189000]);
});

test('series filtra por loja, vendedor, fixado, título parecido e janela de dias', async (t) => {
  const { h } = await novoHistorico(t);
  await h.recordMany([
    ...pontosDe('estavel'),
    { t: new Date(NOW - 2 * DIA).toISOString(), sig: SIG, store: 'mercadolivre', seller: 'Loja X', pix: 96000, origem: 'api' },
    { t: new Date(NOW - 2 * DIA).toISOString(), sig: SIG, store: 'kabum', seller: null, pix: 96500, origem: 'fixado', key: 'cpu:kabum' },
    { t: new Date(NOW - 2 * DIA).toISOString(), sig: signatureKey('RTX 4060 Ventus'), store: 'kabum', pix: 199000, origem: 'busca' },
  ]);
  assert.equal((await h.series({ sig: SIG, days: 90 })).length, 9);
  assert.equal((await h.series({ sig: SIG, days: 30 })).length, 7);
  assert.deepEqual((await h.series({ sig: SIG, store: 'mercadolivre', days: 90 })).map((x) => x.pix), [96000]);
  assert.equal((await h.series({ sig: SIG, store: 'mercadolivre', seller: 'Outra', days: 90 })).length, 0);
  assert.deepEqual((await h.series({ key: 'cpu:kabum', days: 90 })).map((x) => x.pix), [96500]);
  assert.equal((await h.series({ title: 'Ryzen 7 7800X3D Box', days: 90 })).length, 9, 'título parecido acha a mesma série');
  const s = await h.series({ sig: SIG, days: 90 });
  assert.ok(s.every((x, i) => i === 0 || x.t >= s[i - 1].t), 'em ordem de tempo');
});

// ---------- indicadores ----------
const pts = (nome) => pontosDe(nome);

test('indicadores: mínimo e mediana em 30 e 90 dias, preço atual e "menor em 90 dias"', () => {
  const ind = computeIndicators(pts('estavel'), { now: NOW });
  assert.equal(ind.estado, 'ok');
  for (const [k, v] of Object.entries(SERIES.series.estavel.esperado)) assert.equal(ind[k], v, k);
  assert.equal(ind.inflado.ativo, false);
  for (const k of ['min30', 'mediana30', 'min90', 'mediana90', 'atual']) assert.ok(Number.isInteger(ind[k]), `${k} em centavos inteiros`);
});

test('mediana com número par de pontos fica em centavos inteiros', () => {
  const p = [100001, 100000, 99000, 98000].map((pix, i) => ({ t: new Date(NOW - (10 - i * 3) * DIA).toISOString(), sig: SIG, store: 'kabum', seller: null, pix, origem: 'busca' }));
  const ind = computeIndicators(p, { now: NOW });
  assert.equal(ind.mediana30, 99500);
  const meio = [99999, 100000, 98000, 101000].map((pix, i) => ({ ...p[i], pix }));
  assert.equal(computeIndicators(meio, { now: NOW }).mediana30, 100000, '99.999,5 arredonda para centavo inteiro');
});

test('selo "preço inflado antes da promoção": subiu 20% e a queda só devolveu o preço de antes', () => {
  const ind = computeIndicators(pts('inflado'), { now: NOW });
  assert.equal(ind.estado, 'ok');
  assert.equal(ind.inflado.ativo, true);
  assert.equal(ind.inflado.de, 120000);
  assert.equal(ind.inflado.base, 100000);
  assert.equal(ind.inflado.atual, 99000);
  assert.equal(ind.inflado.altaPct, 20);
  assert.equal(ind.inflado.quedaRealPct, 1);
  assert.equal(ind.menor90, true, '990 é o menor visto, mesmo inflado');
});

test('queda de verdade (15% abaixo do menor dos 30 dias) não ganha o selo', () => {
  const ind = computeIndicators(pts('quedaReal'), { now: NOW });
  assert.equal(ind.inflado.ativo, false);
  assert.equal(ind.inflado.altaPct, 20);
  assert.equal(ind.inflado.quedaRealPct, 15);
  assert.equal(ind.menor90, true);
});

test('preço "de" anunciado pela loja também é conferido contra o histórico', () => {
  const p = pts('estavel');
  // "de R$ 1.200 por R$ 980", mas o produto custou R$ 970 nos 30 dias anteriores: desconto de fachada
  const ind = computeIndicators(p, { now: NOW, precoDe: 120000 });
  assert.equal(ind.inflado.ativo, true);
  assert.equal(ind.inflado.base, 97000);
  assert.equal(ind.inflado.de, 120000);
  assert.equal(ind.inflado.altaPct, 23.7);
  // "de R$ 1.000": só 3,1% acima do menor dos 30 dias, abaixo do limite de 10%
  const ind2 = computeIndicators(p, { now: NOW, precoDe: 100000 });
  assert.equal(ind2.inflado.ativo, false);
  // "de" não é maior que o atual: não há queda anunciada
  assert.equal(computeIndicators(p, { now: NOW, precoDe: 98000 }).inflado.ativo, false);
});

test('sem dados suficientes: estado "histórico começando", sem números inventados', () => {
  for (const p of [[], pts('comecando'), pts('estavel').slice(-2)]) {
    const ind = computeIndicators(p, { now: NOW });
    assert.equal(ind.estado, 'historico_comecando');
    assert.equal(ind.texto, 'histórico começando');
    assert.equal(ind.min90, null);
    assert.equal(ind.menor90, false);
    assert.equal(ind.inflado, null);
  }
});

test('queda antiga (mais de 14 dias) não ganha o selo', () => {
  const p = pts('inflado').map((x) => ({ ...x, t: new Date(Date.parse(x.t) - 20 * DIA).toISOString() }));
  const ind = computeIndicators(p, { now: NOW });
  assert.equal(ind.inflado.ativo, false);
});

test('h.indicators aceita consulta ou lista de pontos', async (t) => {
  const { h } = await novoHistorico(t);
  await h.recordMany(pts('inflado'));
  const a = await h.indicators({ sig: SIG, store: 'kabum' });
  const b = await h.indicators(pts('inflado'));
  assert.equal(a.inflado.ativo, true);
  assert.deepEqual(a, b);
});

test('pontos "__best" (melhor de todas as lojas, do formato antigo) ficam fora da série geral', async (t) => {
  const { h } = await novoHistorico(t);
  await h.recordMany([
    { sig: SIG, store: 'kabum', pix: 100000, origem: 'fixado', key: 'cpu:kabum' },
    { sig: SIG, store: '__best', pix: 100000, origem: 'fixado', key: 'cpu:__best' },
  ]);
  assert.equal((await h.series({ sig: SIG, days: 90 })).length, 1);
  assert.equal((await h.series({ sig: SIG, store: '__best', days: 90 })).length, 1);
  assert.equal((await h.series({ key: 'cpu:__best', days: 90 })).length, 1);
});

// ---------- migração ----------
test('migração do history.json antigo: nenhum ponto perdido, chave e origem preservadas, idempotente', async (t) => {
  const { h, histDir } = await novoHistorico(t);
  const { history, watchItems } = FIX('historico-legado.json');
  const total = Object.entries(history).filter(([k, v]) => k !== '__schema' && Array.isArray(v)).reduce((a, [, v]) => a + v.length, 0);
  const r = await h.migrateLegacy(history, watchItems);
  assert.equal(r.migrados, total);
  assert.equal(r.jaMigrado, false);
  const r2 = await h.migrateLegacy(history, watchItems);
  assert.equal(r2.jaMigrado, true);
  assert.equal(r2.migrados, 0);

  const arquivos = (await readdir(histDir)).filter((f) => f.endsWith('.jsonl')).sort();
  const todas = (await Promise.all(arquivos.map((f) => linhas(path.join(histDir, f))))).flat();
  assert.equal(todas.length, total, 'idempotente: nada duplicado');
  assert.ok(todas.every((p) => p.origem === 'fixado' && Number.isInteger(p.pix) && p.key));
  const kabum = todas.filter((p) => p.key === 'cpu:kabum').sort((a, b) => a.t.localeCompare(b.t));
  assert.deepEqual(kabum.map((p) => p.pix), history['cpu:kabum'].map((p) => p.price));
  assert.deepEqual(kabum.map((p) => Date.parse(p.t)), history['cpu:kabum'].map((p) => p.t));
  assert.equal(kabum[0].sig, signatureKey('AMD Ryzen 7 7800X3D'), 'assinatura pelo nome do fixado');
  assert.equal(kabum[0].store, 'kabum');
  assert.ok(todas.some((p) => p.key === 'cpu:__best' && p.store === '__best'));
  assert.equal(todas.find((p) => p.key === 'gpu:terabyte').sig, 'legado:gpu', 'fixado apagado: série guardada pela chave');
  // ponto de 200 dias atrás vai para o arquivo do mês dele
  assert.ok(arquivos.includes(monthOf(history['cpu:kabum'][0].t) + '.jsonl'));
  // a série migrada responde pela chave do fixado
  assert.equal((await h.series({ key: 'cpu:kabum', days: 90 })).length, 2);
});

test('migração converte reais para centavos quando o arquivo é anterior ao schema 2', async (t) => {
  const { h } = await novoHistorico(t);
  await h.migrateLegacy({ 'a1:kabum': [{ t: NOW - DIA, price: 1849.99 }] }, [{ id: 'a1', name: 'Ryzen 7 7800X3D' }]);
  assert.deepEqual((await h.series({ key: 'a1:kabum', days: 30 })).map((p) => p.pix), [184999]);
});

// ---------- retenção ----------
test('compact: pontos com mais de 180 dias viram 1 ponto por dia (o menor do dia); os recentes ficam', async (t) => {
  const { h, histDir } = await novoHistorico(t);
  const velho = Date.parse('2026-04-10T12:00:00Z');       // ~208 dias antes de NOW
  const ps = [];
  for (const [hora, pix] of [[0, 120000], [3, 110000], [6, 115000], [9, 118000]]) ps.push({ t: new Date(velho + hora * HORA).toISOString(), sig: SIG, store: 'kabum', pix, origem: 'busca' });
  ps.push({ t: new Date(velho + 2 * HORA).toISOString(), sig: SIG, store: 'pichau', pix: 125000, origem: 'busca' });
  ps.push({ t: new Date(velho + DIA).toISOString(), sig: SIG, store: 'kabum', pix: 130000, origem: 'busca' });
  for (let i = 0; i < 3; i++) ps.push({ t: new Date(NOW - i * HORA * 2).toISOString(), sig: SIG, store: 'kabum', pix: 100000 + i, origem: 'busca' });
  await h.recordMany(ps);
  const r = await h.compact({ olderThanDays: 180 });
  assert.equal(r.antes, 9);
  assert.equal(r.depois, 6);
  const abril = await linhas(path.join(histDir, '2026-04.jsonl'));
  assert.deepEqual(abril.map((p) => [p.store, p.pix]).sort(), [['kabum', 110000], ['kabum', 130000], ['pichau', 125000]].sort());
  assert.ok(abril.every((p) => p.diario === true));
  assert.equal((await linhas(path.join(histDir, '2026-11.jsonl'))).length, 3, 'recentes intactos');
  const again = await h.compact({ olderThanDays: 180 });
  assert.equal(again.antes, again.depois, 'compactar de novo não muda nada');
});

test('compact usa o dia de Brasília (UTC−3)', async (t) => {
  const { h, histDir } = await novoHistorico(t);
  // 02:00Z de 11/04 ainda é 10/04 em Brasília; 04:00Z já é 11/04
  await h.recordMany([
    { t: '2026-04-11T02:00:00Z', sig: SIG, store: 'kabum', pix: 100000, origem: 'busca' },
    { t: '2026-04-10T20:00:00Z', sig: SIG, store: 'kabum', pix: 101000, origem: 'busca' },
    { t: '2026-04-11T04:00:00Z', sig: SIG, store: 'kabum', pix: 102000, origem: 'busca' },
  ]);
  await h.compact({ olderThanDays: 180 });
  assert.deepEqual((await linhas(path.join(histDir, '2026-04.jsonl'))).map((p) => p.pix).sort(), [100000, 102000]);
});

test('arquivo com linha corrompida: a linha é ignorada, o resto continua valendo', async (t) => {
  const { h, histDir } = await novoHistorico(t);
  await mkdir(histDir, { recursive: true });
  await writeFile(path.join(histDir, '2026-11.jsonl'),
    JSON.stringify({ t: new Date(NOW - DIA).toISOString(), sig: SIG, store: 'kabum', seller: null, pix: 100000, origem: 'busca' }) + '\n{quebrad');
  await h.record({ sig: SIG, store: 'kabum', pix: 99000, origem: 'busca' });
  assert.deepEqual((await h.series({ sig: SIG, days: 30 })).map((p) => p.pix), [100000, 99000]);
});

// ---------- Keepa (opcional) ----------
test('Keepa só liga com KEEPA_API_KEY', () => {
  assert.equal(keepaConfigured({}), false);
  assert.equal(keepaConfigured({ KEEPA_API_KEY: 'abc' }), true);
});

test('fetchKeepa lê a fixture, marca origem keepa e "fonte: Keepa", sem vazar a chave em erro', async () => {
  const fx = FIX('keepa-produto.json');
  let url = '';
  const fetchImpl = async (u) => { url = String(u); return { ok: true, status: 200, json: async () => fx }; };
  const r = await fetchKeepa('B0TESTE123', { fetchImpl, apiKey: 'chave-secreta' });
  assert.ok(url.startsWith('https://api.keepa.com/product?'));
  assert.ok(url.includes('domain=12') && url.includes('asin=B0TESTE123'));
  assert.equal(r.fonte, 'Keepa');
  assert.ok(r.points.length >= 4);
  assert.ok(r.points.every((p) => p.origem === 'keepa' && p.fonte === 'Keepa' && p.store === 'amazon' && Number.isInteger(p.pix) && p.pix > 0));
  assert.ok(!r.points.some((p) => p.pix === -1), 'sem estoque não vira preço');
  const amazon = r.points.filter((p) => p.seller === 'Amazon');
  assert.deepEqual(amazon.map((p) => [p.t, p.pix]), [['2026-10-01T12:00:00.000Z', 199990], ['2026-11-01T12:00:00.000Z', 189990]]);
  assert.equal(amazon[0].sig, signatureKey(fx.products[0].title));

  const falha = async () => ({ ok: false, status: 402, json: async () => ({}) });
  await assert.rejects(fetchKeepa('B0TESTE123', { fetchImpl: falha, apiKey: 'chave-secreta' }), (e) => !String(e.message).includes('chave-secreta'));
  await assert.rejects(fetchKeepa('B0TESTE123', { fetchImpl, apiKey: '' }), /KEEPA_API_KEY/);
  await assert.rejects(fetchKeepa('../x', { fetchImpl, apiKey: 'k' }), /ASIN/);
});

test('pontos da Keepa entram no histórico e são marcados', async (t) => {
  const { h } = await novoHistorico(t);
  const pts2 = keepaToPoints(FIX('keepa-produto.json').products[0]);
  assert.ok(await h.recordMany(pts2) > 0);
  const s = await h.series({ title: 'Ryzen 7 7800X3D', store: 'amazon', days: 90 });
  assert.ok(s.length >= 4 && s.every((p) => p.origem === 'keepa' && p.fonte === 'Keepa'));
});
