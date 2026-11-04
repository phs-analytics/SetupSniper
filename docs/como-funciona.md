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
- **TikTok Shop:** está em `data/stores.json` com `"enabled": false` e sem adaptador. Não existe busca pública estável, e os termos do TikTok proíbem coleta automatizada. Posts com link da TikTok Shop encaminhados ao bot são recusados com uma mensagem clara. Detalhes e próximos passos em `docs/tiktok-shop.md`.
- **Imposto de importação:** só vale para as lojas em `importTaxStores` no `data/taxes.json` (hoje Amazon, AliExpress e Shopee). As outras são tratadas como nacionais.

## Como os preços são lidos

Cada loja tem um adaptador em `src/stores.js` que monta a URL de busca. A leitura segue esta ordem:

1. **API pública**, quando existe (Mercado Livre, Shopee).
2. **Extrator genérico** (`src/extract.js`): encontra dados embutidos na página (JSON-LD, `__NEXT_DATA__`, estados iniciais como `window.__X__ = {...}`) e percorre tudo atrás de objetos com cara de produto, ou seja, com nome e preço, e opcionalmente link e imagem. Os preços são **classificados pelo nome do campo**: Pix ou à vista (`priceWithDiscount`, `avista`, `bestPrice`…), crédito (`price`, `salePrice`, `final_price`…), parcelas (`installments`…) e preço "de" (`oldPrice`, `listPrice`, `fullPrice`…), que é ignorado. Nos cartões em HTML, o contexto decide: "à vista", "no Pix" ou "com Pix" indicam Pix, "10x de R$" indica parcela e "de R$" indica o preço riscado.
3. **Leitura dos cartões HTML**, como plano B: links de produto com um "R$" por perto.
4. **Navegador headless**, só na busca profunda e se o Playwright estiver instalado.

## Schema único de oferta (`src/offer.js`)

Todos os adaptadores passam por `normalizeOffer()`. O dinheiro fica **sempre em centavos inteiros** e só é formatado na exibição.

```js
{
  store, seller: { id, name, url, official, cnpj }, title, url, canonicalUrl, image,
  price: { pix, card, installments: { n, value, interestFree } | null, currency: 'BRL', taxesIncluded },
  shipping: { cost, origin: 'BR' | 'INTL' | null, freeAbove },
  available, fetchedAt
}
```

- **Um preço só:** Amazon, Shopee e AliExpress cobram o mesmo valor no Pix e no cartão (`samePrice`).
- **Preço sem forma de pagamento:** quando a página só dá um "preço", ele vira o preço no cartão e o Pix fica `null`.
- **Parcelas:** sem preço no cartão, mas com parcelas sem juros, o total das parcelas vira o preço no cartão. Com parcelas de juros desconhecidos, nada é inventado.
- **Frete:** desconhecido fica `null`, nunca zero.
- **`canonicalUrl`:** é a URL sem parâmetros de rastreamento ou de afiliado.
- **Preço de referência:** é o Pix por padrão. Sem Pix, usa-se o cartão. Dá para trocar para o cartão na aba Alertas (`priceReference` em `data/settings.json`). A ordenação, as metas e os alertas usam esse preço.

## Estado de cada loja nos Fixados (`src/monitor.js`)

Cada loja termina cada verificação com um estado explícito, mostrado na tela:

| Estado | Na tela |
|---|---|
| `ok` | Preço de referência, Pix, cartão e parcelas |
| `price_not_found` | "Preço não encontrado nesta página" (o produto foi achado, mas o preço não foi lido) |
| `unavailable` | "Indisponível" (sem estoque) |
| `out_of_range` | "Fora da faixa": o preço lido está fora da faixa válida do produto |
| `no_match` / `no_results` | Nenhum resultado compatível / nenhum resultado na busca |
| `error` | O erro da loja, por exemplo "bloqueado" |

> **O bug corrigido na v2.4:** o extrator pegava o **menor** valor da página, que muitas vezes era uma parcela. Esse valor caía fora da faixa de preço que o app cria ao fixar uma oferta (de 50% a 250% do preço da primeira loja) e era descartado. Como nenhum estado era gravado, a loja ficava sem preço e sem mensagem. Só a loja da oferta fixada, lida pela página do produto, mostrava preço.

## Total final: Pix e crédito (`src/final-price.js`)

Cada oferta mostra **dois totais**, lado a lado, porque o desconto no Pix, o cupom e a base dos impostos mudam conforme a forma de pagamento:

```
                    PIX                CRÉDITO
Produto             R$ 608,00          R$ 699,00
Cupom VOLTESEMPRE   − R$ 60,80         − R$ 69,90
Frete               + R$ 0,00          + R$ 0,00
Imposto Import.     —                  —            (só importados)
ICMS (UF)           —                  —            (só importados)
TOTAL               R$ 547,20          R$ 629,10    10x R$ 62,91 sem juros
```

- **Cupom de uma forma só:** só entra naquela forma de pagamento (`appliesTo`). Sem essa informação, entra nas duas, com o aviso "pode não valer no crédito".
- **Juros:** no crédito, vale a melhor parcela lida da página. Se houver juros, vale o total com juros.
- **Frete:** sem consulta pública, aparece "frete não informado", nunca zero, e o total fica marcado como **estimativa**.
- **Destaque:** o menor total é destacado, com o aviso "Pix economiza R$ X".
- **Tudo usa o total final:** a ordenação, o "custo × confiança", os Fixados e os alertas usam o **total final** da forma de referência (Pix por padrão). O alerta diz "total final caiu abaixo da sua meta".

### Impostos de importação (`src/import-tax.js`, `data/taxes.json`)

- **Lojas com imposto:** só **Amazon, AliExpress e Shopee** (lista `importTaxStores`). As outras são nacionais. Se aparecer um item internacional nelas, a tela avisa "possível importação, imposto não calculado".
- **Nacional ou internacional:** a origem do envio vem da oferta (`shipping.origin`). Envio do Brasil não paga imposto de importação.
- **Regras vigentes**, com fonte e vigência em `data/taxes.json`, detalhadas em [impostos-importacao.md](impostos-importacao.md):
  - Remessa Conforme até US$ 50: II zero;
  - de US$ 50,01 a US$ 3.000: 60% menos US$ 30;
  - fora do programa: 60%.
- **ICMS "por dentro"** pela UF do seu CEP: `((valor + II) / (1 − alíquota)) × alíquota`. O valor aduaneiro inclui o frete.
- **CEP → UF localmente**, pelas faixas de `data/cep-uf.json`, sem API externa.
- **Cotação do dólar:** é manual por padrão. A PTAX do Banco Central é opcional. A cotação usada aparece na tela.
- **Preço com imposto já incluído:** quando a loja informa isso (`taxesIncluded`), o imposto não é cobrado de novo. Quando não se sabe, aparece um aviso.

## Cupons (`src/discounts.js`, `src/promo-parser.js`)

- **Fontes, em ordem:**
  - posts **encaminhados ao bot** ou colados na aba Cupons;
  - **canais públicos** do Telegram (opt-in, lidos pela prévia `t.me/s/<canal>` a cada 6 h);
  - **cadastro manual**.
- **Como cada fonte foi escolhida:** a pesquisa de fontes está em [cupons.md](cupons.md).
- **O parser lê:**
  - produto e preço anunciado ("de R$ 699 por R$ 547");
  - cupons ("X OU Y" são alternativas);
  - regras: "R$ 50 OFF acima de R$ 300", "10% OFF limitado a R$ 100", frete grátis, só no Pix, primeira compra, só no app, Meli+;
  - link.
- **Link encurtado:** é resolvido seguindo os redirecionamentos públicos (`src/link-resolver.js`), sem login. O resultado é a URL canônica, sem parâmetros de afiliado. Link fora das lojas do escopo é descartado.
- **Regra inferida:** sem regra no post, ela é **inferida** comparando o preço anunciado com o da página. Por exemplo, R$ 608 → R$ 547 dá 10%.
- **Empilhamento:** 1 cupom por pedido (`data/coupon-rules.json`). Cada cupom vale 24 h e fica "não verificado" até você marcar **Funcionou** ou **Não funcionou**.
- **Perfil local** (já comprei na loja, sou assinante): esconde cupons a que você não tem direito.
- **Oportunidade de carrinho:** `basketOpportunity()` diz quanto falta para o pedido mínimo e o preço efetivo do item.
- **Nunca:** testar códigos em massa, gerar cupons nem aplicar cupom no checkout.

## Filtros

- **Relevância:** todos os termos da busca precisam aparecer no título. Com 4 termos ou mais, basta 75% deles. Números e unidades são normalizados ("16 GB" vira "16gb").
- **Acessórios:** títulos com "suporte", "cooler", "adesivo", "capa" e outros termos parecidos são descartados, a menos que o termo esteja na sua busca.
- **Relevância de termos curtos:** termos de 3 letras casam no início de uma palavra, então "rtx 4060" encontra "RTX4060".
- **Preços fora da curva** (pelo preço de referência): abaixo de 25% da mediana o resultado é descartado (acessório ou peça). Abaixo de 55%, é marcado como **suspeito** (golpe, usado ou outro produto). Ofertas sem preço legível não entram na mediana e continuam na lista como "Preço não encontrado nesta página".
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

**"Custo × confiança"** ordena pelo preço ajustado ao risco: `preço × (1 + (100 − nota final) / 400)`. Com nota 100 não há penalidade, e com nota 0 o preço sobe 25%.

### Nota final por oferta: plataforma, vendedor e oferta (`src/seller-score.js`)

A nota da loja (acima) diz pouco sobre **quem vende** num marketplace. Por isso cada oferta recebe uma **nota final** (`offer.trust`), em três camadas:

```
nota bruta = 0,25 × Plataforma + 0,55 × Vendedor + 0,20 × Oferta   →  travas  →  classe
```

- **Plataforma:** a nota da loja, calculada como na seção acima.
- **Vendedor:** sinais positivos (tempo de loja, vendas, avaliações, loja oficial) menos os **sinais de risco**: loja nova com muitas vendas, avaliações em rajada, textos de avaliação repetidos, CNPJ irregular, termômetro vermelho, entre outros. Quando a própria loja vende (KaBuM!, Pichau, Terabyte, "vendido e entregue pela Amazon") ou é loja oficial, o vendedor conta como a plataforma.
- **Oferta:** entrega pela plataforma soma pontos. Preço muito abaixo da mediana tira pontos.
- **Travas:** uma plataforma forte não "salva" um vendedor fraco.
  - Com risco alto, ou CNPJ não ativo, a nota fica em no máximo 39 (**Alto risco**).
  - Com risco moderado, fica em no máximo 54 (**Cautela**).
  - Com pouco dado, fica em no máximo 69 (**Regular**).
- **Classes:** Excelente ≥ 85, Bom ≥ 70, Regular ≥ 55, Cautela ≥ 40 e **Alto risco** abaixo de 40.
- **Nível de confiança:** mostra quanto dado havia sobre o vendedor, separado da nota. Dado ausente entra abaixo do neutro, nunca como "bom".
- **Motivos em português:** cada nota vem com os motivos, que aparecem no carimbo ao passar o mouse e na resposta do bot. O texto fala em "sinais de risco" e nunca acusa ninguém de fraude.

A nota final é a que vale no carimbo, na ordenação "Score" e "Custo × confiança", no score mínimo dos alertas e no bot. Os pesos, as travas e os limites ficam em `data/seller-score.json`, e o estudo completo está em `docs/score-vendedor.md`.

Hoje os adaptadores leem poucos dados do vendedor (nome, loja oficial, origem do envio). Por isso a maioria das ofertas de marketplace sai com confiança baixa e nota limitada a "Regular", e é para ser assim. Quando um adaptador conseguir ler mais (idade da loja, vendas, avaliações), basta preencher `sellerInfo` na oferta.

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
| `POST /api/promo` | processa um post de promoção (link, página, cupom e totais) |
| `POST /api/coupons` · `PATCH/DELETE /api/coupons/:id` | cadastro manual e "Funcionou" / "Não funcionou" |

## O que ainda não foi conferido com as lojas de verdade

O SetupSniper foi desenvolvido num ambiente cuja rede bloqueava os sites das lojas, do Telegram, do Banco Central, do gov.br e do Reclame Aqui. Por isso:

| Parte | Situação | Próximo passo |
|---|---|---|
| Busca e página de produto das 8 lojas | testadas com páginas salvas (`tests/fixtures`), montadas a partir da estrutura conhecida de cada loja, não com acesso ao vivo | rodar `npm start`, buscar "rtx 4060" e conferir loja a loja. Onde aparecer "Preço não encontrado nesta página", salvar o HTML como fixture nova e ajustar o adaptador |
| Links encurtados (meli.la, amzn.to, shopee.ee, tidd.ly...) | testados com respostas simuladas | encaminhar ao bot 2 ou 3 posts reais de cada loja |
| Canais públicos do Telegram (`t.me/s`) | testados com uma página salva | ativar um canal na aba Cupons e conferir o resultado |
| Cotação PTAX (Banco Central) | não acessada | usar o botão PTAX. Se falhar, a cotação manual continua valendo |
| Reclame Aqui | nem a atualização diária nem a pesquisa de cupons (REA) rodaram | conferir as notas em `data/stores.json`. Elas são estimativas iniciais |
| Dados do vendedor | os adaptadores leem nome, loja oficial e origem do envio. Idade da loja, vendas e avaliações do vendedor ainda não são lidas | ler esses campos onde a página mostrar e preencher `sellerInfo` |
| Impostos | a regra de US$ 50,01 a US$ 3.000 e o ICMS de 17 UFs estão marcados `"verificar": true` em `data/taxes.json` | conferir nas fontes citadas no arquivo e trocar para `false` |
| TikTok Shop | só pesquisa, sem nenhum teste de acesso | os passos estão em `docs/tiktok-shop.md` |

