import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePromo, storeFromUrl } from '../src/promo-parser.js';
import { parseChannelPage, validChannel } from '../src/telegram-channels.js';
import { resolveLink, htmlRedirect } from '../src/link-resolver.js';

const fx = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const POSTS = JSON.parse(fx('promo-posts.json'));

test('o post real do grupo: produto, preço, os dois cupons e o link do Mercado Livre', () => {
  const r = parsePromo('🔥 Monitor Gamer 27" Acer Nitro KG3 … KG273 G0bi\nPreço: R$ 547\n🎟️ Cupom: VOLTESEMPRE OU SEMPREPROMO\nhttps://meli.la/2p6DeB7');
  assert.equal(r.product, 'Monitor Gamer 27" Acer Nitro KG3 … KG273 G0bi');
  assert.equal(r.announcedPrice, 54700);
  assert.deepEqual(r.coupons, ['VOLTESEMPRE', 'SEMPREPROMO']);
  assert.equal(r.store, 'mercadolivre');
});

for (const p of POSTS) {
  test(`post ${p.id}: preço, cupons, link e loja`, () => {
    const r = parsePromo(p.texto);
    assert.equal(r.announcedPrice, p.esperado.preco_anunciado_centavos, 'preço anunciado');
    assert.deepEqual(r.coupons, p.esperado.cupons, 'cupons');
    assert.equal(r.links[0], p.esperado.link, 'link');
    if (p.loja_esperada === null) assert.equal(r.store, null, 'fora do escopo');
    else assert.ok(r.store === p.loja_esperada || r.needsResolution, `loja (${r.store})`);
  });
}

test('regras: valor fixo com mínimo, percentual com teto, frete grátis, Pix, primeira compra, app e assinantes', () => {
  const a = parsePromo('SSD\nde R$ 699 por R$ 419,90\nUse o cupom: NV3OFF / TECH10\nR$ 50 OFF acima de R$ 300 · só no Pix\nhttps://www.kabum.com.br/produto/1');
  assert.deepEqual(a.rules[0], { type: 'fixed', value: 5000, minOrder: 30000 });
  assert.deepEqual(a.appliesTo, ['pix']);
  assert.equal(a.oldPrice, 69900);
  const b = parsePromo('Teclado\n💰 547,90\nCódigo: REDRA10 (10% OFF limitado a R$ 100) primeira compra, só no app, Meli+\nFrete grátis\nhttps://s.shopee.com.br/abc');
  assert.deepEqual(b.rules[0], { type: 'percent', value: 10, maxDiscount: 10000, minOrder: null });
  assert.ok(b.rules.some((x) => x.type === 'shipping'));
  assert.deepEqual(b.conditions.sort(), ['app_only', 'first_purchase', 'subscriber']);
  assert.equal(b.announcedPrice, 54790);
});

test('loja pelo domínio, inclusive encurtadores de afiliado', () => {
  assert.equal(storeFromUrl('https://meli.la/x'), 'mercadolivre');
  assert.equal(storeFromUrl('https://amzn.to/x'), 'amazon');
  assert.equal(storeFromUrl('https://shopee.ee/x'), 'shopee');
  assert.equal(storeFromUrl('https://www.magazinevoce.com.br/loja/p/1/'), 'magalu');
  assert.equal(storeFromUrl('https://www.americanas.com.br/produto/1'), null);
  assert.equal(parsePromo('X\nR$ 10\nhttps://tidd.ly/abc').needsResolution, true);
});

test('canal público do Telegram (t.me/s): posts com texto, links completos e data', () => {
  const posts = parseChannelPage(fx('telegram-canal.html'));
  assert.equal(posts.length, 2);
  assert.equal(posts[0].id, 'canaldepromos/101');
  assert.match(posts[0].text, /Cupom: VOLTESEMPRE OU SEMPREPROMO/);
  assert.match(posts[0].text, /https:\/\/meli\.la\/2p6DeB7/);
  assert.deepEqual(parsePromo(posts[0].text).coupons, ['VOLTESEMPRE', 'SEMPREPROMO']);
  assert.equal(validChannel('canal_de_promos'), true);
  assert.equal(validChannel('https://evil'), false);
});

// fetch falso: encurtador → 301 → página da loja
const fakeFetch = (rotas) => async (url) => {
  const r = rotas[url];
  if (!r) throw new Error('rota inesperada ' + url);
  return { status: r.status, headers: { get: (h) => (h === 'location' ? r.location ?? null : null) }, text: async () => r.html ?? '' };
};

test('resolve o link encurtado seguindo redirecionamentos e chega à URL canônica', async () => {
  const r = await resolveLink('https://meli.la/2p6DeB7', { fetchImpl: fakeFetch({
    'https://meli.la/2p6DeB7': { status: 301, location: 'https://www.mercadolivre.com.br/monitor/p/MLB123?matt_tool=1&matt_word=x' },
    'https://www.mercadolivre.com.br/monitor/p/MLB123?matt_tool=1&matt_word=x': { status: 200, html: '<html>produto</html>' },
  }) });
  assert.equal(r.store, 'mercadolivre');
  assert.equal(r.canonicalUrl, 'https://www.mercadolivre.com.br/monitor/p/MLB123');   // sem parâmetros de afiliado
  assert.equal(r.chain.length, 2);
});

test('encurtador com redirecionamento no HTML; link para fora das lojas é recusado', async () => {
  assert.equal(htmlRedirect('<meta http-equiv="refresh" content="0;url=https://www.kabum.com.br/produto/1">', 'https://tidd.ly/x'), 'https://www.kabum.com.br/produto/1');
  const r = await resolveLink('https://tidd.ly/x', { fetchImpl: fakeFetch({
    'https://tidd.ly/x': { status: 200, html: '<script>window.location.href="https://www.kabum.com.br/produto/1"</script>' },
    'https://www.kabum.com.br/produto/1': { status: 200, html: 'ok' },
  }) });
  assert.equal(r.store, 'kabum');
  await assert.rejects(resolveLink('https://bit.ly/x', { fetchImpl: fakeFetch({ 'https://bit.ly/x': { status: 302, location: 'https://site-malicioso.example/login' } }) }), /fora das lojas suportadas/);
});
