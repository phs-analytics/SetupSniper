# SetupSniper: contexto para a próxima sessão do Claude Code

> Situação em 04/11/2026: versão **2.7.0** na branch `main`, com 113 testes passando.
> Este arquivo trata **só do SetupSniper**. Leia inteiro antes de mexer no projeto.

---

## 1. O que é

O **SetupSniper** é um caçador de preços de hardware para quem monta PC no Brasil. É um projeto pessoal, sem fins comerciais, feito em **Node.js puro, sem nenhuma dependência** (não tem `npm install`).

O que ele faz:
- **Busca:** digite um produto e os resultados de cada loja aparecem conforme ela responde (streaming via SSE). A busca profunda lê mais páginas e pode usar um navegador headless no PC.
- **Lojas:** KaBuM!, Pichau, Terabyte, Amazon, Mercado Livre, Magalu, Shopee e AliExpress.
- **Total Pix e Total Crédito:** cada oferta mostra os dois totais finais, com cupom, frete e, nos importados, imposto de importação e ICMS da UF do usuário.
- **Cupons:** o usuário encaminha ao bot do Telegram um post de promoção. O bot resolve o link, lê o preço na loja, salva o cupom e recalcula os totais. Também lê canais públicos do Telegram, se o usuário ativar.
- **Nota de confiança por oferta:** junta a loja, os sinais de risco do vendedor e a própria oferta, com motivos e nível de confiança.
- **Filtro de lixo:** descarta acessórios e marca como "suspeito" o preço bom demais para ser verdade.
- **Fixados:** produtos acompanhados com meta de preço. Guarda histórico, mostra um estado explícito por loja e avisa no Telegram.
- **Servidor no celular:** scripts para Android/Termux, com vigia que religa tudo, boot automático e acesso por Tailscale.
- **Nuvem de arquivos:** opcional, pelo navegador ou WebDAV.

Interface web em `public/`, com estilo zine/colagem e as abas Busca, Fixados, Alertas, Lojas e Cupons.

## 2. Onde está

- **GitHub:** https://github.com/phs-analytics/SetupSniper (público), dono `phs-analytics`.
- **Branch:** `main`. Os commits vão direto nela.
- **Licença:** MIT.
- **Arquivos de comunidade:** README, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY e CI no GitHub Actions.
- **Na sessão anterior,** o clone de trabalho ficava em `/home/user/SetupSniper`. Numa sessão nova, clone de novo:

```bash
git clone https://github.com/phs-analytics/SetupSniper.git && cd SetupSniper
npm test        # 113 testes, sem rede
npm run demo    # interface com preços simulados → http://localhost:3000
npm start       # servidor de verdade (precisa de .env com SENHA; veja .env.example)
npm run check   # sintaxe + arquivos pessoais + segredos (rode antes de todo commit)
```

Variáveis úteis:
- `PORT=0`: porta livre.
- `DATA_DIR=<pasta>`: dados do usuário em outra pasta.
- `SENHA`, `TELEGRAM_TOKEN`, `INTERVAL_MIN`: ficam no `.env`.

## 3. Regras do dono (obrigatórias)

1. **Commits no nome dele, não no do Claude:**
   - Autor: `Pedro Henrique Santos <336734781+phs-analytics@users.noreply.github.com>`.
   - **Sem** `Co-Authored-By` e sem link de sessão do Claude.
   - Confira com `git config user.name` e `git config user.email`.
2. **Nada de dado pessoal ou chave no GitHub.**
   - Rode `npm run check` antes de cada commit.
   - Adicione os arquivos ao commit **um por um**, nunca com `git add -A`.
3. **Privacidade:** o CEP, o perfil, o token e o chat id ficam só em `data/` (no `.gitignore`). Nunca aparecem em logs nem nas mensagens do Telegram.
4. **Sem login e sem burlar proteção** (captcha, anti-bot, assinaturas, proxy residencial). Só páginas públicas.
5. **Cupons:**
   - Nunca testar código por força bruta, gerar código ou aplicar cupom sozinho na loja.
   - Cupom não verificado aparece como "divulgado por X em data, não verificado".
6. **Regras que mudam** (impostos, cupons, pesos da nota) ficam em JSON, com **fonte e data**.
7. **Dinheiro sempre em centavos inteiros.**
8. **Testes primeiro**, com fixtures e sem rede. Faça commits pequenos, um por etapa.
9. **Linguagem da nota:** use "sinais de risco" e nunca "fraudador". Estimativa sempre aparece como estimativa.
10. **Na dúvida, pergunte.** Não faça force push nem abra PR sem pedido explícito.
11. **Textos para o usuário:** em português claro.

## 4. Mapa do código

| Arquivo | Para quê |
|---|---|
| `server.js` | servidor HTTP e SSE, busca, monitor dos Fixados, alertas, API, bot e migração dos dados |
| `src/scope.js` | `activeStoreIds()`: lojas ativas pelo `enabled` do `stores.json` ou pelo `settings.enabledStores` |
| `src/offer.js` | **schema único de oferta** (`normalizeOffer`), `parseBRL`, `toCents`, `formatBRL`, `canonicalUrl` |
| `src/stores.js` | adaptadores de busca por loja (`ADAPTERS`) |
| `src/extract.js` | classifica preços pelo nome do campo e pelo texto (Pix, cartão, parcela, preço "de"); `cleanResults`; `flagOutliers` |
| `src/scraper.js` | leitura da página de produto (link fixado) |
| `src/browser.js`, `src/http.js` | navegador headless opcional e cliente HTTP |
| `src/monitor.js` | `storeState()`: estado por loja nos Fixados (`ok`, `error`, `no_results`, `no_match`, `price_not_found`, `out_of_range`, `unavailable`) |
| `src/discounts.js` | regras de cupom, inferência pela diferença de preço, empilhamento |
| `src/promo-parser.js` | lê posts de promoção (produto, preços, cupons, regras, links, loja) |
| `src/link-resolver.js` | segue links encurtados de afiliado até a loja, só por domínios permitidos |
| `src/import-tax.js` | II e ICMS; `ufFromCep` (local, por `data/cep-uf.json`) |
| `src/final-price.js` | `finalTotals()`: Total Pix e Total Crédito, com detalhamento, parcelas e juros |
| `src/reliability.js` | nota da **loja**: Reclame Aqui 40%, avaliação 25%, vendas 20%, reviews 15% |
| `src/seller-score.js` | nota **final por oferta**, em `offer.trust` |
| `src/reclameaqui.js` | atualização diária do Reclame Aqui (melhor esforço) |
| `src/telegram.js`, `src/telegram-channels.js` | bot (comandos, posts encaminhados, botões inline) e leitura opt-in de canais `t.me/s` |
| `src/ptax.js` | cotação PTAX do Banco Central (opcional) |
| `src/update.js` | atualização pelo Telegram |
| `public/` | interface: `app.js`, `index.html`, `styles.css` |
| `scripts/` | `check.js`, mais os scripts do Termux (`instalar-termux.sh`, `iniciar.sh`, `ligar.sh`, `vigia.sh`, `atualizar.sh`, `nuvem.sh`) |
| `tests/` | `node:test`; fixtures em `tests/fixtures/`; `tests/helpers/server.js` sobe o demo com `PORT=0` |

**Configuração versionada em `data/`:**
- `stores.json`: lojas, `enabled` e indicadores estimados.
- `taxes.json`: impostos, com fontes.
- `cep-uf.json`
- `coupon-rules.json`
- `seller-score.json`
- `coupons.example.json`
- `watchlist.example.json`

**Dados do usuário, no `.gitignore`:**
- `.env`
- `data/settings.json`
- `data/watchlist.json`
- `data/history.json`
- `data/alerts.json`
- `data/coupons.json`
- `data/channels-state.json`
- `logs/`

**Documentação em `docs/`:**
- `como-funciona.md`: tem a seção "O que ainda não foi conferido".
- `cupons.md`
- `impostos-importacao.md`
- `score-vendedor.md`
- `tiktok-shop.md`
- `telegram.md`
- `instalacao.md`
- `celular-servidor.md`
- `nuvem.md`
- `adicionar-loja.md`
- `faq.md`

## 5. Atualizações feitas (histórico)

### 1.0.0: versão inicial
Comparava três produtos fixos e calculava um score de confiabilidade.

### 2.0.0: a base atual
- Busca livre em streaming nas 8 lojas.
- Busca profunda, com os comparadores Buscapé e Zoom e navegador headless opcional.
- Fixar produtos, com meta, histórico e alertas por produto.
- Bot do Telegram: `/fixados`, `/fixar`, `/desafixar`, `/buscar`, `/status` e `/atualizar`.
- Botão "Ver na loja" com link direto para o produto.
- Visual zine/colagem e nuvem de arquivos pessoal.
- Scripts para rodar 24h no Android (Termux).
- Testes automáticos, `npm run check` e CI.
- Correções: preço sem centavos ("R$ 1.234") e dados embutidos pequenos.

### 2.1.0 e 2.1.1: servidor sempre ativo no celular
- `scripts/vigia.sh` religa tudo a cada 15 min.
- Guia por marca de celular.
- `scripts/ligar.sh` liga tudo com um comando e mostra o status; o boot grava `logs/boot.log`.
- Os scripts passaram a ser chamados com `sh`.
- Corrigido o código de barras decorativo, que gerava barras de largura negativa.

### 2.2.0: nota sem cara de certificação
- O carimbo passou a dizer "confiável", "bom", "regular" ou "cautela", em vez de "certificado".
- As notas estimadas aparecem como "(est.)".
- Avisos legais e de uso pessoal no README e nos guias.

### 2.3.0: Fase 0, escopo de lojas
- Só as 8 lojas ficam ativas.
- Buscapé e Zoom foram desligados por configuração; o código continua.
- Criados `src/scope.js` e `DATA_DIR`.
- Criado `data/taxes.json`, com `importTaxStores` (Amazon, AliExpress e Shopee).

### 2.4.0: Fase 1, preços que sumiam
**Bug:** "Não disponível" em todas as lojas depois da primeira.

**Causa:**
- O extrator pegava o **menor** valor da página, muitas vezes uma parcela.
- Nos Fixados, a faixa automática criada a partir da primeira loja descartava as outras **sem salvar nenhum estado**.

**Correção:**
- Schema único de oferta em centavos (`src/offer.js`).
- Preços classificados por campo e por contexto.
- Estado explícito por loja (`src/monitor.js`).
- Migração automática dos dados antigos de reais para centavos (`schemaVersion` 2).
- Preço de referência configurável, com Pix como padrão.

### 2.5.0: Fases 2 e 3, cupons e total final
**Cupons:**
- Pesquisa das fontes de cupom por loja (`docs/cupons.md`).
- Parser de posts, testado com 24 posts de exemplo e com o post real.
- Resolvedor de links encurtados e regras de desconto: percentual com teto, valor fixo com mínimo, frete, forma de pagamento, primeira compra e assinantes.
- No bot:
  - recebe posts encaminhados;
  - tem os botões 📌 Fixar, ✅ Funcionou e ❌ Não funcionou;
  - tem o comando `/cupons`.
- Aba Cupons, com cadastro manual.
- Leitura opt-in de canais `t.me/s`, a cada 6 h.

**Total final:**
- Total Pix e Total Crédito, com cupom, frete, II e ICMS ("por dentro"), parcelas e juros.
- UF descoberta pelo CEP, sem API externa.
- Cotação do dólar manual ou PTAX.
- A ordenação, as metas e os alertas usam o **total final em Pix**.

### 2.6.0: Fase 4, nota por vendedor com sinais de risco
**Cálculo:**
- `src/seller-score.js`: nota bruta = 0,25 × Plataforma + 0,55 × Vendedor + 0,20 × Oferta.
- Travas:
  - risco alto ou CNPJ não ativo: no máximo 39 ("Alto risco");
  - risco moderado: no máximo 54 ("Cautela");
  - pouca confiança nos dados: no máximo 69 ("Regular").
- Usa média bayesiana, limite de Wilson, rajadas de avaliações e textos repetidos (Jaccard de trigramas).
- Pesos em `data/seller-score.json`; estudo completo em `docs/score-vendedor.md`.

**Resultados:**
- O caso real do vendedor suspeito sai **Alto risco** no AliExpress, na Shopee e no Mercado Livre.
- Um vendedor estabelecido sai bem avaliado.

**Onde a nota aparece:** cada oferta traz `trust` (nota, classe, motivos e confiança), que vale no carimbo, nas ordenações "Score" e "Custo × confiança", no score mínimo dos alertas e no bot.

### 2.7.0: Fase 5, TikTok Shop e docs finais
- A pesquisa (`docs/tiktok-shop.md`) concluiu:
  - não há busca web pública estável;
  - os endpoints são assinados;
  - os termos do TikTok proíbem coleta automatizada;
  - as APIs oficiais exigem cadastro de empresa.
- Por isso a loja ficou em `stores.json` com `enabled: false` e sem adaptador. O bot recusa links da TikTok Shop com uma explicação.
- `reliability.js` passou a aceitar lojas sem dados (`null`).
- README, `docs/telegram.md` e `docs/como-funciona.md` atualizados.

## 6. Decisões já tomadas (não reabrir)

- **Referência de preço:** Pix.
- **Cupons:** 1 cupom por pedido.
- **"Ver na loja":** abre a URL canônica limpa.
- **Importados:** mostram "informe a cotação" até haver cotação.
- **Imposto de importação:** só nas lojas de `importTaxStores`. Regras em 03/11/2026:
  - Remessa Conforme até US$ 50: II 0% desde 12/05/2026 (Lei 15.502/2026).
  - De US$ 50,01 a US$ 3.000: 60% − US$ 30.
  - Fora do programa: 60%.
- **Pesquisa de cupons no Reclame Aqui (REA):** só se for preciso; ainda não rodou.
- **TikTok Shop:** continua desligada até ser testada com a rede liberada.

## 7. Pendências (próximos passos)

1. **Conferir ao vivo as 8 lojas.** A rede da sessão anterior bloqueava os sites, então tudo foi testado com fixtures.
   - Rode `npm start`, busque "rtx 4060" e confira loja a loja.
   - Onde aparecer "Preço não encontrado nesta página": salve o HTML em `tests/fixtures/`, escreva o teste e ajuste o adaptador.
2. **Ler mais dados do vendedor** (idade da loja, vendas, avaliações) e preencher `offer.sellerInfo`. Hoje a maioria das ofertas de marketplace fica limitada a "Regular" por falta de dado.
3. **`data/taxes.json`:** confirmar a regra `prc_pf_50_3000` e o ICMS das UFs com `"verificar": true`.
4. **`data/stores.json`:** conferir as notas do Reclame Aqui, que são estimativas.
5. **Testar com dados reais:** links encurtados, canais `t.me/s` e PTAX.
6. **Commits antigos "Unverified" no GitHub** (por exemplo `ab14c7a`): só somem com force push, que o dono **não** autorizou.

## 8. Triagem legal já feita (SetupSniper)

| Norma | Onde aparece | Risco | Como foi reduzido |
|---|---|---|---|
| Código Penal, art. 139, e Código Civil, art. 52 | rótulo "Alto risco" do vendedor | médio | estimativa com motivos objetivos; "sinais de risco", sem acusação; aviso no README; não publicar nomes de vendedores com nota |
| CDC, art. 37 | cupons e preços anunciados | baixo | cupons não verificados aparecem como tal; nada é aplicado sozinho |
| Código Civil, art. 187, e termos das lojas | leitura de páginas públicas | médio | uso pessoal, intervalos conservadores, sem login e sem burlar proteção; TikTok Shop desligada |
| LGPD, art. 4º, I | CEP e perfil | baixo | ficam só na máquina do usuário |

É uma triagem automatizada, não um parecer jurídico.

## 9. Armadilhas conhecidas

- **Servidor demo:** não use `pkill`/`pgrep -f server.js`, porque eles derrubam o próprio shell. Para achar o processo, use:

  ```bash
  ps -eo pid,args | awk '$2 ~ /node$/ && /server.js/'
  ```

- **Testes de integração:** use `startDemoServer` de `tests/helpers/server.js`. Porta fixa dá colisão quando os arquivos de teste rodam em paralelo.
- **Comandos encadeados:** use `&&` e não `;`. Já saiu um commit com teste falhando por causa disso.
- **Fixtures:** o preço da Shopee vem multiplicado por 100000. Títulos com "sem cooler" são filtrados como acessório.
- **Parser de cupons:** nomes de lojas ("CUPOM AMAZON") não são códigos (lista `NOT_CODES`). A palavra "use" só vale como palavra inteira ("Mouse" não conta).
- **Rede bloqueada:** se a sessão bloquear os sites das lojas, pesquise na web e marque o que não foi conferido como **[não verificado]**.
