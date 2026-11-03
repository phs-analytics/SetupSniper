// Escopo de lojas: por padrão só as 8 lojas do escopo são consultadas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { activeStoreIds } from '../src/scope.js';
import { ADAPTERS } from '../src/stores.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { stores } = JSON.parse(readFileSync(path.join(ROOT, 'data/stores.json'), 'utf8'));
const ESCOPO = ['kabum', 'pichau', 'terabyte', 'amazon', 'mercadolivre', 'magalu', 'shopee', 'aliexpress'];

test('por padrão, só as 8 lojas do escopo ficam ativas', () => {
  assert.deepEqual(activeStoreIds(stores, {}, ADAPTERS).sort(), [...ESCOPO].sort());
});

test('comparadores e lojas fora do escopo continuam no código, mas desativados', () => {
  for (const id of ['buscape', 'zoom']) {
    assert.ok(ADAPTERS[id], `o adaptador ${id} deve continuar existindo`);
    assert.equal(stores.find((s) => s.id === id).enabled, false);
  }
});

test('loja sem "enabled": true não entra no escopo por acidente', () => {
  const lojas = [{ id: 'kabum', enabled: true }, { id: 'pichau' }];
  assert.deepEqual(activeStoreIds(lojas, {}, ADAPTERS), ['kabum']);
});

test('enabledStores em settings.json sobrescreve o padrão e ignora lojas desconhecidas', () => {
  const ids = activeStoreIds(stores, { enabledStores: ['kabum', 'zoom', 'loja-que-nao-existe', 'kabum'] }, ADAPTERS);
  assert.deepEqual(ids, ['kabum', 'zoom']);
});

test('importTaxStores começa com Amazon, AliExpress e Shopee', () => {
  const taxes = JSON.parse(readFileSync(path.join(ROOT, 'data/taxes.json'), 'utf8'));
  assert.deepEqual([...taxes.importTaxStores].sort(), ['aliexpress', 'amazon', 'shopee']);
});

// Integração: sobe o servidor em modo demo, com os dados do usuário numa pasta temporária,
// e confere quais lojas o /api/search realmente consulta.
test('o servidor só consulta as lojas do escopo, inclusive na busca profunda', async (t) => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'setupsniper-'));
  const port = 39000 + Math.floor(Math.random() * 900);
  const srv = spawn(process.execPath, ['server.js', '--demo'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir, SENHA: '', TELEGRAM_TOKEN: '' },
    stdio: 'ignore',
  });
  t.after(() => { srv.kill(); rmSync(dataDir, { recursive: true, force: true }); });

  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 100));
  }

  const lojasConsultadas = async (qs) => {
    const body = await (await fetch(`${base}/api/search?${qs}`)).text();
    return body.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)))
      .filter((m) => m.type === 'store').map((m) => m.storeId).sort();
  };

  assert.deepEqual(await lojasConsultadas('q=rtx%204060'), [...ESCOPO].sort());
  assert.deepEqual(await lojasConsultadas('q=rtx%204060&deep=1'), [...ESCOPO].sort());
  assert.deepEqual(await lojasConsultadas('q=rtx%204060&deep=1&stores=buscape,zoom'), []);

  const state = await (await fetch(`${base}/api/state`)).json();
  assert.deepEqual(state.stores.map((s) => s.id).sort(), [...ESCOPO].sort());
});
