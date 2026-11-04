import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_CONFIG, sellerSignals, sellerScore, offerRisk, finalScore,
  grams, jaccard, meanPairwiseJaccard, bayesianAverage, wilsonLowerBound, burst, isForeignText,
} from '../src/seller-score.js';

const load = f => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));
const altoRisco = load('seller-alto-risco.json');
const estabelecido = load('seller-estabelecido.json');
const now = new Date(altoRisco._now);
const RUINS = ['Alto risco', 'Cautela'];

test('seller-score.json tem pesos, travas e metadados', () => {
  const c = DEFAULT_CONFIG;
  assert.match(c._ajuda, /calibr/i);
  assert.equal(c.atualizadoEm, '2026-11-03');
  assert.equal(c.fonte, 'docs/score-vendedor.md');
  const soma = Object.values(c.camadas).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(soma - 1) < 1e-9);
  assert.ok(Math.abs(Object.values(c.pesosVendedor).reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

for (const loja of ['aliexpress', 'shopee', 'mercadolivre']) {
  test(`caso real (${loja}): vendedor novo sai Alto risco/Cautela mesmo com plataforma 85`, () => {
    const s = sellerScore(altoRisco[loja], DEFAULT_CONFIG, { now });
    assert.ok(RUINS.includes(s.tier), `${loja}: ${s.tier}`);
    assert.ok(s.risk >= 45, `${loja}: R=${s.risk}`);
    assert.ok(s.reasons.includes('Loja aberta há 23 dias'), s.reasons.join(' | '));
    assert.ok(s.reasons.includes('Só 5 vendas'));
    assert.ok(s.reasons.includes('5 de 5 avaliações em idioma estrangeiro'), s.reasons.join(' | '));
    assert.ok(s.reasons.includes('5 avaliações publicadas em 2 dias'));

    const f = finalScore({ platformScore: 85, seller: altoRisco[loja], offer: { title: 'Placa de vídeo RTX 4060 8GB', price: { pix: 180000 } } }, DEFAULT_CONFIG, { now });
    assert.ok(RUINS.includes(f.tier), `${loja}: final ${f.score} ${f.tier}`);
    assert.ok(f.score < 55);
    assert.ok(f.travas.includes('T1'));
    assert.equal(f.layers.platform, 85);
    assert.equal(f.layers.seller, 0);
    assert.equal(f.layers.offer, 60);
  });
}

test('caso real no AliExpress bate com a conta do doc (32 · Alto risco · confiança 58)', () => {
  const s = sellerScore(altoRisco.aliexpress, DEFAULT_CONFIG, { now });
  assert.equal(s.parts.vbase, 38.6);
  assert.equal(s.confidence, 58);
  assert.ok(!('cnpj' in s.signals.positive), 'CNPJ não se aplica no AliExpress');
  const f = finalScore({ platformScore: 80, seller: altoRisco.aliexpress, offer: {} }, DEFAULT_CONFIG, { now });
  assert.equal(f.score, 32);
  assert.equal(f.tier, 'Alto risco');
});

test('sem textos nem datas das avaliações, o vendedor novo ainda não sai Bom', () => {
  const { reviews, ...semReviews } = altoRisco.aliexpress;
  const s = sellerScore(semReviews, DEFAULT_CONFIG, { now });
  assert.ok(s.risk >= 25 && s.risk < 45, `R=${s.risk}`);
  const f = finalScore({ platformScore: 80, seller: semReviews, offer: {} }, DEFAULT_CONFIG, { now });
  assert.ok(RUINS.includes(f.tier), `${f.score} ${f.tier}`);
  assert.ok(s.missing.includes('datas das avaliações'));
});

test('vendedor estabelecido de controle sai Bom ou Excelente', () => {
  const s = sellerScore(estabelecido.mercadolivre, DEFAULT_CONFIG, { now });
  assert.equal(s.risk, 0);
  assert.ok(s.confidence >= 70, `confiança ${s.confidence}`);
  assert.ok(['Bom', 'Excelente'].includes(s.tier));
  const f = finalScore({ platformScore: 84, seller: estabelecido.mercadolivre, offer: { fulfillment: true, title: 'SSD NVMe 1TB Gen4' } }, DEFAULT_CONFIG, { now });
  assert.ok(['Bom', 'Excelente'].includes(f.tier), `${f.score} ${f.tier}`);
  assert.deepEqual(f.travas, []);

  // Mesmo sem o selo de oficial, o histórico sustenta a nota.
  const semSelo = { ...estabelecido.mercadolivre, official: false };
  const g = finalScore({ platformScore: 84, seller: semSelo, offer: { fulfillment: true, title: 'SSD NVMe 1TB Gen4' } }, DEFAULT_CONFIG, { now });
  assert.ok(['Bom', 'Excelente'].includes(g.tier), `${g.score} ${g.tier}`);
});

test('vendido e entregue pela própria loja: vendedor mínimo 90', () => {
  const f = finalScore({ platformScore: 88, seller: estabelecido.amazon, offer: { fulfillment: true, title: 'Processador 8 núcleos AM5' } }, DEFAULT_CONFIG, { now });
  assert.ok(f.layers.seller >= 90);
  assert.ok(['Bom', 'Excelente'].includes(f.tier), `${f.score} ${f.tier}`);
});

test('falta de dado reduz a confiança (não é neutra)', () => {
  const completo = sellerScore(estabelecido.mercadolivre, DEFAULT_CONFIG, { now });
  const { nativeReputation, cnpj, sales, ...parcial } = { ...estabelecido.mercadolivre, official: false };
  const p = sellerScore(parcial, DEFAULT_CONFIG, { now });
  assert.ok(p.confidence < completo.confidence);
  assert.ok(p.parts.vbase < sellerScore({ ...estabelecido.mercadolivre, official: false }, DEFAULT_CONFIG, { now }).parts.vbase, 'ausente entra abaixo do neutro');
  assert.ok(p.missing.includes('reputação na loja') && p.missing.includes('CNPJ'));

  const vazio = sellerScore({}, DEFAULT_CONFIG, { now });
  assert.ok(vazio.confidence < 40);
  assert.ok(vazio.reasons.some(r => /confiança baixa/.test(r)));
  // T4: sem dado não existe Bom nem Excelente, por melhor que seja a plataforma.
  const f = finalScore({ platformScore: 100, seller: {}, offer: { fulfillment: true, title: 'Placa-mãe B650 AM5' } }, DEFAULT_CONFIG, { now });
  assert.ok(f.score <= 69);
  assert.ok(f.travas.includes('T4'));
});

test('reasons legíveis em pt-BR e sem acusação', () => {
  const todos = [
    ...['aliexpress', 'shopee', 'mercadolivre'].map(l => finalScore({ platformScore: 85, seller: altoRisco[l], offer: { suspeito: true, title: 'Produto' } }, DEFAULT_CONFIG, { now })),
    finalScore({ platformScore: 84, seller: estabelecido.mercadolivre, offer: {} }, DEFAULT_CONFIG, { now }),
  ];
  for (const f of todos) {
    assert.ok(f.reasons.length > 0);
    for (const r of f.reasons) {
      assert.equal(typeof r, 'string');
      assert.ok(r.length > 3 && r.length < 100, r);
      assert.doesNotMatch(r, /fraud|golpe|undefined|NaN|null/i, r);
    }
  }
});

test('travas de bloqueio: CNPJ não ativo e termômetro vermelho', () => {
  const base = { ...estabelecido.mercadolivre, official: false };
  const baixado = finalScore({ platformScore: 90, seller: { ...base, cnpj: { situacao: 'BAIXADA', abertura: '2015-03-10' } }, offer: {} }, DEFAULT_CONFIG, { now });
  assert.equal(baixado.tier, 'Alto risco');
  assert.ok(baixado.reasons.includes('CNPJ com situação BAIXADA'));
  const vermelho = finalScore({ platformScore: 90, seller: { ...base, nativeReputation: { level: '1_red' } }, offer: {} }, DEFAULT_CONFIG, { now });
  assert.ok(vermelho.score <= 39);
});

test('offerRisk: preço suspeito, título genérico, anúncio recente e poucas fotos', () => {
  const ok = offerRisk({ title: 'Placa de vídeo RTX 4060 8GB', price: { pix: 180000 } }, { now });
  assert.equal(ok.score, 60);
  assert.deepEqual(ok.reasons, []);

  const ful = offerRisk({ fulfillment: true, title: 'Fonte 650W 80 Plus Bronze' }, { now });
  assert.equal(ful.score, 80);

  const sus = offerRisk({ suspeito: true, title: 'Placa de vídeo RTX 4060 8GB' }, { now });
  assert.equal(sus.score, 30);
  assert.ok(sus.suspeito);

  const med = offerRisk({ title: 'Placa de vídeo RTX 4060 8GB', price: { pix: 90000 } }, { now, median: 200000 });
  assert.ok(med.suspeito);
  assert.match(med.reasons[0], /R\$\s?900,00.*R\$\s?2\.000,00/);

  const ruim = offerRisk({ title: 'Produto top original' }, { now, listing: { publishedAt: '2026-10-31', photos: 1 } });
  assert.equal(ruim.score, 60 - 10 - 10 - 5);
  assert.ok(ruim.reasons.includes('Título do anúncio genérico'));
  assert.ok(ruim.reasons.includes('Anúncio publicado há 3 dias'));
  assert.ok(ruim.reasons.includes('Só 1 foto no anúncio'));
});

test('Jaccard de 3-gramas detecta textos quase idênticos', () => {
  const a = grams('Very good product, fast delivery');
  const b = grams('Good product, very fast delivery');
  const c = grams('A placa chegou com a caixa amassada, mas funciona');
  assert.ok(jaccard(a, b) > 0.5);
  assert.ok(jaccard(a, c) < 0.15);
  assert.equal(jaccard(a, a), 1);
  const parecidos = meanPairwiseJaccard(altoRisco.aliexpress.reviews.map(r => r.text));
  const variados = meanPairwiseJaccard(estabelecido.mercadolivre.reviews.map(r => r.text));
  assert.ok(parecidos > 0.5, `parecidos ${parecidos}`);
  assert.ok(variados < 0.25, `variados ${variados}`);
});

test('média bayesiana puxa 5 avaliações 5★ para baixo', () => {
  const b = bayesianAverage(5, 5, 3.5, 20);
  assert.ok(Math.abs(b - 3.8) < 1e-9);
  assert.ok(bayesianAverage(4.8, 12000, 3.5, 20) > b);
  const sig = sellerSignals(altoRisco.shopee, { now });
  assert.equal(Math.round(sig.positive.nota), 70);
});

test('Wilson, rajada e idioma', () => {
  assert.equal(Math.round(wilsonLowerBound(5, 5) * 1000) / 1000, 0.566);
  assert.ok(wilsonLowerBound(950, 1000) > wilsonLowerBound(5, 5));
  assert.equal(wilsonLowerBound(0, 0), null);

  const r = burst(altoRisco.aliexpress.reviews.map(x => x.date));
  assert.equal(r.distinctDays, 2);
  assert.equal(r.spanDays, 1);
  assert.ok(Math.abs(r.intensity - (1 - 1 / 28)) < 1e-9);
  const espalhado = burst(['2025-01-01', '2025-04-01', '2025-08-01']);
  assert.equal(espalhado.intensity, 0);

  assert.equal(isForeignText('Very good quality product'), true);
  assert.equal(isForeignText('Produto muito bom, chegou rápido'), false);
  assert.equal(isForeignText('Top'), null);
});

test('loja grande com muitas avaliações: amostra recente concentrada não vira rajada', () => {
  const s = sellerSignals({ ...estabelecido.mercadolivre, reviews: estabelecido.mercadolivre.reviews.map(r => ({ ...r, date: '2026-11-01' })) }, { now });
  assert.equal(s.risk.rajada, 0);
});
