// Páginas abertas pelo próprio usuário e enviadas pela extensão (/api/capture).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseCapture, pageKind } from '../src/capture.js';
import { normalizeOffer } from '../src/offer.js';
import { startDemoServer } from './helpers/server.js';

const fx = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');

test('reconhece página de produto e de busca pelo endereço', () => {
  assert.equal(pageKind('https://www.kabum.com.br/produto/426262/rtx', 'kabum'), 'product');
  assert.equal(pageKind('https://www.kabum.com.br/busca/rtx-4060', 'kabum'), 'search');
  assert.equal(pageKind('https://www.amazon.com.br/Placa-Video/dp/B0BTZB7F88/ref=x', 'amazon'), 'product');
  assert.equal(pageKind('https://produto.mercadolivre.com.br/MLB-123-placa', 'mercadolivre'), 'product');
});

test('página de produto enviada vira uma oferta com preço', () => {
  const r = parseCapture({ url: 'https://www.kabum.com.br/produto/426262', html: fx('kabum-produto.html') });
  assert.equal(r.store, 'kabum');
  assert.equal(r.kind, 'product');
  const o = normalizeOffer(r.items[0], 'kabum');
  assert.ok(o.price.pix > 0);
});

test('página de busca enviada vira várias ofertas', () => {
  const r = parseCapture({ url: 'https://www.kabum.com.br/busca/rtx-4060', html: fx('kabum-busca.html') });
  assert.equal(r.kind, 'search');
  assert.ok(r.items.length >= 1);
});

test('página de outra loja ou de verificação é recusada com explicação', () => {
  assert.match(parseCapture({ url: 'https://exemplo.com/x', html: '<html></html>' }).error, /não é de uma loja/);
  assert.match(parseCapture({ url: 'https://www.kabum.com.br/busca/x', html: '<title>Just a moment...</title>' }).error, /verificação/);
});

test('/api/capture aceita página grande e devolve as ofertas com totais e nota', async (t) => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'setupsniper-'));
  const { base } = await startDemoServer(t, dataDir);
  t.after(() => rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const html = fx('kabum-produto.html') + '<!--' + 'x'.repeat(300000) + '-->';
  const r = await (await fetch(`${base}/api/capture`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://www.kabum.com.br/produto/426262', html }) })).json();
  assert.equal(r.store, 'kabum');
  assert.equal(r.items.length, 1);
  assert.ok(r.items[0].totals?.pix?.total > 0);
  assert.equal(typeof r.items[0].trust?.score, 'number');
});

test('preço enviado pelo navegador entra na busca da loja', async (t) => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'setupsniper-'));
  const { base } = await startDemoServer(t, dataDir);
  t.after(() => rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  await fetch(`${base}/api/capture`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://www.kabum.com.br/produto/426262', html: fx('kabum-produto.html'), source: 'extensao' }) });
  const body = await (await fetch(`${base}/api/search?q=${encodeURIComponent('ryzen 7 7800x3d')}&stores=kabum`)).text();
  const items = body.split('\n').filter(l => l.startsWith('data: ')).map(l => JSON.parse(l.slice(6))).filter(m => m.type === 'store').flatMap(m => m.items);
  assert.ok(items.some(o => o.captured && o.url?.includes('426262')), 'a oferta enviada aparece na busca');
});
