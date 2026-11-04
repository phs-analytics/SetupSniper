// Leitura dos posts para a aba Ofertas: tipo (produto, cupom, desconto), nome certo, preço certo e loja.
// Os casos de tests/fixtures/ofertas-posts-reais.json são posts reais de canais públicos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lerPost } from '../src/post-oferta.js';
import { decode } from '../src/extract.js';
import { storeFromUrl, storeFromText } from '../src/promo-parser.js';

const { casos } = JSON.parse(readFileSync(new URL('./fixtures/ofertas-posts-reais.json', import.meta.url), 'utf8'));

test('posts reais: tipo, nome, preço, pagamento, loja e cupom', () => {
  assert.ok(casos.length >= 20);
  for (const c of casos) {
    const r = lerPost(c.texto);
    const lido = r && { tipo: r.tipo, titulo: r.titulo, preco: r.preco, pagamento: r.pagamento, loja: r.loja, codes: r.codes };
    assert.deepEqual(lido, c.esperado, `${c.canal}: ${c.texto.split('\n')[0]}`);
  }
});

test('o cifrão do Telegram ("R&#036;") vira "R$"', () => {
  assert.equal(decode('Preço: R&#036; 394'), 'Preço: R$ 394');
  assert.equal(lerPost(decode('🔥 SSD Kingston NV2 1TB') + '\n' + decode('Preço: R&#036; 349') + '\nhttps://www.kabum.com.br/produto/1').preco, 34900);
});

test('chamada do canal não vira nome do produto', () => {
  const r = lerPost('🥉 ESSA É SUCESSO NA FARIA LIMA\nStanley Copo Quencher 1.18L\n🎟 Cupom: 15MODA0411\npor 130,28 no pix\nhttps://meli.la/2WUEEXB');
  assert.equal(r.titulo, 'Stanley Copo Quencher 1.18L');
  assert.equal(r.preco, 13028);
  assert.equal(r.pagamento, 'pix');
  assert.deepEqual(r.codes, ['15MODA0411']);
});

test('cupom sem produto vira "cupom"; desconto sem código vira "desconto"', () => {
  const c = lerPost('🚨 Novo Cupom KABUM\n🏷 15% OFF em Memórias ram selecionadas\n🏷 Código: DRAMOFF15\n🔗 Válido/Ative aqui: https://ofertou.ai/MXBJ-Kabum');
  assert.deepEqual([c.tipo, c.titulo, c.loja, c.codes], ['cupom', '15% OFF em Memórias ram selecionadas', 'kabum', ['DRAMOFF15']]);
  const ml = lerPost('🙀 LIBEROU PARA RESGATE CUPOM MERCADO LIVRE 🙀\n👀 clique no link: https://mercadolivre.com/sec/21SYs6R\n3 Clique para resgatar o cupom de 20% OFF');
  assert.deepEqual([ml.tipo, ml.titulo, ml.loja, ml.codes], ['cupom', 'Cupom de 20% OFF', 'mercadolivre', []]);
  const d = lerPost('Semana do SSD na Pichau: até 40% OFF em SSDs e memórias\nhttps://www.pichau.com.br/armazenamento');
  assert.deepEqual([d.tipo, d.loja, d.preco], ['desconto', 'pichau', null]);
  assert.match(d.titulo, /40% OFF/);
});

test('loja pelo link (inclusive encurtadores de canal) e pelo texto', () => {
  assert.equal(storeFromUrl('https://ofertou.ai/d9PG-Kabum'), 'kabum');
  assert.equal(storeFromUrl('https://ofertou.ai/XxcF-Magalu'), 'magalu');
  assert.equal(storeFromUrl('https://pcdofafa.com.br/p/kabum/tad2rg'), 'kabum');
  assert.equal(storeFromUrl('https://link.amazon/B01dohs0w'), 'amazon');
  assert.equal(storeFromUrl('https://nerdofertas.com/'), null);
  assert.equal(storeFromText('AMAZON SOLTOU CUPOM'), 'amazon');
  assert.equal(storeFromText('🙀 Cupom Magalu - WhatsApp'), 'magalu');
  assert.equal(storeFromText('Mouse gamer sem fio'), null);
});

test('conversa e notícia não viram oferta', () => {
  assert.equal(lerPost('Bom dia, pessoal! Hoje tem live às 20h.'), null);
  assert.equal(lerPost('A Black Friday virou Black November com promoções durante todo o mês.'), null);
});

test('encurtador nunca vira o link "Ver na loja"', async () => {
  const { resolveLink } = await import('../src/link-resolver.js');
  const { fromPost } = await import('../src/offers.js');
  // o encurtador responde 200 sem redirecionar: o resolvedor recusa em vez de devolver o encurtador
  const fetchImpl = async () => ({ status: 200, headers: { get: () => null }, text: async () => '<html><body>oi</body></html>' });
  await assert.rejects(resolveLink('https://ofertou.ai/d9PG-Kabum', { fetchImpl }), /encurtador/);
  // um resolvedor que devolve o próprio encurtador também não vale: a oferta fica "a resolver"
  const post = '👌 Monitor Gamer AOC 25" 310Hz\n💲 Valor: R$949,99 no PIX\nCupom: BF20OFF\n👀 https://ofertou.ai/abc-Kabum';
  const [o] = await fromPost(post, { source: 'telegram_channel', sourceName: '@canal', sourceUrl: 'https://t.me/canal/1' },
    { activeStores: ['kabum'], resolveLink: async (u) => ({ canonicalUrl: u, store: 'kabum' }) });
  assert.equal(o.url, null);
  assert.equal(o.linkStatus, 'a_resolver');
  assert.equal(o.loja, 'kabum');
});
