// Migração automática dos dados do usuário: até a v2.3, metas, faixas e histórico estavam em reais.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startDemoServer } from './helpers/server.js';

const subir = (dataDir, t) => startDemoServer(t, dataDir);

test('dados antigos em reais viram centavos uma única vez', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'setupsniper-mig-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(path.join(dir, 'watchlist.json'), JSON.stringify({ items: [{ id: 'a1', name: 'Ryzen', query: 'ryzen 7 7800x3d', target: 1700, minPrice: 1200, maxPrice: 5000, pins: {} }] }));
  writeFileSync(path.join(dir, 'history.json'), JSON.stringify({ 'a1:kabum': [{ t: 1, price: 1849.99 }] }));
  writeFileSync(path.join(dir, 'alerts.json'), JSON.stringify({ last: { 'a1:kabum': { price: 1849.99, t: 1 } }, log: [{ t: 1, item: 'Ryzen', price: 1683 }] }));

  const { base } = await subir(dir, t);
  const st = await (await fetch(`${base}/api/state`)).json();
  const it = st.items.find((i) => i.id === 'a1');
  assert.deepEqual([it.target, it.minPrice, it.maxPrice], [170000, 120000, 500000]);
  assert.equal(st.alerts.find((a) => a.item === 'Ryzen').price, 168300);

  const w = JSON.parse(readFileSync(path.join(dir, 'watchlist.json'), 'utf8'));
  assert.equal(w.schemaVersion, 2);
  assert.equal(w.items[0].target, 170000);
  const h = JSON.parse(readFileSync(path.join(dir, 'history.json'), 'utf8'));
  assert.equal(h['a1:kabum'][0].price, 184999);
});

test('dados já em centavos (schemaVersion 2) não são convertidos de novo', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'setupsniper-mig2-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(path.join(dir, 'watchlist.json'), JSON.stringify({ schemaVersion: 2, items: [{ id: 'b1', name: 'SSD', query: 'ssd nvme 1tb', target: 45000, pins: {} }] }));
  const { base } = await subir(dir, t);
  const st = await (await fetch(`${base}/api/state`)).json();
  assert.equal(st.items.find((i) => i.id === 'b1').target, 45000);
});
