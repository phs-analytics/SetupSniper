// Aba Ofertas no servidor demo: os posts simulados dos canais viram ofertas de tecnologia, com e sem cupom.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startDemoServer } from './helpers/server.js';

test('GET /api/offers traz ofertas simuladas com e sem cupom; ✅/❌ anota o voto', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'setupsniper-ofertas-'));
  const { base } = await startDemoServer(t, dir);
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  let r;
  for (let i = 0; i < 40; i++) {            // o demo lê os canais simulados ~1,5 s depois de subir
    r = await (await fetch(`${base}/api/offers`)).json();
    if (r.items.length) break;
    await new Promise((ok) => setTimeout(ok, 250));
  }
  const tech = r.items.filter((o) => o.tech);
  assert.ok(tech.length > 0, 'nenhuma oferta de tecnologia');
  assert.ok(tech.some((o) => o.cupom), 'nenhuma oferta com cupom');
  assert.ok(tech.some((o) => !o.cupom), 'nenhuma oferta sem cupom');
  assert.ok(tech.every((o) => Number.isInteger(o.preco) || o.preco == null), 'preço fora de centavos');
  assert.ok(Array.isArray(r.categorias) && r.categorias.length, 'sem categorias');
  const st = await (await fetch(`${base}/api/state`)).json();
  assert.ok(st.ofertas.total >= tech.length);
  const v = await fetch(`${base}/api/offers/${tech[0].id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voto: 'ok' }) });
  assert.equal(v.status, 200);
  const ruim = await fetch(`${base}/api/offers/${tech[0].id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voto: 'talvez' }) });
  assert.equal(ruim.status, 400);
});
