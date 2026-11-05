// Ajustes do cálculo do total final (aba Alertas): cotação aceita "R$ 5,40", valor inválido é recusado com aviso,
// a PTAX não herda a data da cotação manual e os Fixados são recalculados ao salvar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startDemoServer } from './helpers/server.js';

test('cotação, PTAX e recálculo ao salvar', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'setupsniper-calc-'));
  const { base } = await startDemoServer(t, dir);
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const salvar = (body) => fetch(`${base}/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  let r = await salvar({ cep: '30140-071', fx: { mode: 'manual', usdBrl: 'R$ 5,40' } });
  assert.equal(r.status, 200);
  let j = await r.json();
  assert.equal(j.cep, '30140071');
  assert.equal(j.fx.usdBrl, 5.4);
  assert.equal(typeof j.recalculados, 'number');

  r = await salvar({ fx: { mode: 'manual', usdBrl: 'cinco' } });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /Cotação inválida/);
  j = await (await fetch(`${base}/api/state`)).json();
  assert.equal(j.settings.fx.usdBrl, 5.4, 'valor inválido não apaga a cotação que já existia');

  j = await (await salvar({ fx: { mode: 'ptax' } })).json();
  assert.equal(j.fx.mode, 'ptax');
  assert.equal(j.fx.updatedAt, null, 'a data da PTAX vem do Banco Central, não do salvamento');

  j = await (await salvar({ fx: { mode: 'manual', usdBrl: '' } })).json();
  assert.equal(j.fx.usdBrl, null);
});
