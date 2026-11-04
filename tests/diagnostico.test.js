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
  // credenciais vazias: o teste não depende do .env real (loadEnvFile não sobrescreve o que já existe)
  const semCredenciais = Object.fromEntries(['LOMADEE_API_KEY', 'AWIN_TOKEN', 'AWIN_PUBLISHER_ID', 'AMAZON_CREATORS_CLIENT_ID', 'AMAZON_CREATORS_CLIENT_SECRET', 'AMAZON_PARTNER_TAG', 'ML_CLIENT_ID', 'ML_CLIENT_SECRET', 'SHOPEE_AFFILIATE_APP_ID', 'SHOPEE_AFFILIATE_SECRET', 'ALIEXPRESS_APP_KEY', 'ALIEXPRESS_APP_SECRET'].map(k => [k, '']));
  const { base } = await startDemoServer(t, dataDir, semCredenciais);
  t.after(() => rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  await fetch(`${base}/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cep: '01310-100' }) });
  const d = await (await fetch(`${base}/api/diagnostico`, { method: 'POST' })).json();
  assert.equal(d.lojas.length, 8);
  assert.ok(d.lojas.every(l => Array.isArray(l.tentativas) && typeof l.ms === 'number'));
  assert.deepEqual(Object.keys(d.apisOficiais).sort(), ['aliexpress', 'mercadolivre', 'shopee']);
  // fontes oficiais: só os NOMES das variáveis que faltam (ex.: AWIN_TOKEN), nunca valores
  assert.ok(d.fontesOficiais.length >= 6);
  assert.ok(d.fontesOficiais.every(f => typeof f.configurada === 'boolean' && f.faltam.every(v => /^[A-Z][A-Z0-9_]+$/.test(v))));
  assert.ok(d.fontesOficiais.find(f => f.loja === 'terabyte').faltam.includes('LOMADEE_API_KEY'));
  const txt = JSON.stringify({ ...d, fontesOficiais: d.fontesOficiais.map(({ faltam, ...f }) => f) });
  assert.doesNotMatch(txt, /01310|cep|token|chatId/i);
});

test('erro de rede explicado em português', () => {
  assert.match(netError({ message: 'fetch failed', cause: { code: 'ENOTFOUND' } }), /DNS/);
  assert.match(netError({ name: 'TimeoutError' }), /tempo esgotado/);
  assert.match(netError({ message: 'fetch failed', cause: { code: 'ECONNRESET' } }), /cortada/);
});
