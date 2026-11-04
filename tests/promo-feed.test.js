import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseChannelPage, validChannel } from '../src/telegram-channels.js';
import { parsePromo } from '../src/promo-parser.js';
import { channelStatus, promoFromPost, addPromos, queryPromos, watchMatches } from '../src/promo-feed.js';

const ATIVAS = ['kabum', 'pichau', 'terabyte', 'amazon', 'mercadolivre', 'magalu', 'shopee', 'aliexpress'];
const html = readFileSync(new URL('./fixtures/telegram-canal.html', import.meta.url), 'utf8');

test('os 26 canais sugeridos têm nomes válidos e não se repetem', () => {
  const { canais } = JSON.parse(readFileSync(new URL('../data/telegram-channels.json', import.meta.url), 'utf8'));
  assert.equal(canais.length, 26);
  assert.ok(canais.every(c => validChannel(c.canal)), canais.filter(c => !validChannel(c.canal)).map(c => c.canal).join());
  assert.equal(new Set(canais.map(c => c.canal.toLowerCase())).size, 26);
});

test('post com produto e link de loja vira promoção; conversa solta não', () => {
  const posts = parseChannelPage(html);
  const feed = posts.map(p => promoFromPost(p, '@canaldepromos', parsePromo(p.text), { activeStores: ATIVAS })).filter(Boolean);
  assert.equal(feed.length, 1);
  assert.equal(feed[0].store, 'mercadolivre');
  assert.equal(feed[0].price, 54700);
  assert.equal(feed[0].kind, 'promo+cupom');
  assert.equal(feed[0].channel, 'canaldepromos');
});

test('loja fora do escopo é ignorada', () => {
  const p = parsePromo('Fone XYZ por R$ 99\nhttps://www.tiktok.com/view/product/123');
  assert.equal(promoFromPost({ id: 'c/1', url: 'https://t.me/c/1' }, 'c', p, { activeStores: ATIVAS }), null);
});

test('página sem prévia pública (grupo) é explicada', () => {
  const st = channelStatus('<div class="tgme_page_title">Grupo</div><div class="tgme_page_extra">1 234 members</div>', []);
  assert.equal(st.noPreview, true);
  assert.equal(channelStatus(html, parseChannelPage(html)).ok, true);
});

test('feed: sem repetidos, mais novo primeiro, descarta antigos e pagina', () => {
  const now = Date.parse('2026-11-04T12:00:00Z');
  const mk = (id, h, store = 'kabum', product = 'Placa de Vídeo RTX 4060') => ({ id, date: new Date(now - h * 36e5).toISOString(), store, product, price: 180000 });
  let feed = addPromos([], [mk('a', 1), mk('b', 2), mk('velho', 24 * 10)], { now });
  feed = addPromos(feed, [mk('a', 1), mk('c', 0.5, 'pichau', 'Ryzen 5 7600')], { now });
  assert.deepEqual(feed.map(p => p.id), ['c', 'a', 'b']);
  assert.deepEqual(queryPromos(feed, { store: 'kabum' }).items.map(p => p.id), ['a', 'b']);
  assert.deepEqual(queryPromos(feed, { q: 'rtx 4060', limit: 1 }), { total: 2, items: [feed[1]], hasMore: true });
});

test('promoção bate com produto fixado dentro da meta', () => {
  const promo = { product: 'Placa de Vídeo MSI GeForce RTX 4060 Ventus 2X', price: 179900 };
  const items = [{ id: 1, query: 'rtx 4060', target: 185000 }, { id: 2, query: 'rtx 4060', target: 150000 }, { id: 3, query: 'ryzen 5 7600', target: 999999 }];
  assert.deepEqual(watchMatches(promo, items).map(i => i.id), [1]);
});

test('filtrando por produto, as promoções mais baratas vêm primeiro', () => {
  const feed = [{ id: 'a', product: 'Placa RTX 4060', price: 190000 }, { id: 'b', product: 'Placa RTX 4060 OC', price: 175000 }, { id: 'c', product: 'RTX 4060 sem preço', price: null }];
  assert.deepEqual(queryPromos(feed, { q: 'rtx 4060' }).items.map(p => p.id), ['b', 'a', 'c']);
});
