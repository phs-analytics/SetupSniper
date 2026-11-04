// Endpoint da extensão: cupons ativos da loja aberta (sem dados pessoais) e recusa de endereço inválido.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startDemoServer } from './helpers/server.js';

test('GET /api/extensao/loja traz os cupons da loja, sem dados pessoais', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'setupsniper-ext-'));
  const { base } = await startDemoServer(t, dir);
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const post = (body) => fetch(`${base}${body.url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body.json) });
  await post({ url: '/api/settings', json: { cep: '01310-100' } });
  const r = await (await post({ url: '/api/promo', json: { text: 'SSD Kingston NV2 1TB\nR$ 399\nCupom: SSDKABUM10\nhttps://www.kabum.com.br/produto/123/ssd-kingston' } })).json();
  assert.ok(r.coupon, 'o post não virou cupom');

  const j = await (await fetch(`${base}/api/extensao/loja?url=${encodeURIComponent('https://www.kabum.com.br/produto/123/ssd-kingston')}`)).json();   // cupom de produto aparece na página dele
  assert.deepEqual(j.loja, { id: 'kabum', nome: 'KaBuM!' });
  const c = j.cupons.find((x) => x.codes.includes('SSDKABUM10'));
  assert.ok(c, 'cupom da loja não veio');
  assert.equal(c.origem, 'divulgado');
  assert.match(c.rotulo, /não verificado/);
  assert.doesNotMatch(JSON.stringify(j), /01310|cep|token|chatId|affiliateUrl/i);

  const outra = await (await fetch(`${base}/api/extensao/loja?url=${encodeURIComponent('https://www.exemplo.com.br/')}`)).json();
  assert.deepEqual([outra.loja, outra.cupons.length, outra.historico], [null, 0, null]);
  const ruim = await fetch(`${base}/api/extensao/loja?url=${encodeURIComponent('http://www.kabum.com.br/')}`);
  assert.equal(ruim.status, 400);
});
