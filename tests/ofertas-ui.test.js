import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderOfertas, ofertaCard, renderFiltros, avisoNovas, novasPendentes, filtrarOfertas, filtrosDe, reaisParaCentavos, haQuanto, vistoEmTexto, brl,
} from '../public/ofertas.js';
import { fromPost, createOffersStore } from '../src/offers.js';

const AT = '2026-11-04T12:00:00.000Z';
const T0 = Date.parse(AT);
const meta = (n = '@canal') => ({ source: 'telegram_channel', sourceName: n, sourceUrl: 'https://t.me/canal/1', at: AT });
const h = { now: T0, lojaNome: (id) => ({ kabum: 'KaBuM!', mercadolivre: 'Mercado Livre' }[id] ?? id) };

test('card: nome, preço anunciado, loja, cupom e preço final ESTIMADO, com os botões e data-*', async () => {
  const [o] = await fromPost('Headset HyperX Cloud III\nPreço: R$ 499 no Pix\n🎟️ Cupom: TECH10 (10% OFF limitado a R$ 30)\nhttps://www.mercadolivre.com.br/headset/p/MLB1?ref=af', meta());
  const html = ofertaCard({ ...o, status: 'ativa' }, h);
  assert.match(html, /Headset HyperX Cloud III/);
  assert.match(html, /preço anunciado no Pix<\/small><b>R\$ 499,00/);
  assert.match(html, /Mercado Livre/);
  assert.match(html, /<code>TECH10<\/code>/);
  assert.match(html, /cupom divulgado, não verificado/);
  assert.match(html, /Divulgado por @canal em 04\/11, não verificado/);
  assert.match(html, /preço final estimado com cupom<\/small><b>R\$ 469,00/);
  assert.match(html, /estimativa: confira o total na loja/);
  assert.match(html, new RegExp(`data-ofixar="${o.id}"`));
  assert.match(html, /data-ocopiar="TECH10"/);
  assert.match(html, new RegExp(`data-ook="${o.id}"`));
  assert.match(html, new RegExp(`data-ono="${o.id}"`));
  assert.match(html, /href="https:\/\/www\.mercadolivre\.com\.br\/headset\/p\/MLB1" target="_blank"/, 'Ver na loja com URL limpa');
  assert.doesNotMatch(html, /ref=af/);
});

test('card sem cupom mostra só o preço do post; link a resolver não vira "Ver na loja"', async () => {
  const [o] = await fromPost('Water Cooler DeepCool LS720\nR$ 599\nhttps://bit.ly/abc', meta());
  const html = ofertaCard(o, h);
  assert.doesNotMatch(html, /estimad/);
  assert.doesNotMatch(html, /Ver na loja/);
  assert.match(html, /link a resolver/);
  assert.match(html, /loja a confirmar/);
});

test('"pode ter acabado", selos do histórico, nota e "visto em N canais"', () => {
  const o = { id: 'x', tipo: 'oferta', origem: 'telegram', titulo: 'SSD', tech: true, preco: 10000, status: 'pode_ter_acabado', motivoStatus: 'divulgada há mais de 24 h',
    historico: { estado: 'ok', min90: 9000, inflado: { ativo: true } }, menor90: false, confianca: 35, vistoEm: 3, ultimaVez: AT };
  const html = ofertaCard(o, h);
  assert.match(html, /of-acabou/);
  assert.match(html, /pode ter acabado: divulgada há mais de 24 h/);
  assert.match(html, /menor em 90 dias: R\$ 90,00/);
  assert.match(html, /preço inflado antes da promoção/);
  assert.match(html, /nota 35: alto risco \(est\.\)/);
  assert.match(html, /visto em 3 canais/);
});

test('escapa HTML do post e só aceita links seguros', () => {
  const html = ofertaCard({ id: '"><x', titulo: '<img src=x onerror=alert(1)>', tech: true, preco: 100, url: 'javascript:alert(1)', comparativoUrl: 'javascript:x', cupom: { codes: ['A"B'] } }, h);
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /&lt;img/);
});

test('renderOfertas: filtros, legenda de estimativa, "Outros" escondido com botão para mostrar e lista vazia', async () => {
  const s = createOffersStore({ file: '/x.json', now: () => T0 });
  s.add(await fromPost('SSD Kingston NV3 1TB\nR$ 399\nhttps://www.kabum.com.br/produto/1', meta()));
  s.add(await fromPost('Air Fryer Mondial 4L\nR$ 299\nhttps://www.kabum.com.br/produto/2', meta()));
  const list = s.list();
  const html = renderOfertas(list, { ...h, categorias: [{ id: 'armazenamento', nome: 'SSD e armazenamento' }], lojas: [{ id: 'kabum', nome: 'KaBuM!' }] });
  assert.match(html, /data-ofiltros/);
  assert.match(html, /SSD Kingston/);
  assert.doesNotMatch(html, /Air Fryer/);
  assert.match(html, /Mostrar 1 oferta fora de tecnologia/);
  assert.match(html, /<b>estimativa<\/b>/);
  assert.match(renderOfertas(list, { ...h, filtros: { outros: true } }), /Air Fryer/);
  assert.match(renderOfertas([], h), /Nenhuma oferta de tecnologia ainda/);
  assert.match(renderOfertas(list, { ...h, filtros: { loja: 'pichau' } }), /Nenhuma oferta com esses filtros/);
});

test('aviso de novas ofertas: só monta o aviso; as pendentes não entram na lista sozinhas', () => {
  assert.equal(avisoNovas(0), '');
  assert.match(avisoNovas(1), /1 nova oferta/);
  assert.match(avisoNovas(3), /data-onovas[^>]*>↑ 3 novas ofertas/);
  assert.deepEqual(novasPendentes([{ id: 'a' }], [{ id: 'a' }, { id: 'b' }]).map((o) => o.id), ['b']);
  assert.match(renderOfertas([], { ...h, novas: 2 }), /2 novas ofertas/);
});

test('filtros puros e leitura dos filtros (preço máximo em reais vira centavos)', () => {
  assert.equal(reaisParaCentavos('1.500,50'), 150050);
  assert.equal(reaisParaCentavos('1500'), 150000);
  assert.equal(reaisParaCentavos('R$ 1.500'), 150000);
  assert.equal(reaisParaCentavos(''), null);
  const f = filtrosDe(new URLSearchParams('cupom=com&categoria=gpu&loja=kabum&precoMax=1500&outros=1&ordem=preco'));
  assert.deepEqual(f, { cupom: 'com', categoria: 'gpu', loja: 'kabum', precoMax: 150000, outros: true, ordem: 'preco' });
  assert.equal(filtrosDe({ cupom: 'x', ordem: 'y' }).cupom, '');
  const L = [{ id: 1, tech: true, preco: 1000, precoFinal: 900, cupom: { codes: ['A'] }, loja: 'kabum', categoria: 'gpu' }, { id: 2, tech: true, preco: 2000, loja: 'pichau', categoria: 'cpu' }, { id: 3, tech: false, preco: 5 }];
  assert.deepEqual(filtrarOfertas(L, {}).map((o) => o.id), [1, 2]);
  assert.deepEqual(filtrarOfertas(L, { precoMax: 900 }).map((o) => o.id), [1], 'usa o preço final estimado');
  assert.deepEqual(filtrarOfertas(L, { cupom: 'sem' }).map((o) => o.id), [2]);
  assert.deepEqual(filtrarOfertas(L, { categoria: 'outros' }).map((o) => o.id), [3]);
  assert.match(renderFiltros({ precoMax: 150050, cupom: 'com' }), /value="1500.5"/);   // valor numérico do campo, sem formatação
});

test('textos auxiliares', () => {
  assert.equal(haQuanto(T0 - 2 * 3600e3, T0), 'há 2 h');
  assert.equal(haQuanto(T0, T0), 'agora');
  assert.equal(vistoEmTexto({ vistoEm: 1, fontes: [{ sourceName: '@a' }] }), 'divulgado por @a');
  assert.equal(brl(12345), 'R$ 123,45');
  assert.equal(brl(null), '—');
});
