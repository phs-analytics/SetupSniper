# Contexto para a próxima sessão do Claude Code: SetupSniper

> Situação em 04/11/2026: versão **2.7.0**, último commit `be9b0d5` na `main`.
> Leia este arquivo inteiro antes de mexer no projeto.

## O projeto

O **SetupSniper** caça preços de hardware em Node.js, com **zero dependências**. Ele busca em várias lojas, fixa produtos com meta de preço, manda alertas e recebe posts de cupons pelo Telegram, e mostra **Total Pix** e **Total Crédito**, já com cupom, frete e imposto de importação.

- **Repositório:** https://github.com/phs-analytics/SetupSniper (público)
- **Branch:** `main`. Os commits vão direto nela, como nas versões anteriores.
- **Lojas no escopo:** KaBuM!, Pichau, Terabyte, Amazon, Mercado Livre, Magalu, Shopee e AliExpress.
  - Buscapé e Zoom estão desligados (`enabled: false`), mas o código deles continua.
  - A TikTok Shop está cadastrada, desligada e sem adaptador.

## Regras do dono do projeto (obrigatórias)

1. **Commits no nome dele, não no do Claude:**
   - Autor: `Pedro Henrique Santos <336734781+phs-analytics@users.noreply.github.com>`.
   - **Sem** linha `Co-Authored-By` e sem link de sessão do Claude.
   - Confira com `git config user.name` e `git config user.email` antes de commitar.
2. **Segurança acima de tudo:** nenhum dado pessoal ou chave vai para o GitHub.
   - Rode `npm run check` antes de cada commit.
   - Adicione os arquivos ao commit **um por um**, nunca com `git add -A`.
3. **Privacidade:** o CEP e o perfil ficam só em `data/` (no `.gitignore`) e nunca aparecem em logs nem no Telegram.
4. **Nada de login e nada de burlar proteção** (captcha, anti-bot, assinaturas). Só páginas públicas.
5. **Cupons:**
   - Nunca testar código por força bruta, gerar código ou aplicar cupom sozinho na loja.
   - Cupom não verificado aparece como "divulgado por X em data, não verificado".
6. **Regras que mudam** (impostos, cupons, notas) ficam em JSON, com **fonte e data**. Nada de alíquota escrita no código.
7. **Dinheiro sempre em centavos inteiros.**
8. **Testes primeiro**, com fixtures e sem rede. Faça commits pequenos, um por fase.
9. **Linguagem do score:** use "sinais de risco" e nunca "fraudador".
10. **Na dúvida, pergunte.** Não faça force push nem abra PR sem pedido explícito.
11. **Não mexer no projeto HELIOS.**
12. **Textos para o usuário:** em português claro.

## Comandos

```bash
npm start      # servidor em http://localhost:3000 (precisa de .env com SENHA)
npm run demo   # interface com preços simulados, sem rede
npm test       # node --test, hoje 113 testes passando
npm run check  # sintaxe + arquivos pessoais + segredos (rode antes de commitar)
```

Variáveis úteis:
- `PORT=0`: porta livre (os testes usam isso).
- `DATA_DIR=<pasta>`: dados do usuário em outra pasta.
- `SENHA`, `TELEGRAM_TOKEN`: ficam no `.env`.

## Mapa do código

| Arquivo | Para quê |
|---|---|
| `server.js` | servidor HTTP, SSE (`/api/search`, `/api/stream`), monitor, alertas, API e integração de tudo |
| `src/scope.js` | `activeStoreIds()`: lojas ativas, pelo `enabled` ou pelo `settings.enabledStores` |
| `src/offer.js` | **schema único de oferta** (`normalizeOffer`), `parseBRL`, `toCents`, `formatBRL`, `canonicalUrl` |
| `src/stores.js` | adaptadores de busca por loja (`ADAPTERS`) |
| `src/extract.js` | classifica preços pelo nome do campo (Pix, cartão, parcela) e pelo texto; `cleanResults`; `flagOutliers` |
| `src/scraper.js` | leitura da página de produto (link fixado) |
| `src/monitor.js` | `storeState()`: estado explícito de cada loja nos Fixados (`ok`, `error`, `no_results`, `price_not_found`, `out_of_range`, `unavailable`...) |
| `src/discounts.js` | regras de cupom, inferência pela diferença de preço, empilhamento (1 cupom por pedido) |
| `src/promo-parser.js` | lê posts de promoção (produto, preços, cupons, regras, links) |
| `src/link-resolver.js` | segue links encurtados de afiliado até a loja, só por domínios permitidos |
| `src/import-tax.js` | II e ICMS (Amazon, AliExpress e Shopee); `ufFromCep` |
| `src/final-price.js` | `finalTotals()`: Total Pix e Total Crédito, com detalhamento e parcelas |
| `src/reliability.js` | nota da **loja** (Reclame Aqui, avaliação, vendas, reviews) |
| `src/seller-score.js` | nota **final por oferta**: plataforma 25%, vendedor 55% e oferta 20%; travas, confiança e motivos |
| `src/telegram.js`, `src/telegram-channels.js` | bot (comandos, posts encaminhados, botões inline) e leitura opt-in de canais `t.me/s` |
| `src/ptax.js` | cotação PTAX do Banco Central (opcional) |
| `public/` | interface: `app.js`, `index.html`, `styles.css`; abas Busca, Fixados, Alertas, Lojas e Cupons |

Configuração versionada em `data/`:
- `stores.json`
- `taxes.json`
- `cep-uf.json`
- `coupon-rules.json`
- `seller-score.json`
- `*.example.json`

Dados do usuário (no `.gitignore`):
- `settings.json`
- `watchlist.json`
- `history.json`
- `alerts.json`
- `coupons.json`
- `channels-state.json`

Documentação em `docs/`:
- `como-funciona.md` (tem a seção **"O que ainda não foi conferido"**)
- `cupons.md`
- `impostos-importacao.md`
- `score-vendedor.md`
- `tiktok-shop.md`
- `telegram.md`
- `adicionar-loja.md`
- `faq.md`

Histórico das versões em `CHANGELOG.md`.

## Decisões já tomadas (não reabrir)

- **Referência de preço:** Pix. A ordenação, as metas, os alertas e os Fixados usam o **total final** em Pix.
- **Cupons:** 1 cupom por pedido. "Ver na loja" abre a URL canônica, sem parâmetros de afiliado.
- **Importados:** mostram "informe a cotação" até haver cotação, manual ou PTAX.
- **Imposto de importação:** só para `importTaxStores` (amazon, aliexpress, shopee). Regras de 03/11/2026:
  - Remessa Conforme até US$ 50: II 0% desde 12/05/2026 (Lei 15.502/2026).
  - De US$ 50,01 a US$ 3.000: 60% − US$ 30.
  - Fora do programa: 60%.
  - O ICMS é cobrado "por dentro".
- **TikTok Shop:** desligada. Só pensar em suportar link encaminhado depois de testar com a rede liberada (ver `docs/tiktok-shop.md`).

## Pendências e próximos passos

1. **Conferir ao vivo as 8 lojas.** Até agora só foram testadas com fixtures, porque a rede da sessão anterior bloqueava os sites.
   - Rode `npm start`, busque "rtx 4060" e confira loja a loja.
   - Onde aparecer "Preço não encontrado nesta página": salve o HTML em `tests/fixtures/`, escreva o teste e ajuste o adaptador.
2. **Ler mais dados do vendedor** (idade da loja, vendas, avaliações) e preencher `offer.sellerInfo`. Hoje a maioria das ofertas de marketplace fica limitada a "Regular" por falta de dado.
3. **`data/taxes.json`:** confirmar a regra `prc_pf_50_3000` e o ICMS das UFs com `"verificar": true`.
4. **`data/stores.json`:** conferir os números do Reclame Aqui, que hoje são estimativas.
5. **Testar com dados reais:** links encurtados com posts reais, canais `t.me/s` e PTAX.
6. **Perguntar ao dono antes de fazer:**
   - **PR do projeto Solis:** a branch `docs/conformidade-legal` existe, mas o PR não foi aberto.
   - **Commits antigos "Unverified":** só somem com force push, que o dono **não** autorizou.

## Checagem legal (processo do `Claude_Leis.md`)

Antes de publicar algo novo, faça uma triagem com o acervo de leis `ctresb/leis`.

- **Nunca clone o acervo inteiro:** ele tem cerca de 7 GB e encheu o disco uma vez.
- Faça um sparse checkout só das leis necessárias, numa pasta **fora** de qualquer projeto, e apague a pasta ao terminar:

  ```bash
  rm -rf /tmp/leis && \
  git clone -q --depth 1 --filter=blob:none --no-checkout https://github.com/ctresb/leis /tmp/leis && \
  git -C /tmp/leis sparse-checkout set --no-cone /federal/leis-ordinarias/2018/lei-13709-2018-08-14.md && \
  git -C /tmp/leis checkout -q
  ```

- **Normas que já se aplicam ao SetupSniper:**
  - LGPD, art. 4º, I (uso pessoal);
  - CDC, art. 37 (publicidade enganosa);
  - Código Penal, art. 139 (difamação);
  - Código Civil, arts. 52 e 187;
  - os termos de uso das lojas.
- **Como entregar a triagem:** um relatório com tabela (norma · onde aparece no projeto · risco · como reduzir).
  - Não altere repositórios sem pedido.
  - Termine sempre com: "Esta é uma triagem automatizada, não um parecer jurídico."
- O `Claude_Leis.md` **não** fica em repositório do GitHub, a pedido do dono.

## Armadilhas conhecidas

- **Servidor demo:** não use `pkill`/`pgrep -f server.js`, porque eles derrubam o próprio shell. Para achar o processo, use:

  ```bash
  ps -eo pid,args | awk '$2 ~ /node$/ && /server.js/'
  ```

- **Testes de integração:** use `tests/helpers/server.js` (`startDemoServer`, com `PORT=0`). Porta fixa dá colisão quando os arquivos de teste rodam em paralelo.
- **Comandos encadeados:** use `&&` e não `;`, senão um commit sai mesmo com teste falhando.
- **Lojas com dados `null`:** `reliability.js` já aceita `rating` ou `reclameAqui` `null` (caso da TikTok Shop). Mantenha assim.
- **Rede bloqueada:** se a rede da sessão bloquear as lojas, pesquise na web e marque tudo o que não foi conferido como **[não verificado]**.
