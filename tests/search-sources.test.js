// searchStore(): ordem das fontes por loja, trace com a fonte de cada tentativa e pausa após bloqueio. Sem rede.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { searchStore, blockPause, clearBlockPause, listBlockPauses } from '../src/stores.js';

const fx = (f) => readFileSync(new URL('./fixtures/' + f, import.meta.url), 'utf8');
const T0 = Date.UTC(2026, 10, 4, 12, 0, 0);
const HOUR = 3600e3;

// Fontes falsas: cada uma conta as chamadas.
function deps({ html, htmlError, providers = {}, browser = null, now = () => T0, sources } = {}) {
  const calls = { pagina: 0, navegador: 0, prov: {} };
  return {
    calls,
    deps: {
      now, ...(sources ? { sources } : {}),
      fetchText: async () => { calls.pagina++; if (htmlError) throw new Error(htmlError); return html; },
      browserAvailable: () => !!browser,
      renderPage: async () => { calls.navegador++; return browser; },
      providerFor: (store, fonte) => {
        const p = providers[fonte];
        if (!p) return null;
        return { nome: p.nome ?? fonte, configured: () => p.configured !== false,
          search: async () => { calls.prov[fonte] = (calls.prov[fonte] ?? 0) + 1; if (p.error) throw new Error(p.error); return p.items ?? []; } };
      },
    },
  };
}
const item = (title, price = 100) => ({ title, price, url: 'https://www.terabyteshop.com.br/produto/1/x' });

test('Terabyte: o feed de afiliado responde primeiro e a página nem é consultada', async () => {
  clearBlockPause();
  const { calls, deps: d } = deps({ html: fx('terabyte-busca.html'), providers: { 'feed-afiliado': { nome: 'Lomadee (Terabyte)', items: [item('SSD 1TB')] } } });
  const r = await searchStore('terabyte', 'ssd 1tb', { deps: d });
  assert.equal(r.source, 'feed-afiliado');
  assert.equal(r.sourceLegacy, 'afiliado');
  assert.equal(calls.pagina, 0);
  assert.deepEqual(r.trace, [{ via: 'Lomadee (Terabyte)', fonte: 'feed-afiliado', ok: true, n: 1 }]);
});

test('fonte sem credencial é pulada (sem entrada no trace) e a página responde', async () => {
  clearBlockPause();
  const { calls, deps: d } = deps({ html: fx('terabyte-busca.html'), providers: { 'feed-afiliado': { configured: false, items: [item('x')] } } });
  const r = await searchStore('terabyte', 'rtx 4060', { deps: d });
  assert.equal(calls.prov['feed-afiliado'], undefined);
  assert.equal(r.source, 'pagina');
  assert.equal(r.sourceLegacy, 'html');
  assert.equal(r.trace.length, 1);
  assert.equal(r.trace[0].fonte, 'pagina');
  assert.ok(r.items.length > 0);
});

test('a ordem vem de data/stores.json: na KaBuM a API pública vem antes do feed Awin', async () => {
  clearBlockPause();
  const order = [];
  const { deps: d } = deps({ html: '', providers: { 'feed-afiliado': { nome: 'Awin', items: [item('SSD feed')] } } });
  // a API pública da KaBuM (a.api) chama fetchText com json: true; aqui ela falha e o feed responde
  d.fetchText = async (url, o) => { order.push(o?.json ? 'api-publica' : 'pagina'); throw new Error('HTTP 500'); };
  const prov = d.providerFor;
  d.providerFor = (s, f) => { const p = prov(s, f); return p && { ...p, search: async (...a) => { order.push(f); return p.search(...a); } }; };
  const r = await searchStore('kabum', 'ssd', { deps: d });
  assert.deepEqual(order, ['api-publica', 'feed-afiliado']);
  assert.equal(r.source, 'feed-afiliado');
  assert.deepEqual(r.trace.map(t => t.fonte), ['api-publica', 'feed-afiliado']);
});

test('deps.sources troca a ordem (padrão compatível quando a loja não tem "sources")', async () => {
  clearBlockPause();
  const { calls, deps: d } = deps({ html: fx('terabyte-busca.html'), sources: ['pagina', 'navegador'], providers: { 'feed-afiliado': { items: [item('x')] } } });
  const r = await searchStore('terabyte', 'rtx 4060', { deps: d });
  assert.equal(r.source, 'pagina');
  assert.equal(calls.prov['feed-afiliado'], undefined);
});

test('erro da fonte oficial aparece no trace com a fonte e a busca segue para a próxima', async () => {
  clearBlockPause();
  const { deps: d } = deps({ html: fx('amazon-busca.html'), providers: { 'api-oficial': { nome: 'Amazon Creators API', error: 'Amazon Creators API: HTTP 403 (credencial recusada)' } } });
  const r = await searchStore('amazon', 'rtx 4060', { deps: d });
  assert.equal(r.trace[0].fonte, 'api-oficial');
  assert.equal(r.trace[0].ok, false);
  assert.match(r.trace[0].error, /HTTP 403/);
  assert.equal(r.source, 'pagina');
});

test('pausa após bloqueio: HTTP 403 pausa a página e o navegador por 6 h; o trace diz até quando', async () => {
  clearBlockPause();
  let t = T0;
  const browser = { html: fx('pichau-busca.html'), captured: [] };
  const a = deps({ htmlError: 'HTTP 403 (bloqueio anti-bot)', now: () => t });
  // 1ª busca: a página dá 403, a pausa começa; sem navegador instalado
  await assert.rejects(searchStore('pichau', 'rtx 4060', { browserFallback: true, deps: a.deps }), (e) => {
    assert.equal(e.blocked, true);
    assert.equal(e.pausa.until, new Date(T0 + 6 * HOUR).toISOString());
    assert.equal(e.trace[0].fonte, 'pagina');
    assert.equal(e.trace[0].pausadaAte, e.pausa.until);
    assert.equal(e.trace[1].fonte, 'navegador');
    return true;
  });
  assert.equal(a.calls.pagina, 1);
  assert.equal(blockPause('pichau', { now: t }).until, new Date(T0 + 6 * HOUR).toISOString());
  assert.ok(listBlockPauses({ now: t }).pichau);

  // 2ª busca, 1 h depois, agora com navegador: nem a página nem o navegador são tentados
  t = T0 + HOUR;
  const b = deps({ html: fx('pichau-busca.html'), browser, now: () => t });
  await assert.rejects(searchStore('pichau', 'rtx 4060', { browserFallback: true, deps: b.deps }), (e) => {
    assert.equal(e.blocked, true);
    assert.match(e.message, /pausada após bloqueio até/);
    assert.deepEqual(e.trace.map(x => [x.fonte, x.skipped, x.pausadaAte]), [
      ['pagina', true, new Date(T0 + 6 * HOUR).toISOString()],
      ['navegador', true, new Date(T0 + 6 * HOUR).toISOString()],
    ]);
    return true;
  });
  assert.equal(b.calls.pagina, 0);
  assert.equal(b.calls.navegador, 0);

  // diagnóstico manual (noCache) ignora a pausa e, como a página respondeu, a pausa acaba
  const c = deps({ html: fx('pichau-busca.html'), now: () => t });
  const r = await searchStore('pichau', 'rtx 4060', { noCache: true, deps: c.deps });
  assert.equal(c.calls.pagina, 1);
  assert.equal(r.source, 'pagina');
  assert.equal(blockPause('pichau', { now: t }), null);
});

test('pausa após bloqueio: depois de 6 h a página é tentada de novo; fontes oficiais não param', async () => {
  clearBlockPause();
  let t = T0;
  const a = deps({ htmlError: 'HTTP 429 (bloqueio anti-bot)', now: () => t });
  await assert.rejects(searchStore('terabyte', 'ssd', { deps: a.deps }));
  // durante a pausa, a fonte oficial continua respondendo normalmente
  t = T0 + 2 * HOUR;
  const b = deps({ html: '', now: () => t, providers: { 'feed-afiliado': { items: [item('SSD 1TB')] } } });
  const r = await searchStore('terabyte', 'ssd', { deps: b.deps });
  assert.equal(r.source, 'feed-afiliado');
  assert.equal(r.pausa, undefined);
  // passadas 6 h, a página volta a ser consultada
  t = T0 + 6 * HOUR + 1;
  const c = deps({ html: fx('terabyte-busca.html'), now: () => t });
  await searchStore('terabyte', 'rtx 4060', { deps: c.deps });
  assert.equal(c.calls.pagina, 1);
});

test('página de captcha também pausa; navegador que consegue ler encerra a pausa', async () => {
  clearBlockPause();
  const browser = { html: fx('pichau-busca.html'), captured: [] };
  const a = deps({ html: '<title>Just a moment...</title><div id="cf-chl-widget">', browser });
  const r = await searchStore('pichau', 'rtx 4060', { browserFallback: true, deps: a.deps });
  assert.equal(a.calls.navegador, 1);
  assert.equal(r.source, 'navegador');
  assert.equal(r.trace[0].fonte, 'pagina');
  assert.ok(r.trace[0].pausadaAte);
  assert.equal(blockPause('pichau', { now: T0 }), null);
  const b = deps({ html: '<title>Just a moment...</title><div id="cf-chl-widget">' });
  await assert.rejects(searchStore('pichau', 'rtx 4060', { deps: b.deps }), (e) => e.blocked === true && /verificação/.test(e.message));
  assert.ok(blockPause('pichau', { now: T0 }));
  clearBlockPause('pichau');
  assert.equal(blockPause('pichau', { now: T0 }), null);
});

test('erro que não é bloqueio (rede) não pausa a loja', async () => {
  clearBlockPause();
  const a = deps({ htmlError: 'sem resposta (tempo esgotado)' });
  await assert.rejects(searchStore('magalu', 'ssd', { deps: a.deps }), (e) => e.blocked === false);
  assert.equal(blockPause('magalu', { now: T0 }), null);
});
