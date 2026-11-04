// O diagnóstico testa cada loja do escopo e não expõe dados pessoais.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startDemoServer } from './helpers/server.js';
import { netError } from '../src/http.js';

test('diagnóstico: uma linha por loja, com as tentativas, e sem CEP, token ou chat', async (t) => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'setupsniper-'));
  t.after(() => rmSync(dataDir, { recursive: true, force: true }));
  const { base } = await startDemoServer(t, dataDir);
  await fetch(`${base}/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cep: '01310-100' }) });
  const d = await (await fetch(`${base}/api/diagnostico`, { method: 'POST' })).json();
  assert.equal(d.lojas.length, 8);
  assert.ok(d.lojas.every(l => Array.isArray(l.tentativas) && typeof l.ms === 'number'));
  assert.deepEqual(Object.keys(d.apisOficiais).sort(), ['aliexpress', 'mercadolivre', 'shopee']);
  const txt = JSON.stringify(d);
  assert.doesNotMatch(txt, /01310|cep|token|chatId/i);
});

test('erro de rede explicado em português', () => {
  assert.match(netError({ message: 'fetch failed', cause: { code: 'ENOTFOUND' } }), /DNS/);
  assert.match(netError({ name: 'TimeoutError' }), /tempo esgotado/);
  assert.match(netError({ message: 'fetch failed', cause: { code: 'ECONNRESET' } }), /cortada/);
});
