# Fixtures

Páginas de exemplo usadas pelos testes, **sem rede**. Elas reproduzem o formato que cada loja usa
(dados embutidos no HTML, nomes dos campos, blocos de preço), com produtos e preços ilustrativos.

- `*-busca.html` / `shopee-busca.json`: páginas de busca das 8 lojas do escopo.
- `*-produto.html`: páginas de produto (links fixados).
- `bug-parcela.html`: o caso da Fase 1 — um produto cujo menor valor na página é a parcela.

**Reconstruções:** estas fixtures foram montadas a partir da estrutura conhecida de cada loja, porque o
ambiente de desenvolvimento não tinha acesso às lojas. Ao capturar páginas reais (numa janela anônima, sem login),
substitua o arquivo correspondente, apague cookies, nomes e qualquer dado pessoal, e rode `npm test`.

## Fontes oficiais (Etapa 1 do plano 3.0)

Respostas simuladas das APIs, no formato da documentação de cada uma (conferida em 04/11/2026). Ids, tags e
preços são ilustrativos; nenhuma credencial real.

- `awin-feed.jsonl`: feed de produtos da Awin (JSON Lines, formato Google), com uma linha plana, uma linha em
  seções (`product_basic`/`product_price`), um item fora de estoque, um em dólar e um sem preço.
- `awin-programmes.json`: programas aprovados da conta (`/publishers/{id}/programmes`), para achar a KaBuM! pelo domínio.
- `awin-ofertas.json`: Offers API (`/publisher/{id}/promotions`), com um cupom e uma promoção.
- `lomadee-produtos.json`: busca de produtos da Lomadee (`/affiliate/products`), preços em centavos, com um item de outra loja da rede.
- `amazon-creators-busca.json`: `searchItems` da Amazon Creators API, com uma listagem usada (ignorada) e um item sem oferta.
