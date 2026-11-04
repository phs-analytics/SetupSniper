import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  fromPost, fromApiItem, fromCapture, normalizarTexto, dividirPost, precosDe, estimarPrecoFinal,
  chaveDuplicada, estadoOferta, enrichOffer, ordenarOfertas, createOffersStore,
} from '../src/offers.js';
import { normalizeOffer } from '../src/offer.js';
import { TECH_RULES } from '../src/tech-filter.js';

const F = JSON.parse(readFileSync(new URL('./fixtures/ofertas-posts.json', import.meta.url), 'utf8'));
const AT = '2026-11-04T12:00:00.000Z';
const T0 = Date.parse(AT);
const H = 3600e3;
const meta = (sourceName = '@canal', at = AT) => ({ source: 'telegram_channel', sourceName, sourceUrl: `https://t.me/${sourceName.slice(1)}/1`, at });

// Nenhuma função de ofertas pode usar a rede: fetch falha alto se for chamado.
globalThis.fetch = async () => { throw new Error('rede não pode ser usada nos testes de ofertas'); };

test('pelo menos 30 posts de exemplo, cobrindo todos os casos pedidos', () => {
  const P = F.posts;
  assert.ok(P.length >= 30);
  const todas = P.flatMap((p) => p.ofertas);
  assert.ok(todas.some((o) => o.cupons?.length) && todas.some((o) => o.cupons && !o.cupons.length), 'com e sem cupom');
  assert.ok(todas.some((o) => o.pagamento === 'pix') && todas.some((o) => o.pagamento === 'parcelado'), 'Pix e parcelado');
  assert.ok(todas.some((o) => o.precoDe), 'de/por');
  assert.ok(P.some((p) => p.ofertas.length >= 2), 'vários produtos');
  assert.ok(todas.some((o) => o.linkStatus === 'a_resolver'), 'link encurtado');
  assert.ok(P.some((p) => /⃣/u.test(p.texto)), 'emojis no lugar de números');
});

const campo = (o, k, v) => (k === 'produto' ? o.titulo : k === 'cupons' ? (o.cupom?.codes ?? []) : k === 'cupomRotulo' ? o.cupom?.rotulo
  : k === 'regra' ? Object.fromEntries(Object.keys(v).map((x) => [x, o.cupom?.[x]])) : o[k]);

for (const p of F.posts) {
  test(`post ${p.id}`, async () => {
    const deps = p.resolver ? { resolveLink: async (u) => p.resolver[u] } : {};
    const r = await fromPost(p.texto, meta(), deps);
    assert.equal(r.length, p.ofertas.length, 'número de ofertas');
    p.ofertas.forEach((e, i) => {
      for (const [k, v] of Object.entries(e)) assert.deepEqual(campo(r[i], k, v), v, `oferta ${i}: ${k}`);
      for (const k of ['preco', 'precoDe', 'precoFinal']) assert.ok(r[i][k] == null || Number.isInteger(r[i][k]), `${k} em centavos inteiros`);
      assert.ok(r[i].id && r[i].fontes[0].sourceName === '@canal' && r[i].vistoEm === 1);
    });
  });
}

test('emojis: numeração de lista vira marcador e números com emoji viram dígitos', () => {
  assert.equal(normalizarTexto('1️⃣ SSD\nR$ 3️⃣4️⃣9️⃣ e 🔟x'), '• SSD\nR$ 349 e 10x');
  assert.equal(normalizarTexto('R$ 𝟖𝟗,𝟗𝟎'), 'R$ 89,90');
});

test('post com um produto e dois links não é dividido', () => {
  const t = 'SSD Kingston NV3 1TB\nR$ 399\nKaBuM: https://www.kabum.com.br/produto/1\nPichau: https://www.pichau.com.br/ssd';
  assert.equal(dividirPost(t).length, 1);
});

test('preço "de" nunca vem de "acima de R$" nem de "10x de R$"', () => {
  const r = precosDe('Mouse\nR$ 200\nCupom X: R$ 20 OFF acima de R$ 500\nou 10x de R$ 25,00');
  assert.equal(r.preco, 20000);
  assert.equal(r.precoDe, null);
});

test('link encurtado: o resolvedor que falha deixa "a resolver", sem quebrar', async () => {
  const [o] = await fromPost('SSD Kingston NV3 1TB\nR$ 399 no Pix\nhttps://bit.ly/x', meta(), { resolveLink: async () => { throw new Error('HTTP 403'); } });
  assert.equal(o.linkStatus, 'a_resolver');
  assert.equal(o.url, null);
  assert.equal(o.linkOriginal, 'https://bit.ly/x');
});

test('lojas fora das ativas e TikTok Shop ficam de fora', async () => {
  const t = 'SSD Kingston NV3 1TB\nR$ 399\nhttps://www.kabum.com.br/produto/1';
  assert.equal((await fromPost(t, meta(), { activeStores: ['pichau'] })).length, 0);
  assert.equal((await fromPost(t, meta(), { activeStores: ['kabum'] })).length, 1);
  assert.equal((await fromPost('Fone TWS\nR$ 50\nhttps://www.tiktok.com/view/product/1', meta())).length, 0);
});

test('estimativa: um cupom por pedido, pedido mínimo e cupom futuro', () => {
  const base = { preco: 15990, loja: 'kabum', pagamento: 'pix' };
  const min = estimarPrecoFinal({ ...base, cupom: { codes: ['A'], type: 'fixed', value: 3000, minOrder: 30000 } }, { now: T0 });
  assert.equal(min.precoFinal, null);
  assert.match(min.nota, /pedido mínimo/);
  const fut = estimarPrecoFinal({ ...base, cupom: { codes: ['A'], type: 'fixed', value: 3000, origem: 'divulgado', startsAt: '2026-12-01T00:00:00Z' } }, { now: T0 });
  assert.equal(fut.precoFinal, null);
  const ok = estimarPrecoFinal({ ...base, cupom: { codes: ['A', 'B'], type: 'fixed', value: 3000 } }, { now: T0 });
  assert.equal(ok.precoFinal, 12990, 'códigos alternativos não somam');
  assert.deepEqual(estimarPrecoFinal({ ...base, cupom: null }), { precoFinal: 15990, nota: null });
});

test('fromApiItem: só com desconto (preço "de" maior); fromCapture: entra mesmo sem "de"', () => {
  const n = normalizeOffer({ title: 'SSD Kingston NV3 1TB', pix: 399.9, card: 449.9, url: 'https://www.kabum.com.br/produto/1?x=1' }, 'kabum', { now: new Date(AT) });
  assert.equal(fromApiItem(n, { now: T0 }).length, 0);
  const [a] = fromApiItem({ ...n, precoDe: 59990, trust: { score: 80 } }, { now: T0 });
  assert.equal(a.origem, 'api');
  assert.equal(a.preco, 39990);
  assert.equal(a.pagamento, 'pix');
  assert.equal(a.precoDe, 59990);
  assert.equal(a.url, 'https://www.kabum.com.br/produto/1');
  assert.equal(a.trust.score, 80);
  const [c] = fromCapture(n, { now: T0 });
  assert.equal(c.origem, 'extensao');
  assert.equal(c.fontes[0].sourceName, 'seu navegador');
  assert.equal(fromCapture({ ...n, title: null }).length, 0);
});

test('duplicadas: mesma assinatura + loja + preço em 24 h viram um card "visto em N canais"', async () => {
  let now = T0;
  const store = createOffersStore({ file: '/nao/usado.json', now: () => now });
  const t = 'SSD Kingston NV3 1TB NVMe\nR$ 399,90 no Pix\nhttps://www.kabum.com.br/produto/123?tag=a';
  const t2 = 'SSD NV3 1TB Kingston NVMe M.2 🔥\nR$ 399,90 no Pix\nhttps://www.kabum.com.br/produto/123?tag=b';
  assert.equal(store.add(await fromPost(t, meta('@a'))).novas.length, 1);
  const r = store.add(await fromPost(t2, meta('@b', new Date(T0 + 2 * H).toISOString())));
  assert.equal(r.novas.length, 0);
  assert.equal(r.repetidas[0].vistoEm, 2);
  store.add(await fromPost(t, meta('@a', new Date(T0 + 3 * H).toISOString())));   // mesmo canal de novo
  assert.equal(store.list()[0].vistoEm, 2);
  // preço diferente: outro card
  assert.equal(store.add(await fromPost(t.replace('399,90', '389,90'), meta('@c'))).novas.length, 1);
  // mais de 24 h depois da última vez: outro card
  now = T0 + 40 * H;
  assert.equal(store.add(await fromPost(t, meta('@d', new Date(T0 + 40 * H).toISOString()))).novas.length, 1);
  assert.equal(store.size(), 3);
});

test('validade: 24 h sem ser vista, conferência com outro preço ou ❌ → "pode ter acabado"', () => {
  const o = { preco: 10000, at: AT, ultimaVez: AT };
  assert.equal(estadoOferta(o, T0 + 23 * H).status, 'ativa');
  assert.equal(estadoOferta(o, T0 + 25 * H).status, 'pode_ter_acabado');
  assert.match(estadoOferta(o, T0 + 25 * H).motivoStatus, /mais de 24 h/);
  assert.match(estadoOferta({ ...o, checked: { at: AT, preco: 12000 } }, T0).motivoStatus, /R\$ 120,00/);
  assert.equal(estadoOferta({ ...o, checked: { at: new Date(T0 + 20 * H).toISOString(), preco: 10000 } }, T0 + 30 * H).status, 'ativa', 'conferência com o mesmo preço renova');
  assert.equal(estadoOferta({ ...o, feedback: { voto: 'no' } }, T0).status, 'pode_ter_acabado');
  assert.equal(estadoOferta({ ...o, cupom: { codes: ['A'], expiresAt: '2026-11-04T11:00:00Z' } }, T0).motivoStatus, 'o cupom venceu');
});

test('store: markChecked, feedback ✅/❌, guarda 7 dias, flush e load', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ofertas-'));
  try {
    const file = path.join(dir, 'data', 'offers.json');
    let now = T0;
    const s = createOffersStore({ file, now: () => now, onError: () => {} });
    assert.equal(await s.load(), 0, 'arquivo ainda não existe');
    const [o] = await fromPost('Headset HyperX Cloud III\nPreço: R$ 499\nCupom: TECH10 (10% OFF limitado a R$ 30)\nhttps://www.mercadolivre.com.br/headset/p/MLB1', meta());
    s.add([o]);
    assert.equal(s.markChecked(o.id, { preco: 52900, at: T0 + H }).checked.preco, 52900);
    assert.equal(s.list()[0].status, 'pode_ter_acabado');
    assert.equal(s.feedback(o.id, 'ok').cupom.rotulo, 'cupom divulgado, funcionou para você');
    assert.equal(s.feedback(o.id, 'no').cupom.rotulo, 'cupom não funcionou para você');
    assert.throws(() => s.feedback(o.id, 'talvez'));
    assert.equal(s.markChecked('nao-existe', { preco: 1 }), null);
    assert.equal(await s.flush(), true);
    assert.equal(await s.flush(), false, 'nada mudou');
    const salvo = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(salvo.ofertas.length, 1);
    const s2 = createOffersStore({ file, now: () => now });
    assert.equal(await s2.load(), 1);
    assert.equal(s2.get(o.id).feedback.voto, 'no');
    now = T0 + 8 * 24 * H;
    assert.equal(await s2.load(), 0, 'mais de 7 dias: some');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('enriquecimento por injeção: histórico, confiança, comparativo e selo suspeito', () => {
  const o = { id: '1', sig: '4060|msi', preco: 180000, precoFinal: 180000, tech: true };
  const hist = { estado: 'ok', min90: 185000, mediana90: 200000, inflado: { ativo: false } };
  const e = enrichOffer(o, { historico: (sig) => (sig === '4060|msi' ? hist : null), confianca: () => ({ score: 80 }), comparativoUrl: (sig) => `#busca?sig=${encodeURIComponent(sig)}` });
  assert.equal(e.menor90, true);
  assert.equal(e.descontoPct, 10);
  assert.equal(e.confianca, 80);
  assert.ok(Math.abs(e.valor - 0.08) < 1e-9);
  assert.equal(e.comparativoUrl, '#busca?sig=4060%7Cmsi');
  assert.equal(enrichOffer({ ...o, preco: 90000, precoFinal: 90000 }, { historico: () => hist }).suspeito, true);
  // preço "de" inflado não conta como desconto
  assert.equal(enrichOffer({ ...o, sig: 'x', precoDe: 250000 }, { historico: () => ({ estado: 'historico_comecando', inflado: { ativo: true } }) }).descontoPct, 0);
  assert.equal(enrichOffer({ ...o, precoDe: 200000 }, {}).descontoPct, 10, 'sem histórico, usa o preço "de"');
});

test('ordem "Melhor escolha": desconto × confiança; alto risco, suspeitos e "pode ter acabado" depois', () => {
  const mk = (id, extra) => ({ id, preco: 10000, tech: true, status: 'ativa', ultimaVez: AT, ...extra });
  const list = [
    mk('risco', { confianca: 30, valor: 0.5 }),
    mk('suspeito', { confianca: 90, valor: 0.6, suspeito: true }),
    mk('pequeno', { confianca: 90, valor: 0.05 }),
    mk('grande', { confianca: 70, valor: 0.2 }),
    mk('acabou', { confianca: 90, valor: 0.9, status: 'pode_ter_acabado' }),
    mk('semPreco', { preco: null }),
  ];
  const ord = ordenarOfertas(list, 'melhor').map((o) => o.id);
  assert.deepEqual(ord.slice(0, 3), ['grande', 'pequeno', 'acabou']);
  assert.deepEqual(ord.slice(3, 5).sort(), ['risco', 'suspeito']);
  assert.equal(ord[5], 'semPreco');
  assert.deepEqual(ordenarOfertas(list, 'preco').slice(0, 3).map((o) => o.id), ['pequeno', 'grande', 'acabou']);
});

test('list(): filtros com cupom, sem cupom, categoria, loja, preço máximo e "Outros" escondido', async () => {
  const s = createOffersStore({ file: '/x.json', now: () => T0 });
  for (const p of F.posts) s.add(await fromPost(p.texto, meta(), p.resolver ? { resolveLink: async (u) => p.resolver[u] } : {}));
  const todas = s.list();
  const vis = s.list({ filtros: {} });
  assert.ok(vis.every((o) => o.tech) && vis.length < todas.length, 'Outros escondido');
  assert.ok(s.list({ filtros: { cupom: 'com' } }).every((o) => o.cupom?.codes?.length));
  assert.ok(s.list({ filtros: { cupom: 'sem' } }).every((o) => !o.cupom));
  assert.ok(s.list({ filtros: { categoria: 'gpu' } }).every((o) => o.categoria === 'gpu'));
  assert.ok(s.list({ filtros: { loja: 'kabum' } }).every((o) => o.loja === 'kabum'));
  assert.ok(s.list({ filtros: { precoMax: 50000 } }).every((o) => (o.precoFinal ?? o.preco) <= 50000));
  assert.ok(s.list({ filtros: { categoria: 'outros' } }).every((o) => !o.tech));
  assert.equal(s.resumo().outros, todas.filter((o) => !o.tech).length);
});

test('chave de duplicada: produto por assinatura + loja + preço; cupom por loja + códigos', () => {
  assert.equal(chaveDuplicada({ tipo: 'cupom', loja: 'kabum', cupom: { codes: ['b', 'A'] } }), 'cupom|kabum|A,B');
  assert.match(chaveDuplicada({ tipo: 'produto', sig: '4060|msi', loja: 'kabum', preco: 1 }), /^4060\|msi\|kabum\|1$/);
});

test('prazos vêm do JSON', () => {
  const R = { ...TECH_RULES.ofertas, validadeHoras: 1 };
  assert.equal(estadoOferta({ preco: 1, ultimaVez: AT }, T0 + 2 * H, R).status, 'pode_ter_acabado');
});
