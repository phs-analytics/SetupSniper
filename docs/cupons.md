# Cupons: de onde vêm e como o SetupSniper pode lê-los

Pesquisa feita em **03/11/2026**. O objetivo é replicar, de forma legítima, o que os grupos de promoção
fazem: postar **produto + preço calculado + cupom + link**. Exemplo real do formato:

```
Monitor Gamer 27" Acer Nitro KG273 G0bi
Preço: R$ 547
🎟️ Cupom: VOLTESEMPRE OU SEMPREPROMO
https://meli.la/2p6DeB7
```

No site, o produto custava R$ 608 no Pix e R$ 699 no crédito. O cupom é que baixou o preço para R$ 547.
O cupom **não vem dentro do link**: o comprador digita o código no checkout.

> **Como ler este documento.** O ambiente da pesquisa bloqueava os sites das lojas e quase todos os sites
> de terceiros. Por isso, a maior parte das informações saiu de **resultados de busca** (trechos indexados),
> e não da leitura completa das páginas. Tudo o que não foi confirmado por uma fonte aparece como
> **não confirmado**. Antes de implementar algo, abra a página oficial e confirme.

Regras do projeto, que valem para todo o documento: sem login nas lojas, sem burlar captcha, anti-bot ou
rate limit, só páginas e endpoints públicos, respeito aos termos de uso. **Nunca** testar cupons em massa,
gerar ou adivinhar códigos, nem aplicar cupom em checkout.

---

## 1. Por loja

### Mercado Livre

- **Página pública de cupons:** `https://www.mercadolivre.com.br/cupons`. O blog oficial diz que ela lista os
  cupons por categoria, com valor do desconto, categoria, valor mínimo, validade e quantidade disponível.
  Para **ativar** um cupom é preciso estar logado. Não foi confirmado se a lista aparece completa para quem
  não está logado. Existe também a página institucional `https://www.mercadolivre.com.br/l/selos-e-cupons`.
- **Cupom na página do produto:** o ML mostra cupons de vendedor ("cupom de R$ X") no anúncio. A visibilidade
  sem login **não foi confirmada** nesta pesquisa.
- **APIs oficiais:**
  - A API de **cupons do vendedor** (`seller-promotions/promotions`, tipos FIXED_PERCENTAGE e FIXED_AMOUNT,
    só no Brasil/MLB) existe, mas serve para o **vendedor criar** cupons, exige token OAuth do vendedor e
    **não** expõe cupons de terceiros. Não serve para o SetupSniper.
  - A busca pública `api.mercadolibre.com/sites/MLB/search` tem vários relatos de **erro 403** (no Reclame
    Aqui), inclusive com token válido. A documentação oficial de erro 403 lista causas genéricas (app
    bloqueado, escopo, IP). Não foi encontrada nenhuma comunicação oficial dizendo que a busca passou a
    exigir token. **Status atual: não confirmado. Não conte com ela.**
  - Nenhuma API oficial devolve "cupons ativos para este produto".
- **Programa de afiliados e encurtador:** Programa de Afiliados e Criadores do ML (gratuito, maiores de 18
  anos, conta ML e Mercado Pago, sem mínimo de seguidores, segundo blogs). O link curto é gerado no
  **Gerador de link** do painel ou na barra de afiliado da página do produto, com opção de link curto
  (`meli.la/...`) ou completo. Não há API pública oficial para gerar links. Existem serviços de terceiros
  que fazem isso, mas a política do ML para esse uso **não foi confirmada**.
- **Como resolver `meli.la`:** um `HEAD`/`GET` sem seguir redirects devolve o `Location` com a URL do produto.
  O código HTTP exato (301 ou 302) **não foi confirmado**. É um redirect público e não precisa de login.
  O SetupSniper deve seguir no máximo uns 5 saltos, sem cookies, e extrair o ID `MLB...` da URL final.
- **Cupons para assinantes Meli+:** são frequentes. Exemplos de 2026 em sites de cupom: 12% com teto de R$ 40
  acima de R$ 79 (código SOUMELIMAIS), e 15% com teto de R$ 50 acima de R$ 129. Esses cupons valem só para
  quem assina.

### Amazon (amazon.com.br)

- **Página pública de cupons:** a Amazon tem uma seção de cupons, segundo guias de terceiros, mas o endereço
  exato (`amazon.com.br/cupons` ou `/coupons`) **não foi confirmado**.
- **Cupom na página do produto:** confirmado por vários guias. Uma caixa "Aplicar cupom de X%" ou
  "R$ 20 OFF" aparece logo abaixo do preço, o comprador marca a caixa e o desconto entra no checkout.
  Também existem **códigos promocionais** digitados no checkout (os mais comuns nos grupos, ex.: R$ 150 OFF
  acima de R$ 999). Regra comum: um código promocional por pedido, mas isso **não foi confirmado**
  oficialmente. Já houve caso de cupons de afiliados que acumulavam (noticiado pelo Tecnoblog).
- **API oficial:** a **Product Advertising API 5.0** (PA-API). Segundo a própria documentação, ela seria
  descontinuada em **30/04/2026** (outra página da mesma documentação diz **15/05/2026**). A substituta é a
  **Creators API**, no Associates Central.
  - Gratuita: sim, para Associados.
  - Exige cadastro de afiliado: sim (Amazon Associados).
  - Vendas mínimas: a página oficial da Creators API (vista só pelo trecho indexado) fala em **10 vendas
    qualificadas nos últimos 30 dias**. A regra antiga da PA-API era de 3 vendas qualificadas em 180 dias.
    Se a Creators API cobre o Brasil **não foi confirmado**.
  - Devolve cupom? A OffersV2 traz preço e disponibilidade. Se ela inclui **códigos** promocionais
    **não foi confirmado**. Muito provavelmente não inclui os códigos de checkout que os grupos postam.
  - Termos: o Acordo Operacional dos Associados Brasil só permite mostrar preço se o dado vier de link
    da Amazon ou da API, com **cache de no máximo 24 h** e **data/hora junto ao preço** quando a atualização
    for menos frequente que a cada hora. Para uso pessoal sem vendas, a API fica **inacessível na prática**.
- **Afiliados e encurtador:** Amazon Associados. Links `amzn.to/xxxx`, gerados no SiteStripe ou no painel.
  São redirects públicos para `amazon.com.br/dp/<ASIN>?tag=...`. O SetupSniper deve ler o **ASIN** da URL
  final e descartar a `tag`.

### Shopee

- **Página pública de cupons:** cupons ficam na **Central de Cupons** e em "Cupons Diários" do app. Há relato
  (TecMundo) de que os cupons de frete grátis **funcionam só no app**. Se existe uma página web pública
  legível sem login **não foi confirmado**.
- **Cupom na página do produto:** a Shopee mostra "cupons da loja" no anúncio. Para resgatar é preciso
  login. A leitura sem login **não foi confirmada**.
- **API oficial:** **Shopee Affiliate Open API**, em GraphQL. O endpoint do Brasil é
  `https://open-api.affiliate.shopee.com.br/graphql` e o Explorer fica em
  `https://open-api.affiliate.shopee.com.br/explorer/v2`.
  - Consultas: `productOfferV2`, `shopOfferV2`, `conversionReport`, `validatedReport` e a mutation
    `generateShortLink`. A assinatura usa HMAC-SHA256 com App ID e Secret.
  - Gratuita: sim. Exige cadastro de afiliado aprovado e, depois, um **pedido de acesso à Open API** no
    painel. Vendas mínimas: nenhuma encontrada. Se `productOfferV2` devolve **códigos de cupom** **não foi
    confirmado**: os SDKs falam em preço, comissão e link, não em cupom.
  - Termos para uso pessoal: **não confirmados**. O programa é pensado para quem divulga.
- **Afiliados e encurtador:** cadastro em `affiliate.shopee.com.br`, com perfil público em rede social (18+,
  CPF, aprovação em 1 a 3 dias, segundo blogs). Formatos de link curto vistos: `shopee.ee/xxxx` (guia de
  terceiro) e `s.shopee.com.br/xxxx` (formato usado nos grupos). Qual é o atual **não foi confirmado**;
  o parser deve aceitar os dois. São redirects públicos para `shopee.com.br/...-i.<shopid>.<itemid>`.

### AliExpress

- **Página pública de cupons:** existe uma "central de cupons" no app e no site, onde o comprador **coleta**
  cupons antes de comprar. O endereço exato **não foi confirmado**.
- **Cupom na página do produto:** cupons da loja e da plataforma aparecem no anúncio. Coletar exige login.
- **Códigos promocionais:** são muito usados no Brasil, com valor fixo e mínimo (ex.: R$ 300 OFF acima de
  R$ 1.800, R$ 60 OFF na primeira compra acima de R$ 369). Vários sites de cupom dizem que dá para empilhar
  cupom da plataforma, cupom da loja e moedas. O número exato de descontos somáveis varia entre as fontes.
- **API oficial:** AliExpress Affiliate API, pelo portal `portals.aliexpress.com` e pela Open Platform.
  - A documentação (antiga) de `aliexpress.affiliate.product.query` diz que a API é **gratuita**. A resposta
    tem `promotion_link` e um campo `code_promotionurl`. **Não foi confirmado** que ela devolva códigos de cupom.
  - Exige cadastro no portal de afiliados com revisão dos canais de divulgação, e depois uma app key.
    Vendas mínimas: nenhuma encontrada. O processo da app key **não foi confirmado**.
  - Termos para uso pessoal: **não confirmados**.
- **Afiliados e encurtador:** links `a.aliexpress.com/_xxxx` (o formato usado nos grupos). O formato oficial
  **não foi confirmado** em documentação. São redirects públicos para `pt.aliexpress.com/item/<id>.html`
  ou `aliexpress.com/item/<id>.html`.

### Magalu

- **Página pública de cupons:** nenhuma página oficial apareceu na busca. Cupons do app aparecem numa área
  de cupons do app. **Não confirmado.**
- **Regras comuns:** cupons exclusivos do app, de primeira compra (verificados na conta), com valor mínimo
  e categoria. Em geral, só um cupom por compra.
- **API oficial:** nenhuma API para afiliados foi encontrada. Os links são gerados no app ou no portal do
  Parceiro Magalu.
- **Afiliados e encurtador:** **Parceiro Magalu** (divulgador com CPF, gratuito, comissão de 1% a 12% por
  categoria, segundo blogs). O portal oficial é `parceiromagalu.com.br`. Os links das vitrines usam
  `magazinevoce.com.br/<nome-do-parceiro>/...`. O domínio `divulgador.magalu.com` **não foi confirmado**
  em nenhuma fonte. O parser deve aceitar os dois.

### KaBuM!

- **Página pública de cupons:** `https://www.kabum.com.br/hotsite/cupons` (oficial). O comprador copia o código
  ali e cola no carrinho. Existem hotsites temáticos (ex.: `.../hotsite/cupons-ninja-vip/`).
- **Cupom na página do produto:** não foi confirmado se o cupom aparece no anúncio. O fluxo descrito é:
  hotsite de cupons, botão "Ver ofertas", produto, carrinho.
- **API oficial:** nenhuma encontrada.
- **Afiliados e encurtador:** programa oficial (`kabum.com.br/hotsite/afiliados`) operado pela **Awin**. Só
  pessoa física, 18+, e só cupons enviados pela Awin. Comissão listada: 2,30% em produtos da KaBuM e 1,15%
  no marketplace. Os grupos costumam usar links `tidd.ly/...` (encurtador da Awin, citado num resultado de
  busca) ou o link direto da KaBuM. O redirect leva a `kabum.com.br/produto/<id>/...`.

### Pichau

- **Página pública de cupons:** `https://www.pichau.com.br/cupons` e `https://www.pichau.com.br/promocao/cupons`
  (oficiais). A página diz: "Por pedido, só dá pra usar um cupom de desconto Pichau".
- **API oficial:** nenhuma encontrada.
- **Afiliados:** Pichau Creator Network (`afiliados.pichau.com.br`), com candidatura vinculada à conta e análise
  de 3 a 5 dias úteis. Nenhum encurtador próprio foi confirmado. Os links costumam ser do domínio
  `pichau.com.br` com parâmetro de afiliado.

### Terabyte (terabyteshop.com.br)

- **Página pública de cupons:** nenhuma página oficial foi encontrada. Os cupons circulam em sites de terceiros.
  **Não confirmado.**
- **API oficial:** nenhuma encontrada.
- **Afiliados:** Programa de Parceiros (`landing.terabyteshop.com.br/parceiros`, regras em
  `terabyteshop.com.br/site/regras-programa-de-parceiros`, atualizadas em 30/09/2025). A comissão só vale com
  link oficial que leve o **parâmetro `p=`** com o código do parceiro. O SetupSniper deve remover o `p=` ao
  normalizar a URL.

### TikTok Shop (se viável)

- No Brasil desde maio de 2025. O afiliado gera o link pelo botão "Compartilhar" na página do item. Para
  isso precisa ter 18+ e, segundo vários blogs, **1.000 seguidores** (o número varia por conta).
- **API para afiliados:** nenhuma documentação oficial foi encontrada para o Brasil. Formatos de link
  (`vt.tiktok.com/...`, `tiktok.com/view/product/...`): **não confirmados**.
- **Recomendação:** **não incluir por enquanto**. Não há fonte pública confiável de preço ou cupom sem login,
  e os produtos de hardware relevantes são raros. As fixtures também não incluem posts de TikTok Shop.

---

## 2. Agregadores e comunidades

| Site | API ou RSS público | O que os termos dizem | Recomendação |
|---|---|---|---|
| **Pelando** | Nenhuma API pública e nenhum RSS oficial encontrados | Os termos (`pelando.com.br/sobre/termos-de-uso`) exigem aceitar o Código de Conduta e permitem suspender quem faz "uso inadequado". Nenhuma cláusula sobre robôs foi encontrada nos trechos lidos. **Não confirmado** | **Não usar** de forma automática. Pode servir como link para o usuário abrir |
| **Promobit** | Nenhuma API pública e nenhum RSS encontrados. Um projeto no GitHub usa a API interna do site e avisa que ela "não é pública nem documentada" | Aceitar os termos é obrigatório. Violar os termos é tratado como violação de direito autoral. O FAQ só permite compartilhar promoções respeitando os termos | **Não usar** (API interna = REA num site de terceiro, fora das regras) |
| **Cuponomia** | Nenhuma API pública encontrada | Termos com data efetiva de 28/01/2026. Os trechos lidos falam de cashback. Nenhuma cláusula sobre robôs foi encontrada. **Não confirmado** | **Não usar** sem ler os termos completos |
| Méliuz, Cupom Online, Adoro Cupom e outros sites de cupom | Nenhuma API encontrada | O Adoro Cupom **proíbe** robôs, scripts e automação | **Não usar** |

Conclusão: nenhum agregador oferece uma via **documentada e permitida** para leitura automática. O
SetupSniper deve usar fontes **primárias**: página da loja, API oficial, post que o próprio usuário
encaminhou ao bot e canais públicos do Telegram que o usuário escolheu seguir.

---

## 3. Canais públicos do Telegram (`t.me/s/<canal>`)

- **Continua funcionando?** Relatos de outubro de 2026 dizem que sim. Uma issue no GitHub de 23/10/2026 diz
  que `t.me/s/<canal>` devolve **HTML renderizado no servidor** (testado em canais grandes). Um nome que não
  existe devolve **302** para `t.me/<nome>`. A paginação usa `?before=<id_do_post>`, com cerca de 20 posts por
  página. Não há fonte oficial do Telegram sobre isso.
- **Limitações relatadas:** canais com a prévia bloqueada (adultos, direitos autorais, políticos) não aparecem.
  A prévia mostra o estado **atual** (posts apagados somem e edições sobrescrevem). Não há comentários nem
  lista de membros. O HTML pode mudar sem aviso.
- **Termos:** os termos do Telegram sobre leitura automática da prévia **não foram confirmados**.
- **Cuidados para o SetupSniper:**
  1. Só canais **públicos** que o **usuário** escolher. Nada de varrer listas de canais.
  2. Intervalo educado (ex.: um canal a cada poucos minutos), `User-Agent` descritivo e respeito a 429/`Retry-After`.
  3. Guardar só o texto do post e a URL `t.me/<canal>/<id>`. Nada de nome, foto ou @ de pessoas.
  4. Teste automático do parser contra a fixture e um aviso claro quando o HTML mudar.
  5. Tratar todo cupom vindo de canal como **não verificado** (`status: 'unverified'`), com data em que foi visto.
  6. A alternativa sem raspagem é o usuário **encaminhar** o post ao bot do SetupSniper
     (`source: 'telegram_forward'`). É a fonte mais limpa.

---

## 4. Regras típicas de cupom por loja

| Regra | ML | Amazon | Shopee | AliExpress | Magalu | KaBuM | Pichau | Terabyte |
|---|---|---|---|---|---|---|---|---|
| % com teto ("15% até R$ 50") | Comum | Comum | Comum | Raro | Às vezes | Comum (categoria) | Às vezes | Às vezes |
| Valor fixo com mínimo ("R$ 50 OFF acima de R$ 300") | Comum | Comum | Comum | **Padrão** | Comum | Às vezes | Comum | Às vezes |
| Frete grátis | Às vezes | Prime | **Comum** (teto ~R$ 20, mínimo R$ 19–59) | Às vezes | Comum | Às vezes | Às vezes | n/c |
| Só Pix | Às vezes | Raro | Raro | Não | Às vezes | Comum | Comum | **Comum** (desconto Pix) |
| Só app | Às vezes | Às vezes | **Frete grátis: só app** | Às vezes | **Comum** | Comum | n/c | n/c |
| Primeira compra | Sim | Sim | Sim | Sim (ex.: R$ 60 acima de R$ 369) | Sim | Sim | n/c | n/c |
| Só assinantes | **Meli+** | Prime | Não | Não | Não | Ninja (hotsite "Ninja VIP") | Não | Não |
| Quantidade limitada / esgota | **Sim** (acaba por ativações) | Sim | Sim | Sim | Sim | Sim | Sim | Sim |
| Empilhamento | Em geral 1 por pedido | Em geral 1 código por pedido (já houve exceção) | Plataforma + loja + frete | Plataforma + loja + moedas | Em geral 1 | n/c | **1 por pedido** (oficial) | n/c |

"Comum" ou "às vezes" quer dizer o que aparece com frequência em sites de cupom e grupos, e **não** é regra
oficial. "n/c" = não confirmado. A única regra oficial confirmada nesta pesquisa é a da Pichau (um cupom por
pedido). Isso confirma o padrão do `src/discounts.js` (`stacking: 1`, que escolhe o maior desconto).

Formato das regras no gabarito das fixtures (`tests/fixtures/promo-posts.json`, campo `esperado.regras`):

| `tipo` | Campos | Exemplo no texto |
|---|---|---|
| `percent` | `valor` (%), `teto_centavos`, `minimo_centavos` | "10% OFF limitado a R$ 100" |
| `fixed` | `valor_centavos`, `minimo_centavos` | "R$ 50 OFF acima de R$ 300" |
| `shipping` | `minimo_centavos` | "frete grátis" |
| `pagamento` | `valor`: `pix` ou `card` | "só no Pix" |
| `condicao` | `valor`: `first_purchase`, `app_only`, `subscriber`, `limited_quantity` | "primeira compra", "só no app", "Meli+", "limitado" |

Campos que não aparecem no texto ficam `null`. Os valores de `condicao` são os mesmos de `conditions` em
`src/discounts.js`, mais `limited_quantity`.

---

## 5. Formato dos posts (origem das fixtures)

O padrão das fixtures saiu de **trechos públicos** de canais brasileiros de ofertas de hardware, vistos nos
resultados de busca (prévias `t.me/s/...` e o TGStat). Os nomes dos canais não são citados de propósito.
Elementos observados:

- Nome do produto na primeira linha, às vezes com emoji (🔥, 🚨) antes.
- Preço como `R$ 2279`, `R$ 414`, `R$ 3.699`, com emojis (✅, 😱) e às vezes "no Pix".
- Cupom marcado com `Cupom:`, `🏷`, `🎟️` e variações de caixa.
- Condição de assinante: "Ou R$ 3.699 com cupom para meli+".
- Link curto de afiliado no fim (`meli.la`, `amzn.to`, `tidd.ly`).
- Posts de cupom avulso (sem produto), ex.: "cupom de R$ 150 OFF acima de R$ 999" na Amazon, "10% em placas
  de vídeo" na KaBuM.

Os **24 posts das fixtures são sintéticos**: os textos, códigos e links foram inventados para os testes e
não correspondem a ofertas reais. Os produtos são modelos existentes, mas os preços são ilustrativos. Os
links são fictícios. O arquivo é só o array (sem campo de metadados), conforme pedido. Este parágrafo é o
registro de que os posts são sintéticos.

---

## 6. Tabela de decisão

| Loja | Melhor fonte gratuita e confiável | Taxa de acerto esperada do cupom | Precisa de REA? |
|---|---|---|---|
| **Mercado Livre** | Post encaminhado/canal público + página do produto (preço). Página `/cupons` para cupons gerais | **Média**: os grupos postam muitos cupons de ML. O código vem do post, mas regras (Meli+, itens participantes, esgotar) não são verificáveis sem login | **Sim**, para preço e cupom de vendedor no anúncio, porque a busca da API pública dá 403 |
| **Amazon** | Post encaminhado/canal + página do produto (caixa "Aplicar cupom") | **Média**: o cupom de caixa aparece na página, mas o código de checkout só vem de posts. A API exige 10 vendas em 30 dias | **Sim** (API inacessível para uso pessoal) |
| **Shopee** | Shopee Affiliate Open API (se aprovada) para preço e link + posts para códigos | **Baixa**: cupons ficam no app e com login. A API não confirma cupom | Sim, se a API não for aprovada. Com a API, não para preço |
| **AliExpress** | Affiliate API (gratuita, com cadastro) para preço + posts para códigos | **Média**: os códigos são públicos e de valor fixo com mínimo, fáceis de aplicar no cálculo | Não, se a API for aprovada. Sim, caso contrário |
| **Magalu** | Posts + página do produto | **Baixa**: muitos cupons só no app ou de primeira compra. Não há página oficial de cupons | Sim |
| **KaBuM!** | Hotsite oficial `kabum.com.br/hotsite/cupons` + posts | **Alta**: página oficial pública com código e regras | Não para cupom (é página pública). Talvez para preço |
| **Pichau** | Página oficial `pichau.com.br/cupons` + posts | **Alta**: página oficial pública, regra de 1 cupom por pedido confirmada | Não para cupom |
| **Terabyte** | Posts (não há página oficial de cupons) | **Baixa**: só fontes de terceiros. O desconto do Pix já aparece no preço | Não para cupom (não há o que mapear). Talvez para preço |
| TikTok Shop | Nenhuma | Baixa | Fora por enquanto |

Justificativa geral: o **código** do cupom quase sempre vem do post (do grupo ou do usuário). O papel do
SetupSniper é (1) extrair código, regra e preço anunciado do post, (2) conferir o preço base na página
pública do produto e (3) recalcular o preço final com `src/discounts.js`, mostrando o cupom como **não
verificado** até o usuário confirmar. Isso é exatamente o "preço calculado" dos grupos, sem tocar no checkout.

---

## 7. Cupons das redes de afiliados (retirados)

Na versão 3.0 o SetupSniper chegou a ler cupons pela Awin e pela Lomadee. A partir da 3.1.0, **os cupons vêm só dos canais e grupos do Telegram** (e dos cadastrados à mão): eles aparecem como "divulgado por @canal em data, não verificado", e o SetupSniper continua sem testar, gerar ou aplicar cupons. As credenciais da Awin e da Lomadee seguem servindo só para a **busca de produtos** (`docs/fontes-oficiais.md`).

## 8. O que não foi possível confirmar

- Se a busca pública da API do Mercado Livre (`/sites/MLB/search`) exige token hoje (há relatos de 403).
- O código HTTP e o comportamento exato dos redirects de `meli.la`, `amzn.to`, `s.shopee.com.br`/`shopee.ee`,
  `a.aliexpress.com`, `tidd.ly` e dos links do Magalu (nenhum pôde ser testado, por causa da rede bloqueada).
- O domínio `divulgador.magalu.com`.
- A URL oficial da página de cupons da Amazon, Shopee, AliExpress, Magalu e Terabyte.
- Se a Creators API da Amazon atende o Brasil, a regra exata de vendas mínimas e se a PA-API 5.0 já foi desligada.
- Se as APIs de afiliados da Shopee ou do AliExpress devolvem **códigos** de cupom e se os termos permitem uso pessoal
  (em 04/11/2026 continua sem confirmação; veja a seção 7).
- Termos completos de Pelando, Promobit, Cuponomia e Telegram sobre leitura automatizada.
- Formatos de link e API de afiliados da TikTok Shop no Brasil.
- Todas as regras marcadas como "comum" ou "às vezes" na seção 4, exceto o "1 cupom por pedido" da Pichau.

---

## Fontes

Todas acessadas em **03/11/2026**. "Busca" = conteúdo visto só no trecho indexado do buscador (a página não
pôde ser aberta, porque a rede estava bloqueada). "Aberta" = página lida diretamente.

**Mercado Livre**
- https://developers.mercadolivre.com.br/pt_br/cupons-do-vendedor (busca)
- https://developers.mercadolibre.com.mx/en_us/seller-coupon (busca)
- https://developers.mercadolivre.com.br/pt_br/erro-403 (busca)
- https://www.reclameaqui.com.br/mercado-livre/erro-403-forbidden-ao-acessar-endpoint-sitesmlbsearch-da-api-do-mercado-livre_4HqcUyVoCdJmt4Lv/ (busca)
- https://www.reclameaqui.com.br/mercado-livre/erro-403-forbidden-no-endpoint-de-busca-publica-de-anuncios-da-api-do-mercado-livre_kl_Q1h2_x_sPnREJ/ (busca)
- https://www.mercadolivre.com.br/blog/milhares-de-cupons-para-voce-economizar-no-mercado-livre (busca)
- https://www.mercadolivre.com.br/l/selos-e-cupons (busca)
- https://www.mercadolivre.com.br/l/afiliados-primeiros-passos (busca)
- https://www.mercadolivre.com.br/l/boas-praticas-links (busca)
- https://canaltech.com.br/apps/cupom-mercado-livre-como-conseguir-e-onde-usar-codigos-de-desconto/ (busca)
- https://hunterhub.com.br/blog/programa-de-afiliados-mercado-livre-como-funciona-comissao-afiliados-ml/ (busca)
- https://rallydevendas.com.br/blog/afiliado-mercado-livre-requisitos (busca)
- https://botdoafiliado.com/blog/api-de-afiliados-do-mercado-livre/ (busca)
- https://www.melhorescartoes.com.br/cupom-mercado-livre-12h-05ago26.html (busca)
- https://www.mktesportivo.com/2026/06/cupom-mercado-livre-meli-05-06-um-codigo-de-12-exclusivo-para-assinantes/ (busca)

**Amazon**
- https://affiliate-program.amazon.com/creatorsapi/docs (busca; abertura falhou)
- https://webservices.amazon.com/paapi5/documentation/ (busca; abertura falhou)
- https://webservices.amazon.com/paapi5/documentation/offersV2.html (busca)
- https://wordpress.org/support/topic/pa-api-deprecation-by-jan-31-2026/ (busca)
- https://www.keywordrush.com/blog/amazon-pa-api-associatenoteligible-error-is-there-a-new-10-sales-rule/ (busca)
- https://associados.amazon.com.br/help/operating/policies/ (busca)
- https://associados.amazon.com.br/help/operating/agreement (busca)
- https://www.connectweek.com.br/artigo/amazon-associados-e-afiliados-do-mercado-livre-como-funcionam (busca)
- https://www.cupomonline.com.br/como-usar-cupom-amazon-brasil/ (busca)
- https://tecnoblog.net/noticias/amazon-brasil-deu-ate-r-800-de-desconto-em-livros-com-cupons-que-acumulavam/ (busca)

**Shopee**
- https://open-api.affiliate.shopee.com.br/explorer/v2 (busca)
- https://www.nuget.org/packages/Shopee.Affiliate (busca)
- https://github.com/fernandolisboa/mascate/issues/12 (busca)
- https://canaltech.com.br/apps/como-gerar-link-de-afiliado-na-shopee-guia-pratico/ (busca)
- https://www.divulganinja.com.br/blog/como-criar-link-de-afiliado-shopee (busca)
- https://www.tecmundo.com.br/internet/233969-cupom-shopee-veja-onde-encontrar-utilizar-conta.htm (busca)
- https://catracalivre.com.br/economize/cupom-de-desconto-shopee/ (busca)
- https://tecnoblog.net/477797/exclusivo-shopee-lanca-programa-de-afiliados-no-brasil-com-comissoes-de-ate-14/ (busca)

**AliExpress**
- https://developer.alibaba.com/docs/api.htm?apiId=45803 (busca)
- https://portals.aliexpress.com/ (busca)
- https://ecommercenapratica.com/blog/afiliados-aliexpress/ (busca)
- https://www.cupomonline.com.br/ofertas/cupom-aliexpress-11-11-affnov06-r300-off-em-compras-a-partir-de-r1-800/ (busca)
- https://www.melhorescartoes.com.br/cupom-aliexpress-ate-545-desconto-17ago26.html (busca)

**Magalu**
- https://www.bagy.com.br/blog/parceiro-magalu/ (busca)
- https://www.divulganinja.com.br/blog/como-compartilhar-link-de-afiliado-magalu-2026/ (busca)
- https://www.siteconfiavel.com.br/site/magazinevocê-com-br (busca)
- https://canaltech.com.br/apps/como-usar-cupom-de-desconto-no-superapp-magalu/ (busca)
- https://www.tecmundo.com.br/guia-de-compras/408335-cupom-magalu.htm (busca)

**Redes de afiliados (abertas em 04/11/2026)**
- https://help.awin.com/apidocs/promotions (aberta)
- https://docs.lomadee.com.br/api-reference/affiliate/campaigns/all (aberta)
- https://docs.lomadee.com.br/api-reference/api-keys (aberta)
- https://docs.lomadee.com.br/api-reference/changelog (aberta)
- https://docs.lomadee.com.br/docs/partner-api/guides/list-offers-and-coupons (aberta)
- https://open-api.affiliate.shopee.com.br/explorer/v2 (aberta; o esquema exige login)

**KaBuM!, Pichau, Terabyte**
- https://www.kabum.com.br/hotsite/cupons (busca)
- https://www.kabum.com.br/hotsite/cupons-ninja-vip/ (busca)
- https://www.kabum.com.br/hotsite/afiliados/ (busca)
- https://ui.awin.com/merchant-profile/17729 (busca)
- https://www.pichau.com.br/cupons (busca)
- https://www.pichau.com.br/promocao/cupons (busca)
- https://afiliados.pichau.com.br/ (busca)
- https://www.terabyteshop.com.br/site/regras-programa-de-parceiros (busca)
- https://www.lomadee.com.br/en/brands/terabyte (busca)

**TikTok Shop**
- https://exame.com/tecnologia/examelab/tiktok-shop-no-brasil-os-nichos-mais-lucrativos-e-as-novas-taxas-de-comissao/ (busca)
- https://gameoverdrive.com.br/como-ser-afiliado-tiktok-shop/ (busca)
- https://tiktokshopblog.com.br/post/tiktok-shop-afiliados-mil-seguidores-brasil (busca)

**Agregadores**
- https://www.pelando.com.br/sobre/termos-de-uso (busca; abertura de `/termos-de-uso` falhou)
- https://www.promobit.com.br/institucional/termos/ (busca; abertura falhou)
- https://promobit.com.br/index/faq (busca)
- https://github.com/goul4rt/sistema-de-achadinhos (busca)
- https://www.cuponomia.com.br/termos-uso (busca)
- https://adorocupom.com/termos-de-uso (busca)

**Telegram e formato dos posts**
- https://github.com/zedxter/skills/issues/6 (aberta)
- https://github.com/AtelierSuite/Reader/issues/394 (busca)
- https://dev.to/yuhehe/how-to-see-full-telegram-channel-history-without-login-the-before-trick-4lna (busca)
- https://tgstat.com/channel/@ofertasdecomputador (busca; usada só para o formato)
- Prévias públicas `t.me/s/...` de canais de ofertas de hardware (busca; nomes omitidos de propósito; abertura de `t.me` falhou)
