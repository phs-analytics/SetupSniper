# Fixtures

Páginas de exemplo usadas pelos testes, **sem rede**. Elas reproduzem o formato que cada loja usa
(dados embutidos no HTML, nomes dos campos, blocos de preço), com produtos e preços ilustrativos.

- `*-busca.html` / `shopee-busca.json`: páginas de busca das 8 lojas do escopo.
- `*-produto.html`: páginas de produto (links fixados).
- `bug-parcela.html`: o caso da Fase 1 — um produto cujo menor valor na página é a parcela.

**Reconstruções:** estas fixtures foram montadas a partir da estrutura conhecida de cada loja, porque o
ambiente de desenvolvimento não tinha acesso às lojas. Ao capturar páginas reais (numa janela anônima, sem login),
substitua o arquivo correspondente, apague cookies, nomes e qualquer dado pessoal, e rode `npm test`.
