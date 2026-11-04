// Ponta a ponta (modo demo): colar/encaminhar o post real → cupom inferido e totais Pix/Crédito.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startDemoServer } from './helpers/server.js';

test('post de promoção → cupom salvo (10% inferido) e totais', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'setupsniper-promo-'));
  const { base } = await startDemoServer(t, dir);
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

  const post = '🔥 Monitor Gamer 27" Acer Nitro KG273\nPreço: R$ 547\n🎟️ Cupom: VOLTESEMPRE OU SEMPREPROMO\nhttps://meli.la/2p6DeB7';
  const r = await (await fetch(`${base}/api/promo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: post }) })).json();
  assert.deepEqual(r.coupon.codes, ['VOLTESEMPRE', 'SEMPREPROMO']);
  assert.equal(r.coupon.type, 'percent');
  assert.equal(r.coupon.value, 10);
  assert.equal(r.coupon.inferred, true);
  assert.equal(r.coupon.status, 'unverified');
  assert.ok(r.offer.totals.pix.total < r.offer.price.pix, 'o cupom baixa o Total Pix');
  assert.match(r.text, /Total Pix/);
  assert.match(r.text, /não verificado/);

  const fora = await (await fetch(`${base}/api/promo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'TV\nR$ 999\nCupom: TV10\nhttps://www.americanas.com.br/produto/1' }) })).json();
  assert.match(fora.text, /fora do escopo|link/i);

  const st = await (await fetch(`${base}/api/state`)).json();
  assert.equal(st.coupons.length, 1);
  const p = await fetch(`${base}/api/coupons/${r.coupon.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'expired' }) });
  assert.equal((await p.json()).status, 'expired');
});
