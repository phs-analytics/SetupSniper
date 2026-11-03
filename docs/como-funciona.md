# Como o SetupSniper funciona

## Visão geral

```
navegador ──SSE──▶ server.js ──▶ src/stores.js (adaptadores) ──▶ lojas
                       │              └─ src/extract.js (extrator genérico + filtros)
                       ├─ fixados: confere a cada N min ─▶ histórico ─▶ alertas ─▶ src/telegram.js
                       └─ data/*.json (tudo local)
```

- **Sem banco de dados:** tudo fica em arquivos JSON na pasta `data/`.
- **Sem dependências:** só a biblioteca padrão do Node.js. O Playwright é opcional.
- **Tempo real:** a interface recebe atualizações por Server-Sent Events (`/api/stream`), e cada busca chega em streaming, loja por loja (`/api/search`).

## Lojas no escopo

O SetupSniper consulta só estas 8 lojas: **KaBuM!, Pichau, Terabyte, Amazon, Mercado Livre, Magalu, Shopee e AliExpress**.

- **Onde fica a lista:** cada loja tem `"enabled": true` ou `false` em `data/stores.json`. Uma loja sem `"enabled": true` fica de fora, para nenhuma loja nova entrar por acidente.
- **Para mudar só na sua máquina:** use `"enabledStores": ["kabum", "pichau", ...]` em `data/settings.json`. Ele sobrescreve o padrão.
- **Quem segue a lista:** a regra fica em `src/scope.js`, e a busca, os Fixados, os alertas e o bot do Telegram a respeitam. Pedir uma loja desativada pela API não faz o servidor consultá-la.
- **Comparadores:** o código do Buscapé e do Zoom continua em `src/stores.js`, mas eles estão desativados.
- **Imposto de importação:** só vale para as lojas em `importTaxStores` no `data/taxes.json` (hoje Amazon, AliExpress e Shopee). As outras são tratadas como nacionais.

## Como os preços são lidos

Cada loja tem um adaptador em `src/stores.js` que monta a URL de busca. A leitura segue esta ordem:

1. **API pública**, quando existe (Mercado Livre, Shopee).
2. **Extrator genérico** (`src/extract.js`): encontra dados embutidos na página (JSON-LD, `__NEXT_DATA__`, estados iniciais como `window.__X__ = {...}`) e percorre tudo atrás de objetos com cara de produto, ou seja, com nome e preço, e opcionalmente link e imagem. Quando o objeto tem vários preços, usa o menor, que costuma ser o preço à vista/PIX.
3. **Leitura dos cartões HTML**, como plano B: links de produto com um "R$" por perto.
4. **Navegador headless**, só na busca profunda e se o Playwright estiver instalado.

## Filtros

- **Relevância:** todos os termos da busca precisam aparecer no título. Com 4 termos ou mais, basta 75% deles. Números e unidades são normalizados ("16 GB" vira "16gb").
- **Acessórios:** títulos com "suporte", "cooler", "adesivo", "capa" e outros termos parecidos são descartados, a menos que o termo esteja na sua busca.
- **Preços fora da curva:** abaixo de 25% da mediana o resultado é descartado (acessório ou parcela). Abaixo de 55%, é marcado como **suspeito** (golpe, usado ou outro produto).
- **Links:** só `http(s)`. Links fixados precisam ser de uma das lojas suportadas.

## Score de confiabilidade

| Componente | Peso | Cálculo |
|---|---|---|
| Reclame Aqui | 40% | 40% nota + 30% índice de solução + 20% voltaria a fazer negócio + 10% respondidas, +5 com o selo RA1000 |
| Avaliação da loja | 25% | média de 1 a 5 levada para 0–100. Com poucas avaliações, a nota é puxada para 50. |
| Volume de vendas | 20% | escala logarítmica: 10 milhões de vendas valem 100 |
| Reviews/comentários | 15% | % de comentários positivos |

Se faltar algum dado, o peso dele é redistribuído entre os outros. A classificação é: ≥85 Excelente, ≥70 Bom, ≥55 Regular e abaixo disso Cautela. No carimbo, as palavras são "confiável", "bom", "regular" e "cautela".

> **A nota não é uma certificação.** Ela é calculada pelo SetupSniper e, enquanto usar os valores de `data/stores.json`, é uma **estimativa**: a interface mostra "(est.)" e um aviso na aba Lojas. Não use as notas como se fossem dados oficiais do Reclame Aqui ou das lojas, por exemplo em posts e vídeos.

Os valores ficam em `data/stores.json`. Eles são **estimativas iniciais** e devem ser conferidos. O servidor tenta atualizar os dados do Reclame Aqui uma vez por dia (melhor esforço).

**"Custo × confiança"** ordena pelo preço ajustado ao risco: `preço × (1 + (100 − score) / 400)`. Com score 100 não há penalidade, e com score 0 o preço sobe 25%.

## Fixados e alertas

A cada `INTERVAL_MIN` minutos, o servidor:

1. busca cada produto fixado nas lojas monitoradas. Para um link fixado, lê a página do próprio produto;
2. guarda o menor preço de cada loja no histórico (`data/history.json`);
3. verifica as regras de alerta (veja [telegram.md](telegram.md)).

## API local

| Rota | O que faz |
|---|---|
| `GET /api/state` | estado completo (lojas, fixados, configurações sem o token) |
| `GET /api/stream` | o mesmo estado, em tempo real (SSE) |
| `GET /api/search?q=&deep=0\|1&stores=a,b` | busca em streaming (SSE) |
| `POST /api/watch` · `PATCH/DELETE /api/watch/:id` | criar, editar e desafixar |
| `POST /api/watch/:id/check` · `POST /api/refresh` | verificar agora |
| `POST /api/settings` · `POST /api/telegram/test` | configurações |
| `GET /api/health` | saúde do servidor |
