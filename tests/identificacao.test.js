// O servidor se identifica como SetupSniper: nenhum arquivo se passa por navegador nem imita o site da loja.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { UA } from '../src/http.js';

test('User-Agent honesto, com a versão do projeto', () => {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(UA.startsWith(`SetupSniper/${version} `), true);
  assert.doesNotMatch(UA, /Mozilla|Chrome|Safari|Gecko/);
});

test('nenhum arquivo de src/ imita navegador ou o site da loja', () => {
  for (const f of readdirSync(new URL('../src/', import.meta.url)).filter((x) => x.endsWith('.js'))) {
    const s = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(s, /Mozilla\/5\.0|Chrome\/\d|Sec-Fetch|X-Api-Source/, f);
    assert.doesNotMatch(s, /\bReferer:\s*'https:\/\/(www\.)?(kabum|shopee|pichau|terabyte|amazon|mercadolivre|magazineluiza|aliexpress)/, f);
  }
});
