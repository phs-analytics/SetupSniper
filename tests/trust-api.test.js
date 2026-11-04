// Integração: cada oferta da busca chega com a nota final (plataforma + vendedor + oferta).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startDemoServer } from './helpers/server.js';

test('a busca devolve trust com nota, nível, motivos e confiança', async (t) => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'setupsniper-'));
  t.after(() => rmSync(dataDir, { recursive: true, force: true }));
  const { base } = await startDemoServer(t, dataDir);
  const body = await (await fetch(`${base}/api/search?q=rtx%204060`)).text();
  const items = body.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)))
    .filter((m) => m.type === 'store').flatMap((m) => m.items ?? []);
  assert.ok(items.length > 0);
  for (const o of items) {
    assert.equal(typeof o.trust?.score, 'number');
    assert.ok(o.trust.score >= 0 && o.trust.score <= 100);
    assert.equal(typeof o.trust.tier, 'string');
    assert.ok(Array.isArray(o.trust.reasons));
    for (const r of o.trust.reasons) assert.doesNotMatch(r, /fraudador/i);
  }
});
