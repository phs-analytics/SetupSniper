// A extensão de verdade no Chromium (Playwright): selo de cupons no ícone, lista na janela e histórico, numa página
// de produto de fixture, com um servidor falso local no lugar do SetupSniper. Confere que nada escreve no campo de
// cupom da loja, que nada é injetado na página e que o carrinho não é enviado.
// Sem rede: a página da loja é servida pelo próprio Playwright (context.route) e o servidor é local.
// Sem Playwright instalado (npm run navegador), o teste é pulado com o motivo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = JSON.parse(readFileSync(path.join(ROOT, 'tests/fixtures/extensao-loja.json'), 'utf8'));
const PRODUTO_HTML = readFileSync(path.join(ROOT, 'tests/fixtures/extensao-produto.html'), 'utf8');

let chromium = null, motivo = null;
try {
  ({ chromium } = await import('playwright'));
  const exe = chromium.executablePath();
  if (!exe || !existsSync(exe)) motivo = 'Chromium do Playwright não instalado (rode: npm run navegador)';
} catch {
  motivo = 'Playwright não instalado (opcional; rode: npm run navegador)';
}

// Servidor falso: só os três endereços que a extensão usa. Guarda cada pedido para conferir o que foi enviado.
function servidorFalso() {
  const pedidos = [];
  const srv = http.createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    const u = new URL(req.url, 'http://x');
    pedidos.push({ metodo: req.method, caminho: u.pathname, query: Object.fromEntries(u.searchParams), body });
    const json = (code, v) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(v)); };
    if (u.pathname === '/api/health') return json(200, { ok: true });
    if (u.pathname === '/api/extensao/loja' && req.method === 'GET') {
      const { _sobre, ...resp } = FIX;
      // o histórico só vem quando a extensão manda o título (depois que o servidor leu a página)
      return json(200, u.searchParams.get('titulo') ? resp : { ...resp, historico: null });
    }
    if (u.pathname === '/api/capture' && req.method === 'POST') {
      return json(200, { store: 'kabum', kind: 'product', atualizados: 0, items: [{ title: 'Placa de Vídeo RTX 4060 8GB', price: { pix: 209900 } }] });
    }
    json(404, { error: 'não encontrado' });
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve({ srv, pedidos, base: `http://127.0.0.1:${srv.address().port}` })));
}

async function esperar(fn, { ms = 15000, passo = 150, msg = 'condição' } = {}) {
  const fim = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > fim) throw new Error(`tempo esgotado esperando: ${msg}`);
    await new Promise((r) => setTimeout(r, passo));
  }
}

test('Chromium: selo de cupons, lista na janela e histórico, sem tocar no campo de cupom da loja', { skip: motivo ?? false, timeout: 60000 }, async (t) => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'ss-ext-'));
  const { srv, pedidos, base } = await servidorFalso();
  t.after(() => srv.close());

  // Cópia da extensão com o servidor de teste em host_permissions (no uso real, a permissão é pedida no popup).
  const ext = path.join(tmp, 'extensao');
  await cp(path.join(ROOT, 'extensao'), ext, { recursive: true });
  const manifest = JSON.parse(await readFile(path.join(ext, 'manifest.json'), 'utf8'));
  manifest.host_permissions.push('http://127.0.0.1/*');
  await writeFile(path.join(ext, 'manifest.json'), JSON.stringify(manifest));

  let ctx;
  try {
    ctx = await chromium.launchPersistentContext(path.join(tmp, 'perfil'), {
      channel: 'chromium', headless: true,
      args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
    });
  } catch (e) {
    t.skip(`Chromium não abriu neste ambiente: ${String(e?.message ?? e).split('\n')[0]}`);
    return;
  }
  // fecha o navegador antes de apagar o perfil (senão o Chromium ainda está gravando na pasta)
  t.after(async () => { await ctx.close().catch(() => {}); await rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });

  // A loja é a página de fixture, servida localmente (nenhum acesso à rede).
  await ctx.route('https://www.kabum.com.br/**', (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PRODUTO_HTML }));

  const sw = ctx.serviceWorkers()[0] ?? await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  await sw.evaluate((server) => chrome.storage.local.set({ server, enabled: true }), base);

  const loja = await ctx.newPage();
  await loja.goto('https://www.kabum.com.br/produto/123456/placa-de-video-rtx-4060?utm_source=teste&tag=afiliado');

  const selo = () => sw.evaluate(async () => {
    const [aba] = await chrome.tabs.query({ url: 'https://www.kabum.com.br/*' });
    return aba ? chrome.action.getBadgeText({ tabId: aba.id }) : null;
  });
  // 1) selo no ícone com os 3 cupons ativos e já começados
  assert.equal(await esperar(async () => ((await selo()) === '3' ? '3' : null), { msg: 'selo "3"' }), '3');

  // 2) depois do envio da página, a extensão pede de novo com o título (para o histórico)
  const comTitulo = await esperar(() => pedidos.find((p) => p.caminho === '/api/extensao/loja' && p.query.titulo), { msg: 'consulta com título' });
  assert.equal(comTitulo.query.url, 'https://www.kabum.com.br/produto/123456/placa-de-video-rtx-4060', 'sem parâmetros de rastreio');
  assert.equal(comTitulo.query.titulo, 'Placa de Vídeo RTX 4060 8GB');
  assert.equal(comTitulo.query.pix, '209900');
  assert.ok(pedidos.every((p) => p.caminho !== '/api/extensao/loja' || p.metodo === 'GET'));

  // 3) janela da extensão (aberta como aba: usa a loja aberta por último)
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.waitForSelector('#cupons li.cupom >> nth=4', { timeout: 15000 });
  await popup.waitForSelector('#hist:not([hidden])', { timeout: 15000 });
  assert.equal(await popup.textContent('#lojaTitulo'), 'Cupons em KaBuM!');
  const itens = await popup.$$eval('#cupons li.cupom', (lis) => lis.map((li) => ({
    codigo: li.querySelector('code')?.textContent ?? null,
    tag: li.querySelector('.tag')?.textContent,
    regra: li.querySelector('.regra')?.textContent ?? null,
    validade: li.querySelector('.validade')?.textContent,
    rotulo: li.querySelector('.rotulo')?.textContent,
    copiar: !!li.querySelector('button.copiar'),
  })));
  assert.deepEqual(itens.map((i) => i.codigo), ['KABUM10', 'FRETEKBM', 'PIX5', 'BLACK50', null]);
  assert.deepEqual(itens[0], { codigo: 'KABUM10', tag: 'oficial', regra: '10% até R$ 50, mínimo R$ 300', validade: 'válido até 10/11', rotulo: 'Oficial — enviado pela loja via Awin, válido até 10/11', copiar: true });
  assert.equal(itens[2].tag, 'divulgado, não verificado');
  assert.match(itens[2].rotulo, /não verificado$/);
  assert.equal(itens[4].copiar, false, 'promoção sem código não tem Copiar');
  const hist = await popup.textContent('#hist');
  assert.match(hist, /menor em 90 dias: R\$\s1\.899,90/);
  assert.match(hist, /provável preço inflado antes da promoção \(estimativa\)/);

  // 4) Copiar só mexe na janela da extensão
  await popup.click('#cupons li.cupom >> nth=0 >> button.copiar');
  await popup.waitForFunction(() => /KABUM10/.test(document.querySelector('#lojaSt').textContent));

  // 5) na página da loja: campo de cupom vazio, nenhum evento nele, nenhum clique em Aplicar e nenhuma mudança
  //    no DOM (o MutationObserver da página registraria qualquer coisa injetada)
  await loja.waitForTimeout(500);
  assert.equal(await loja.inputValue('input[name=coupon]'), '');
  assert.deepEqual(await loja.evaluate(() => window.__toques), []);

  // 6) carrinho da mesma loja: selo continua, mas nada da página é enviado (só o endereço da loja)
  const antes = pedidos.length;
  await loja.goto('https://www.kabum.com.br/carrinho?item=123');
  await esperar(() => pedidos.slice(antes).find((p) => p.caminho === '/api/extensao/loja'), { msg: 'consulta no carrinho' });
  await loja.waitForTimeout(4500);   // o envio automático espera 3,5 s: no carrinho ele não pode acontecer
  const noCarrinho = pedidos.slice(antes);
  assert.ok(noCarrinho.every((p) => p.caminho !== '/api/capture'), 'carrinho nunca é enviado');
  assert.ok(noCarrinho.filter((p) => p.caminho === '/api/extensao/loja').every((p) => p.query.url === 'https://www.kabum.com.br/' && !p.query.titulo && !p.query.pix));
  assert.equal(await selo(), '3');
  assert.equal(await loja.inputValue('input[name=coupon]'), '');
  assert.deepEqual(await loja.evaluate(() => window.__toques), []);
});
