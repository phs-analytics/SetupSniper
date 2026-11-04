// Regras puras da extensão (extensao/loja.js): páginas das lojas, o que pode ser enviado, lista de cupons da
// janela, número do selo e texto do histórico. Sem rede e sem navegador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

await import('../extensao/loja.js');
const L = globalThis.SetupSniperLoja;
const FIX = JSON.parse(readFileSync(new URL('./fixtures/extensao-loja.json', import.meta.url), 'utf8'));
const NOW = Date.parse('2026-11-04T15:00:00Z');

test('lojaDaUrl reconhece as 8 lojas pelo domínio e mais nada', () => {
  assert.equal(L.lojaDaUrl('https://www.kabum.com.br/produto/123/placa')?.id, 'kabum');
  assert.equal(L.lojaDaUrl('https://produto.mercadolivre.com.br/MLB-123-x')?.id, 'mercadolivre');
  assert.equal(L.lojaDaUrl('https://pt.aliexpress.com/item/1005.html')?.id, 'aliexpress');
  assert.equal(L.lojaDaUrl('https://kabum.com.br/')?.id, 'kabum');
  assert.equal(L.lojaDaUrl('https://kabum.com.br.golpe.com/produto/1'), null);
  assert.equal(L.lojaDaUrl('https://falsakabum.com.br/'), null);
  assert.equal(L.lojaDaUrl('http://www.kabum.com.br/'), null, 'só https');
  assert.equal(L.lojaDaUrl('chrome://extensions'), null);
  assert.equal(L.lojaDaUrl('lixo'), null);
  assert.equal(L.LOJAS.length, 8);
});

test('ehProduto separa página de produto de busca, carrinho e conta', () => {
  assert.equal(L.ehProduto('https://www.kabum.com.br/produto/123/placa-de-video'), true);
  assert.equal(L.ehProduto('https://www.kabum.com.br/busca/rtx-4060'), false);
  assert.equal(L.ehProduto('https://www.amazon.com.br/Placa-RTX/dp/B0ABCDEF12?ref=x'), true);
  assert.equal(L.ehProduto('https://www.amazon.com.br/s?k=rtx'), false);
  assert.equal(L.ehProduto('https://lista.mercadolivre.com.br/rtx-4060'), false);
  assert.equal(L.ehProduto('https://www.mercadolivre.com.br/placa/p/MLB123456'), true);
  assert.equal(L.ehProduto('https://www.pichau.com.br/placa-de-video-rtx-4060-8gb'), true);
  assert.equal(L.ehProduto('https://www.pichau.com.br/search?q=rtx'), false);
  assert.equal(L.ehProduto('https://www.kabum.com.br/carrinho'), false);
  assert.equal(L.ehProduto('https://shopee.com.br/Placa-RTX-i.123.456'), true);
});

test('elegivel (envio do HTML) continua igual: produto e busca, nunca carrinho, pagamento ou conta', () => {
  assert.equal(L.elegivel('https://www.kabum.com.br/produto/123/placa'), true);
  assert.equal(L.elegivel('https://www.kabum.com.br/busca/rtx'), true);
  assert.equal(L.elegivel('https://www.kabum.com.br/carrinho'), false);
  assert.equal(L.elegivel('https://www.amazon.com.br/gp/buy/spc/handlers/display.html'), false);
  assert.equal(L.elegivel('https://www.mercadolivre.com.br/checkout/MLB-123'), false);
  assert.equal(L.elegivel('https://www.kabum.com.br/minha-conta/pedidos'), false);
});

test('paginaParaConsulta: produto vai sem parâmetros; carrinho e conta vão só como o endereço da loja', () => {
  assert.equal(L.paginaParaConsulta('https://www.amazon.com.br/Placa/dp/B0ABCDEF12?tag=afiliado-20&ref=abc#x'), 'https://www.amazon.com.br/Placa/dp/B0ABCDEF12');
  assert.equal(L.paginaParaConsulta('https://www.kabum.com.br/carrinho?item=1'), 'https://www.kabum.com.br/');
  assert.equal(L.paginaParaConsulta('https://www.kabum.com.br/minha-conta'), 'https://www.kabum.com.br/');
  assert.equal(L.paginaParaConsulta('https://www.kabum.com.br/busca/rtx?page=2'), 'https://www.kabum.com.br/');
  assert.equal(L.paginaParaConsulta('https://www.kabum.com.br/produto/1/x', { enviarPagina: false }), 'https://www.kabum.com.br/', 'envio desligado: só a loja');
  assert.equal(L.paginaParaConsulta('https://www.google.com/search?q=kabum'), null);
});

test('consultaUrl monta GET /api/extensao/loja com url, título e preço (só em página de produto)', () => {
  const u = new URL(L.consultaUrl('http://100.1.2.3:3000/', 'https://www.kabum.com.br/produto/9/rtx?utm=1', { titulo: '  Placa RTX 4060  ', pix: 189990 }));
  assert.equal(u.origin + u.pathname, 'http://100.1.2.3:3000/api/extensao/loja');
  assert.equal(u.searchParams.get('url'), 'https://www.kabum.com.br/produto/9/rtx');
  assert.equal(u.searchParams.get('titulo'), 'Placa RTX 4060');
  assert.equal(u.searchParams.get('pix'), '189990');
  const c = new URL(L.consultaUrl('http://h:3000', 'https://www.kabum.com.br/carrinho', { titulo: 'x', pix: 1 }));
  assert.equal(c.searchParams.get('url'), 'https://www.kabum.com.br/');
  assert.equal(c.searchParams.has('titulo'), false, 'título nunca vai no carrinho');
  assert.equal(c.searchParams.has('pix'), false);
  assert.equal(new URL(L.consultaUrl('http://h', 'https://www.kabum.com.br/produto/9/x', { pix: 10.5 })).searchParams.has('pix'), false, 'preço só em centavos inteiros');
  assert.equal(L.consultaUrl('', 'https://www.kabum.com.br/'), null, 'sem servidor, sem consulta');
  assert.equal(L.consultaUrl('http://h', 'https://exemplo.com/'), null, 'fora das lojas, sem consulta');
});

test('montarLista: só ativos, sem código repetido, oficiais primeiro e promoção no fim', () => {
  const lista = L.montarLista(FIX.cupons, { now: NOW });
  assert.deepEqual(lista.map((c) => c.codigo ?? 'promo'), ['KABUM10', 'FRETEKBM', 'PIX5', 'BLACK50', 'promo']);
  assert.ok(!lista.some((c) => c.codigo === 'VELHO20'), 'vencido fica de fora');
  const k = lista[0];
  assert.equal(k.oficial, true);
  assert.equal(k.origem, 'oficial');
  assert.equal(k.regra, '10% até R$ 50, mínimo R$ 300');
  assert.equal(k.validade, 'válido até 10/11');
  assert.equal(k.rotulo, 'Oficial — enviado pela loja via Awin, válido até 10/11');
  const pix = lista.find((c) => c.codigo === 'PIX5');
  assert.equal(pix.origem, 'divulgado, não verificado');
  assert.equal(pix.rotulo, 'Divulgado por @canalhardware em 03/11, não verificado', 'divulgado sempre diz "não verificado"');
  assert.equal(pix.validade, 'válido até 05/11');
  const frete = lista.find((c) => c.codigo === 'FRETEKBM');
  assert.equal(frete.origem, 'divulgado · funcionou para você');
  assert.equal(frete.validade, 'sem data de fim informada');
  assert.equal(frete.produto, true);
  const black = lista.find((c) => c.codigo === 'BLACK50');
  assert.equal(black.comecou, false);
  assert.equal(black.validade, 'começa em 20/11, válido até 30/11');
  const promo = lista.at(-1);
  assert.equal(promo.promocao, true);
  assert.equal(promo.codigo, null);
  assert.equal(promo.titulo, 'Semana do hardware');
});

test('montarLista aguenta entrada ruim e códigos estranhos', () => {
  assert.deepEqual(L.montarLista(null), []);
  assert.deepEqual(L.montarLista([null, 1, 'x']), []);
  const l = L.montarLista([
    { id: 'a', origem: 'divulgado', codes: ['<script>', 'ok-123'], status: 'unverified' },
    { id: 'b', origem: 'divulgado', codes: ['XY'], status: 'expired' },
  ], { now: NOW });
  assert.equal(l.length, 1);
  assert.deepEqual(l[0].codigos, ['OK-123'], 'só códigos de letras, números, - e _');
  assert.equal(l[0].regra, 'regra não informada (leia as condições)');
  assert.match(l[0].rotulo, /^Divulgado por fonte desconhecida em —, não verificado$/);
  assert.equal(L.montarLista(FIX.cupons, { now: NOW, max: 2 }).length, 2);
});

test('contarSelo e textoSelo: só cupons com código, ativos e já começados', () => {
  const lista = L.montarLista(FIX.cupons, { now: NOW });
  assert.equal(L.contarSelo(lista), 3);
  assert.equal(L.textoSelo(3), '3');
  assert.equal(L.textoSelo(0), '');
  assert.equal(L.textoSelo(0, { erro: true }), '!');
  assert.equal(L.textoSelo(2, { erro: true }), '2', 'cupom tem prioridade sobre o aviso de erro');
  assert.equal(L.textoSelo(150), '99+');
  assert.equal(L.contarSelo([]), 0);
  assert.equal(L.contarSelo(undefined), 0);
  // depois que vencem, o selo cai
  assert.equal(L.contarSelo(L.montarLista(FIX.cupons, { now: Date.parse('2026-11-08T12:00:00Z') })), 2);
});

test('historicoTexto: menor em 90 dias e selo de preço inflado como estimativa', () => {
  const h = L.historicoTexto(FIX.historico);
  assert.equal(h.linha, 'menor em 90 dias: R$ 1.899,90');
  assert.equal(h.menor90, false);
  assert.equal(h.inflado, 'provável preço inflado antes da promoção (estimativa)');
  assert.match(h.dica, /de R\$ 1\.999,90 para R\$ 2\.499,00 e agora está em R\$ 2\.099,00/);
  assert.match(h.dica, /não é acusação/);
  const semInflado = L.historicoTexto({ ...FIX.historico, menor90: true, inflado: { ativo: false } });
  assert.equal(semInflado.inflado, null);
  assert.equal(semInflado.menor90, true);
  assert.deepEqual(L.historicoTexto({ estado: 'historico_comecando' }), { linha: 'histórico começando', menor90: false, inflado: null, dica: null });
  assert.equal(L.historicoTexto(null), null);
  assert.equal(L.historicoTexto({ estado: 'ok', min90: 10.5 }), null, 'centavos inteiros');
});

test('brl formata centavos', () => {
  assert.equal(L.brl(189990), 'R$ 1.899,90');
  assert.equal(L.brl(5000), 'R$ 50,00');
  assert.equal(L.brl(null), '—');
});

test('a extensão não pede permissões novas e não tem código que escreva na página da loja', () => {
  const m = JSON.parse(readFileSync(new URL('../extensao/manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual(m.permissions, ['storage']);
  assert.deepEqual(m.optional_host_permissions, ['http://*/*', 'https://*/*']);
  assert.equal(m.host_permissions.length, 8);
  assert.ok(m.host_permissions.every((h) => /^https:\/\/\*\.[a-z.]+\/\*$/.test(h)));
  assert.deepEqual(m.content_scripts[0].js, ['loja.js', 'content.js']);
  for (const f of ['content.js', 'loja.js', 'background.js', 'popup.js']) {
    const src = readFileSync(new URL(`../extensao/${f}`, import.meta.url), 'utf8');
    const VALUE = /\.value\s*=(?!=)/;
    for (const proibido of [VALUE, /\.click\(\)/, /dispatchEvent/, /executeScript/, /tabs\.sendMessage/, /insertCSS/]) {
      if (f === 'popup.js' && proibido === VALUE) continue;   // o popup preenche só os campos dele mesmo
      assert.doesNotMatch(src, proibido, `${f} não pode ter ${proibido}`);
    }
  }
});
