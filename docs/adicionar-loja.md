# Como adicionar uma loja

## 1. Adaptador em `src/stores.js`

Na maioria das lojas, basta a URL de busca, porque o extrator genérico encontra os produtos sozinho:

```js
minhaloja: {
  base: 'https://www.minhaloja.com.br',
  url: (q, page) => `https://www.minhaloja.com.br/busca?q=${encodeURIComponent(q)}&page=${page}`,
  parse: (html, a) => generic(html, a.base, {
    productPath: /\/produto\/\d+/,      // plano B: como são os links de produto
    // linkOf: (obj) => ...,            // se o JSON tiver só um id, monte o link aqui
  }),
},
```

Outras opções:

| Opção | Para quê |
|---|---|
| `api(q, page)` | quando a loja tem uma API JSON pública (tentada antes do HTML) |
| `headers` | cookies ou cabeçalhos extras (ex.: moeda/região) |
| `pages` | quantas páginas ler na busca profunda (padrão 2) |
| `deepOnly: true` | só aparece na busca profunda (comparadores) |
| `browserCapture` + `fromCaptured` | no modo navegador, captura respostas JSON da página |

## 2. Entrada em `data/stores.json`

```json
{
  "id": "minhaloja", "name": "Minha Loja", "color": "#123456",
  "reclameAquiSlug": "minha-loja",
  "reclameAqui": { "nota": 8.0, "solucao": 90, "voltaria": 75, "respondidas": 99, "ra1000": false },
  "rating": { "media": 4.5, "avaliacoes": 10000 },
  "vendas": 100000, "reviewsPositivas": 80,
  "atualizadoEm": "2026-11-03", "fonte": "estimativa inicial"
}
```

Para comparadores de preço, use `"agregador": true` e não preencha os indicadores.

## 3. Teste

1. Salve uma página de busca real da loja (CTRL+S no navegador).
2. Crie um teste em `tests/extract.test.js` com um trecho dessa página, como os testes que já existem.
3. Rode `npm test` e `npm run check`.
4. Rode `npm start`, busque algo e confira se a loja aparece com os preços certos.

Depois, abra um Pull Request. Veja [CONTRIBUTING.md](../CONTRIBUTING.md).
