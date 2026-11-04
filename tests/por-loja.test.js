// Modo "Por loja" (Etapa 3b): vários produtos por loja, só de vendedores bem avaliados.
// Fixture: tests/fixtures/por-loja-busca.json (20 resultados misturados por loja, sem rede).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeOffer, referencePrice } from '../src/offer.js';
import { cleanResults, flagOutliers, relevanceScore, sellerInfoFrom } from '../src/extract.js';
import { finalScore, sellerDataOf } from '../src/seller-score.js';
import { productSignature, sameProduct } from '../src/compare.js';
import { rankGroup } from '../src/ranking.js';
import { kabumItems, ADAPTERS } from '../src/stores.js';
import {
  porLoja, porLojaUma, avaliarVendedor, vendedorAprovado, motivoNota, normalizeRules, DEFAULT_RULES,
  buscarAteCompletar, produtosBons, resumoLoja,
} from '../src/por-loja.js';
import { renderPorLoja } from '../public/por-loja.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/por-loja-busca.json', import.meta.url), 'utf8'));
const NOW = new Date(fx.agora);
const ref = (o) => referencePrice(o);
const withTrust = (o) => ({ ...o, trust: finalScore({ platformScore: fx.plataforma[o.store], seller: sellerDataOf(o), offer: { suspeito: !!o.suspeito, title: o.title } }, undefined, { now: NOW }) });

// Mesmo caminho do servidor: normalizeOffer → cleanResults (por loja) → flagOutliers (todas) → nota de confiança.
function pipeline(lojas = fx.lojas) {
  const all = [];
  for (const [id, raw] of Object.entries(lojas)) all.push(...cleanResults(raw.map(x => ({ ...normalizeOffer(x, id, { now: NOW }), storeId: id })), fx.query));
  return flagOutliers(all, ref).map(withTrust);
}
const OFFERS = pipeline();
const view = (opts = {}) => porLoja(OFFERS, fx.query, { refOf: ref, ...opts });
const loja = (v, id) => v.find(l => l.storeId === id);
const allOffers = (l) => [...l.grupos.flatMap(g => [g.melhor, ...g.outros]), ...l.semDados.flatMap(g => [g.melhor, ...g.outros]), ...l.ocultos.map(x => x.oferta)];

test('fixture: 20 resultados por loja, misturados', () => {
  for (const id of ['mercadolivre', 'kabum', 'shopee']) assert.equal(fx.lojas[id].length, 20, id);
});

test('até 10 produtos por loja; o que passa do limite é contado', () => {
  const v = view();
  for (const l of v) assert.ok(l.grupos.length <= 10, l.storeId);
  const k = loja(v, 'kabum');
  assert.equal(k.grupos.length, 10);
  assert.equal(k.contagem.alemDoLimite, 3);
  assert.equal(k.contagem.produtos, 10);
  // resultsPerStore ajustável
  assert.equal(loja(view({ resultsPerStore: 4 }), 'kabum').grupos.length, 4);
});

test('acessórios e outro modelo não aparecem em lugar nenhum; variantes ficam ocultas com o motivo', () => {
  for (const l of view()) {
    const titles = allOffers(l).map(o => o.title);
    assert.ok(!titles.some(t => /^(Suporte|Cabo|Adaptador|Capa)/.test(t)), `${l.storeId}: acessório apareceu`);
    assert.ok(!titles.some(t => /3060/.test(t)), `${l.storeId}: RTX 3060 apareceu`);
    assert.ok(!l.grupos.some(g => /\bTi\b/.test(g.titulo)), `${l.storeId}: variante Ti no meio dos produtos`);
    const rel = l.ocultos.filter(x => x.tipo === 'relevancia');
    assert.equal(rel.length, 2, l.storeId);
    assert.ok(rel.every(x => x.motivo === 'relevância 70: outra variante (Ti)'), rel.map(x => x.motivo).join(' | '));
  }
});

test('o mesmo produto de vendedores diferentes vira um card, com o melhor vendedor em cima', () => {
  const ml = loja(view(), 'mercadolivre');
  const ventus = ml.grupos.find(g => /Ventus/.test(g.titulo));
  assert.deepEqual([ventus.melhor, ...ventus.outros].map(o => o.seller.name), ['TECHSTORE', 'MEGA INFO', 'MSI']);
  assert.equal(ventus.vendedores, 3);
  // Eagle e Windforce (mesma marca, linhas diferentes) não se juntam
  const kb = loja(view(), 'kabum');
  const eagle = kb.grupos.find(g => /Eagle/.test(g.titulo));
  assert.equal(eagle.outros.length, 1);
  assert.deepEqual([eagle.melhor, ...eagle.outros].map(o => o.seller?.name ?? 'loja').sort(), ['Mega Parceiro', 'loja']);
  assert.ok(kb.grupos.some(g => /Windforce/.test(g.titulo)));
});

test('contagem de ocultos, sem dados e motivos legíveis', () => {
  const v = view();
  const ml = loja(v, 'mercadolivre');
  assert.deepEqual(ml.contagem, { produtos: 6, ofertas: 8, ocultos: 6, ocultosNota: 4, ocultosRelevancia: 2, semDados: 3, alemDoLimite: 0, total: 17 });
  assert.equal(ml.resumo, '6 produtos · 4 ocultos pela nota · 3 sem dados do vendedor · 2 de outro modelo ou variante');
  const motivos = ml.ocultos.map(x => x.motivo);
  assert.ok(motivos.includes('nota 35: alto risco — loja aberta há 18 dias'), motivos.join(' | '));
  assert.ok(motivos.includes('nota 39: alto risco — termômetro do Mercado Livre vermelho'));
  assert.ok(motivos.includes('nota 64: regular — abaixo da nota mínima 70'));
  assert.ok(motivos.some(m => m.startsWith('preço suspeito')));
  // sem dados do vendedor: aparecem em grupo próprio, não somem
  assert.deepEqual(ml.semDados.flatMap(g => [g.melhor, ...g.outros]).map(o => o.seller.name).sort(), ['PC Express', 'PC Express', 'vendedor_sem_dados']);
  const sh = loja(v, 'shopee');
  assert.equal(sh.contagem.ocultosNota, 5);
  assert.equal(sh.contagem.semDados, 4);
  const kb = loja(v, 'kabum');
  assert.equal(kb.contagem.ocultosNota, 0);
  assert.equal(kb.contagem.semDados, 1);
  // nada se perde: visíveis + sem dados + ocultos = o que chegou da loja (fora o limite de 10)
  for (const l of v) assert.equal(allOffers(l).length + (l.storeId === 'kabum' ? 3 : 0), l.contagem.total, l.storeId);
});

test('filtro desligado: tudo aparece, e alto risco/suspeito nunca fica na frente de confiável (todas as ordens)', () => {
  for (const sort of ['melhor', 'preco', 'nota']) {
    for (const l of view({ filterOn: false, sort, resultsPerStore: 60 })) {
      assert.equal(l.semDados.length, 0);
      assert.equal(l.contagem.ocultosNota, 0);
      const key = (o) => ({ price: ref(o), score: o.trust?.score, suspeito: !!o.suspeito, available: o.available });
      // entre cards
      const gs = l.grupos.map(g => rankGroup(key(g.melhor)));
      assert.deepEqual(gs, [...gs].sort((a, b) => a - b), `${l.storeId}/${sort}: card de risco na frente`);
      // dentro de cada card
      for (const g of l.grupos) {
        const os = [g.melhor, ...g.outros].map(o => rankGroup(key(o)));
        assert.deepEqual(os, [...os].sort((a, b) => a - b), `${l.storeId}/${sort}: vendedor de risco na frente em ${g.titulo}`);
      }
    }
  }
  // o alto risco mais barato do card Ventus fica por último
  const ventus = loja(view({ filterOn: false }), 'mercadolivre').grupos.find(g => /Ventus/.test(g.titulo));
  const last = [ventus.melhor, ...ventus.outros].at(-1);
  assert.ok(last.suspeito || last.trust.score < 40);
});

test('ordens: menor preço e maior nota', () => {
  const porPreco = loja(view({ sort: 'preco' }), 'kabum').grupos.map(g => ref(g.melhor));
  assert.deepEqual(porPreco, [...porPreco].sort((a, b) => a - b));
  const porNota = loja(view({ sort: 'nota' }), 'shopee').grupos.map(g => g.melhor.trust.score);
  assert.deepEqual(porNota, [...porNota].sort((a, b) => b - a));
  assert.equal(loja(view({ sort: 'nota' }), 'shopee').regras.sort, 'nota');
});

test('nota mínima ajustável', () => {
  const ml = loja(view({ minScore: 80 }), 'mercadolivre');
  assert.ok(ml.grupos.every(g => [g.melhor, ...g.outros].every(o => o.trust.score >= 80)));
  assert.ok(ml.contagem.ocultosNota > 4);
});

test('vendedorAprovado / avaliarVendedor (Fixados, alertas e Ofertas)', () => {
  const bom = { trust: { score: 82, confidence: 80, travas: [], reasons: [] } };
  const regular = { trust: { score: 62, confidence: 70, travas: [], reasons: ['Só 30 vendas'] } };
  const semDados = { trust: { score: 69, confidence: 30, travas: ['T4'], reasons: ['Poucos dados do vendedor: confiança baixa'] } };
  const altoRisco = { trust: { score: 35, confidence: 30, travas: ['T1', 'T4'], reasons: ['Loja aberta há 18 dias'] } };
  assert.equal(vendedorAprovado(bom), true);
  assert.equal(vendedorAprovado(bom, 85), false);
  assert.equal(vendedorAprovado(regular), false);
  assert.equal(vendedorAprovado(regular, 60), true);
  assert.equal(vendedorAprovado(semDados), false);
  assert.equal(vendedorAprovado({ ...bom, suspeito: true }), false);
  assert.equal(vendedorAprovado({}), false);
  assert.equal(avaliarVendedor(semDados).status, 'semDados');
  assert.equal(avaliarVendedor(altoRisco).status, 'oculto');   // risco + pouco dado: oculto, não "sem dados"
  assert.equal(avaliarVendedor({}).status, 'semDados');
  assert.equal(motivoNota(regular.trust), 'nota 62: regular — só 30 vendas');
  assert.equal(motivoNota({ score: 48, reasons: ['Sem nota da plataforma', 'Poucas avaliações'] }), 'nota 48: cautela — poucas avaliações');
});

test('regras: data/search-rules.json tem fonte e data e bate com os padrões; preferência do usuário vale por cima', () => {
  const j = JSON.parse(readFileSync(new URL('../data/search-rules.json', import.meta.url), 'utf8'));
  assert.ok(j.fonte && /^\d{4}-\d{2}-\d{2}$/.test(j.atualizadoEm));
  for (const k of Object.keys(DEFAULT_RULES)) assert.deepEqual(j[k], DEFAULT_RULES[k], k);
  assert.deepEqual({ minScore: 70, resultsPerStore: 10, maxPages: 3 }, { minScore: j.minScore, resultsPerStore: j.resultsPerStore, maxPages: j.maxPages });
  const r = normalizeRules(j, { notaMinima: 55, soVendedorBom: false, produtosPorLoja: '5', ordem: 'preco' }, { sort: 'invalida', maxPages: 99 });
  assert.equal(r.minScore, 55);
  assert.equal(r.filterOn, false);
  assert.equal(r.resultsPerStore, 5);
  assert.equal(r.sort, 'preco');
  assert.equal(r.maxPages, 10);
});

test('relevância: todos os termos, modelo exato e variante certa', () => {
  assert.equal(relevanceScore('Placa de Vídeo MSI RTX 4060 Ventus 8GB', 'rtx 4060').score, 100);
  assert.equal(relevanceScore('Placa de Vídeo MSI RTX4060 Ventus 8GB', 'rtx 4060').score, 100, 'escrito junto');
  const ti = relevanceScore('Placa de Vídeo MSI RTX 4060 Ti Ventus 8GB', 'rtx 4060');
  assert.equal(ti.variante, false);
  assert.equal(ti.score, 70);
  assert.equal(relevanceScore('Placa RTX4060Ti 8GB', 'rtx 4060 ti').score, 100);
  const xt = relevanceScore('Placa de Vídeo RX 7600 8GB', 'rx 7600 xt');
  assert.equal(xt.variante, false);
  assert.match(xt.motivo, /sem a variante pesquisada/);
  const outro = relevanceScore('Placa de Vídeo RTX 40600 8GB', 'rtx 4060');
  assert.equal(outro.modelo, false);
  assert.equal(relevanceScore('Mouse sem fio', 'mouse').modelo, null, 'busca sem modelo não penaliza');
});

test('comparativo: mesma marca com linhas diferentes e marca com dígito não se juntam', () => {
  const s = (t) => productSignature(t);
  assert.ok(!sameProduct(s('Placa de Vídeo Gigabyte RTX 4060 Eagle OC 8GB'), s('Placa de Vídeo Gigabyte RTX 4060 Windforce OC 8GB')));
  assert.ok(!sameProduct(s('Placa de Vídeo Inno3D RTX 4060 Twin X2 8GB'), s('Placa de Vídeo Zotac RTX 4060 Twin Edge 8GB')));
  assert.ok(sameProduct(s('Placa de Vídeo Gigabyte RTX 4060 Eagle OC 8GB'), s('Placa de Video Gigabyte GeForce RTX 4060 Eagle OC 8G')));
});

// ---------- mais páginas quando faltar ----------
const fakeSearch = (pages, calls) => async (storeId, q, { page }) => {
  calls.push(page);
  const p = pages[page - 1];
  if (p instanceof Error) throw p;
  if (!p) return { items: [], hasMore: false };
  return { searchUrl: 'https://loja/busca', hasMore: true, ...p };
};

test('busca para no limite de páginas quando faltam produtos bons', async () => {
  const calls = [];
  const pages = Array.from({ length: 6 }, (_, i) => ({ items: [{ id: i }] }));
  const r = await buscarAteCompletar('kabum', 'rtx 4060', { search: fakeSearch(pages, calls), maxPages: 3, needed: 10 });
  assert.deepEqual(calls, [1, 2, 3]);
  assert.equal(r.parou, 'limite');
  assert.equal(r.items.length, 3);
  assert.equal(r.page, 3);
  assert.equal(r.hasMore, true);
});

test('busca para quando já tem produtos bons suficientes', async () => {
  const calls = [];
  const pages = [{ items: [1, 2, 3, 4] }, { items: [5, 6, 7, 8] }, { items: [9] }];
  const r = await buscarAteCompletar('kabum', 'q', { search: fakeSearch(pages, calls), maxPages: 3, needed: 6 });
  assert.deepEqual(calls, [1, 2]);
  assert.equal(r.parou, 'completo');
  // contar injetável (o servidor conta só produtos com vendedor bom)
  const calls2 = [];
  const r2 = await buscarAteCompletar('kabum', 'q', { search: fakeSearch(pages, calls2), maxPages: 3, needed: 2, contar: (items) => items.filter(x => x % 2 === 0).length });
  assert.deepEqual(calls2, [1]);
  assert.equal(r2.parou, 'completo');
});

test('busca para no fim da loja, em erro, em bloqueio e na pausa após bloqueio', async () => {
  let calls = [];
  let r = await buscarAteCompletar('terabyte', 'q', { search: fakeSearch([{ items: [1], hasMore: false }], calls), maxPages: 3, needed: 10 });
  assert.deepEqual(calls, [1]); assert.equal(r.parou, 'fim'); assert.equal(r.hasMore, false);

  calls = [];
  const bloq = Object.assign(new Error('HTTP 403'), { blocked: true });
  r = await buscarAteCompletar('pichau', 'q', { search: fakeSearch([{ items: [1] }, bloq, { items: [3] }], calls), maxPages: 3, needed: 10 });
  assert.deepEqual(calls, [1, 2]); assert.equal(r.parou, 'bloqueio'); assert.equal(r.items.length, 1); assert.equal(r.error, 'HTTP 403');

  calls = [];
  const pausa = { until: '2026-11-04T18:00:00Z', reason: 'HTTP 429' };
  r = await buscarAteCompletar('pichau', 'q', { search: fakeSearch([{ items: [1] }, Object.assign(new Error('pausada'), { blocked: true, pausa })], calls), maxPages: 3, needed: 10 });
  assert.equal(r.parou, 'pausa'); assert.deepEqual(r.pausa, pausa);

  calls = [];
  r = await buscarAteCompletar('magalu', 'q', { search: fakeSearch([{ items: [1], pausa }, { items: [2] }], calls), maxPages: 3, needed: 10 });
  assert.deepEqual(calls, [1]); assert.equal(r.parou, 'pausa'); assert.equal(r.hasMore, false);

  calls = [];
  r = await buscarAteCompletar('magalu', 'q', { search: fakeSearch([{ items: [1] }, new Error('tempo esgotado')], calls), maxPages: 3, needed: 10 });
  assert.equal(r.parou, 'erro');

  // primeira página com erro: o erro sobe (o servidor já mostra "bloqueado"/"erro" na loja)
  await assert.rejects(buscarAteCompletar('pichau', 'q', { search: fakeSearch([bloq], []), maxPages: 3 }), (e) => e.blocked === true);
  await assert.rejects(buscarAteCompletar('pichau', 'q', {}), /falta a função search/);
});

test('busca com a fixture: conta produtos bons e pede a próxima página só se faltar', async () => {
  const raw = fx.lojas.mercadolivre;
  const pages = [{ items: raw.slice(0, 10) }, { items: raw.slice(10) }, { items: raw.slice(0, 5) }];
  const contar = (items) => produtosBons(cleanResults(items.map(x => normalizeOffer(x, 'mercadolivre', { now: NOW })), fx.query).map(o => withTrust({ ...o, storeId: 'mercadolivre' })), fx.query, { refOf: ref });
  const calls = [];
  const r = await buscarAteCompletar('mercadolivre', fx.query, { search: fakeSearch(pages, calls), maxPages: 3, needed: 6, contar });
  assert.deepEqual(calls, [1, 2]);
  assert.equal(r.parou, 'completo');
});

// ---------- mais dados do vendedor ----------
test('sellerInfoFrom: Shopee (selo), KaBuM parceiro, Amazon (feedback) e genérico', () => {
  assert.deepEqual(sellerInfoFrom('shopee', { is_official_shop: true }), { nativeReputation: { badge: 'mall' } });
  assert.deepEqual(sellerInfoFrom('shopee', { is_official_shop: false, shopee_verified: true }), { nativeReputation: { badge: 'indicado' } });
  assert.deepEqual(sellerInfoFrom('shopee', { is_official_shop: false, shopee_verified: false }), { nativeReputation: { badge: null } });
  assert.equal(sellerInfoFrom('shopee', { name: 'x' }), null, 'sem os campos: sem dado (não é "sem selo")');
  assert.deepEqual(sellerInfoFrom('kabum', { seller_name: 'P', seller_rating: '4,7', seller_rating_count: 1200, seller_sales: 5000 }), { ratingAvg: 4.7, ratingsCount: 1200, sales: 5000 });
  assert.equal(sellerInfoFrom('kabum', { seller_name: 'P' }), null);
  assert.deepEqual(sellerInfoFrom('amazon', { name: 'Loja X', feedbackRating: 4.6, feedbackCount: 830 }), { nativeReputation: { rating: 4.6, ratingsCount: 830 } });
  assert.deepEqual(sellerInfoFrom('amazon', { Name: 'Loja X', FeedbackRating: 4.6, FeedbackCount: 830 }), { nativeReputation: { rating: 4.6, ratingsCount: 830 } });
  assert.equal(sellerInfoFrom('amazon', { name: 'Loja X' }), null);
  assert.deepEqual(sellerInfoFrom('aliexpress', { positiveRate: '95,2%', ratingsCount: 3000 }), { percentPositive: 95.2, ratingsCount: 3000 });
  assert.equal(sellerInfoFrom('aliexpress', null), null);
});

test('adaptadores preenchem offer.sellerInfo: Shopee (fixture) e parceiro da KaBuM', () => {
  const shopee = JSON.parse(readFileSync(new URL('./fixtures/shopee-busca.json', import.meta.url), 'utf8'));
  const items = ADAPTERS.shopee.fromCaptured([shopee]);
  assert.deepEqual(items.map(i => i.sellerInfo?.nativeReputation?.badge), [null, 'mall']);
  const o = normalizeOffer(items[1], 'shopee');
  assert.deepEqual(o.sellerInfo, { nativeReputation: { badge: 'mall' } });

  const k = kabumItems({ data: [
    { id: 1, attributes: { title: 'RTX 4060 Parceiro', price: 1999, price_with_discount: 1899, marketplace: { seller_id: 9, seller_name: 'Parceiro', seller_rating: 4.8, seller_rating_count: 3200 } } },
    { id: 2, attributes: { title: 'RTX 4060 KaBuM', price: 1999, price_with_discount: 1899 } },
  ] });
  assert.deepEqual(k[0].sellerInfo, { ratingAvg: 4.8, ratingsCount: 3200 });
  assert.equal(k[1].sellerInfo, undefined);
  // com os dados do parceiro, a confiança sobe e a oferta sai de "Sem dados do vendedor"
  const off = withTrust({ ...normalizeOffer(k[0], 'kabum'), storeId: 'kabum' });
  const semInfo = withTrust({ ...normalizeOffer({ ...k[0], sellerInfo: undefined }, 'kabum'), storeId: 'kabum' });
  assert.ok(off.trust.confidence > semInfo.trust.confidence);
  assert.equal(avaliarVendedor(semInfo).status, 'semDados');
});

// ---------- interface ----------
test('renderPorLoja: seção por loja com resumo, cards, "Outros N vendedores", sem dados e ocultos', () => {
  const v = view();
  const idx = [];
  const html = renderPorLoja(v, { storeName: (id) => ({ mercadolivre: 'Mercado Livre', kabum: 'KaBuM!', shopee: 'Shopee' }[id]), indexOf: (o) => idx.push(o) - 1 });
  assert.match(html, /<b>KaBuM!<\/b>: <span class="presumo">10 produtos · 1 sem dados do vendedor · 2 de outro modelo ou variante<\/span>/);
  assert.match(html, /Mostrar ocultos \(6\)/);
  assert.match(html, /Sem dados do vendedor \(3\)/);
  assert.match(html, /Outros 2 vendedores/);
  assert.match(html, /nota 35: alto risco — loja aberta há 18 dias/);
  assert.match(html, /data-psort="preco"/);
  assert.match(html, /data-pfiltro checked/);
  assert.match(html, /\+3 produtos além dos 10 mostrados/);
  assert.ok(idx.length > 20 && html.includes(`data-pwatch="${idx.length - 1}"`));
  // escapa o que vem da loja
  const evil = porLojaUma('kabum', [withTrust({ ...normalizeOffer({ title: 'RTX 4060 <img src=x onerror=alert(1)>', pix: 1800 }, 'kabum'), storeId: 'kabum' })], 'rtx 4060');
  const h2 = renderPorLoja([evil]);
  assert.ok(!h2.includes('<img src=x'));
  assert.match(h2, /&lt;img/);
});

test('resumoLoja: singular e plural', () => {
  assert.equal(resumoLoja({ produtos: 1, ocultosNota: 1, semDados: 0, ocultosRelevancia: 0 }), '1 produto · 1 oculto pela nota');
  assert.equal(resumoLoja({ produtos: 0, ocultosNota: 0, semDados: 2, ocultosRelevancia: 0 }), '0 produtos · 2 sem dados do vendedor');
});
