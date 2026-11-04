# SetupSniper: tudo o que foi feito

> Situação em 04/11/2026: versão **2.11.0** na branch `main`, com **146 testes** passando.
> Este arquivo trata **só do SetupSniper**. Serve de contexto para a próxima sessão do Claude Code: leia inteiro antes de mexer no projeto.

---

## 1. O que é

O **SetupSniper** é um caçador e **comparador de preços de hardware** para quem monta PC no Brasil. É um projeto pessoal, sem fins comerciais, feito em **Node.js puro, sem nenhuma dependência** (não tem `npm install`).

**O objetivo principal do dono:** mostrar o **comparativo entre lojas e entre os vendedores dos marketplaces**, com os links mais baratos dos vendedores mais confiáveis primeiro.

### O que ele faz hoje

**Comparar preços**
- **Lojas:** KaBuM!, Pichau, Terabyte, Amazon, Mercado Livre, Magalu, Shopee e AliExpress.
- **Busca:** os resultados de cada loja aparecem conforme ela responde (streaming via SSE), com **scroll infinito** que pede as próximas páginas de cada loja.
- **Comparativo:** o mesmo produto, escrito de jeitos diferentes em cada loja, vira um grupo, com **uma linha por loja e por vendedor de marketplace**.
- **Ordem "Melhor escolha":** menor preço ajustado à confiança. Alto risco e suspeitos vão para o fim.
- **Total Pix e Total Crédito:** com cupom, frete, parcelas e, nos importados, imposto de importação e ICMS da UF do usuário.
- **Nota de confiança por oferta:** junta loja, vendedor e oferta, com motivos, nível de confiança e "sinais de risco".
- **Filtro de lixo:** descarta acessórios e marca o preço bom demais para ser verdade como "suspeito".

**Acompanhar e avisar**
- **Fixados:** produtos com meta de preço, histórico, estado explícito por loja e "Outros N vendedores".
- **Alertas e bot do Telegram:** avisos de preço, comandos, posts encaminhados e links compartilhados.
- **Canais de promoção:** 26 canais públicos do Telegram, na aba 📣 Promoções.

**Quando a loja bloqueia o servidor**
- **APIs oficiais** (Mercado Livre, Shopee, AliExpress) com as credenciais do usuário.
- **Login oficial (OAuth)** na conta do Mercado Livre do usuário.
- **Extensão do navegador** que envia sozinha os preços das páginas que o usuário abre.
- **Favorito** "Enviar para o SetupSniper".
- **App instalável (PWA)** com "Compartilhar → SetupSniper".
- **Diagnóstico das lojas**, com um relatório para copiar.

**Rodar em qualquer lugar**
- **Servidor no celular:** Android/Termux, com vigia, boot automático e Tailscale.
- **Nuvem de arquivos:** opcional.

**Interface:** em `public/`, com estilo zine/colagem e as abas Busca, Fixados, 📣 Promoções, 🎟️ Cupons, Lojas e Alertas. Sem cortes de 320 a 768 px.

## 2. Onde está

- **GitHub:** https://github.com/phs-analytics/SetupSniper (público), dono `phs-analytics`.
- **Branch:** `main`. Os commits vão direto nela.
- **Licença:** MIT.
- **Comunidade:** README, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY e CI no GitHub Actions.

Numa sessão nova, clone de novo:

```bash
git clone https://github.com/phs-analytics/SetupSniper.git && cd SetupSniper
npm test           # 146 testes, sem rede
npm run demo       # interface com preços simulados → http://localhost:3000
npm start          # servidor de verdade (precisa de .env com SENHA; veja .env.example)
npm run check      # sintaxe + arquivos pessoais + segredos (rode antes de todo commit)
npm run navegador  # opcional, no PC: instala o Playwright (não vira dependência)
```

**Variáveis do `.env`** (o arquivo nunca vai para o git):
- **Básico:** `PORT`, `SENHA`, `TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID`, `INTERVAL_MIN`.
- **APIs oficiais (opcionais):** `ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `ML_REDIRECT_URI`, `SHOPEE_AFFILIATE_APP_ID`, `SHOPEE_AFFILIATE_SECRET`, `ALIEXPRESS_APP_KEY`, `ALIEXPRESS_APP_SECRET`.
- **Para testes:** `PORT=0` (porta livre) e `DATA_DIR=<pasta>` (dados do usuário em outra pasta).

**Atualizar o servidor do usuário:**
- mande `/atualizar` para o bot; ou
- rode `sh scripts/atualizar.sh` (Termux); ou
- rode `git pull` e reinicie (PC).

Os arquivos do site vão com `Cache-Control: no-cache`, então o navegador já pega a versão nova.

## 3. Regras do dono (obrigatórias)

1. **Commits no nome dele, não no do Claude:**
   - Autor: `Pedro Henrique Santos <336734781+phs-analytics@users.noreply.github.com>`.
   - **Sem** `Co-Authored-By` e sem link de sessão do Claude.
   - Confira com `git config user.name` e `git config user.email`.
2. **Nada de dado pessoal ou chave no GitHub.**
   - Rode `npm run check` antes de cada commit.
   - Adicione os arquivos ao commit **um por um**, nunca com `git add -A`.
3. **Privacidade:**
   - CEP, perfil, token, chat id e tokens do Mercado Livre ficam só em `data/` ou no `.env`, ambos fora do git.
   - Nunca aparecem em logs, no Telegram nem no relatório do diagnóstico.
4. **Não burlar proteções das lojas, nunca.** Isso vale mesmo que o dono peça, e ele chegou a pedir duas vezes; foi recusado. Fica de fora:
   - resolver captcha;
   - disfarçar o servidor de navegador;
   - proxy para trocar de IP;
   - reaproveitar cookies de sessão ou de login das lojas, incluindo "login com Google" para acessar as lojas por trás.

   **Permitido:**
   - APIs oficiais e login oficial (OAuth) do usuário;
   - páginas públicas;
   - páginas que o próprio usuário abriu no navegador dele (extensão e favorito).
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

### Servidor e regras

| Arquivo | Para quê |
|---|---|
| `server.js` | servidor HTTP e SSE, busca, Fixados, alertas, API, bot, canais, captura, OAuth do ML, diagnóstico e migração dos dados |
| `src/scope.js` | `activeStoreIds()`: lojas ativas pelo `enabled` do `stores.json` ou pelo `settings.enabledStores` |
| `src/offer.js` | **schema único de oferta** (`normalizeOffer`, em centavos), `parseBRL`, `toCents`, `formatBRL`, `canonicalUrl` |
| `src/stores.js` | adaptadores por loja (`ADAPTERS`); `searchStore(id, q, { page, deep, browserFallback, noCache })` tenta API oficial → API pública → página → navegador e devolve `trace`; `isChallenge()`; `kabumItems()` |
| `src/official-apis.js` | Mercado Livre (busca + catálogo com todos os vendedores + reputação), Shopee Affiliate, AliExpress Affiliate |
| `src/ml-oauth.js` | login oficial (OAuth) na conta do Mercado Livre; token em `data/ml-auth.json`, renovado sozinho |
| `src/capture.js` | lê a página que o usuário enviou (extensão ou favorito) → `/api/capture` |
| `src/compare.js` | comparativo: `productSignature`, `sameProduct`, `groupOffers` (1 linha por vendedor), `sellerLabel` |
| `src/ranking.js` | ordem "Melhor escolha": `preço × (1 + (100 − nota)/400)`; nota < 40 e suspeitos depois; sem preço por último |
| `src/extract.js` | classifica preços pelo nome do campo e pelo texto; `cleanResults` (relevância + filtro de acessório por posição); `flagOutliers` |
| `src/scraper.js` | página de produto (link fixado) |
| `src/browser.js`, `src/http.js` | Playwright opcional e cliente HTTP (`netError` traduz erros de rede) |
| `src/monitor.js` | `storeState()`: estado por loja nos Fixados e `others` (outros vendedores) |
| `src/discounts.js`, `src/promo-parser.js`, `src/link-resolver.js` | cupons, leitura de posts e links encurtados |
| `src/promo-feed.js`, `src/telegram-channels.js` | feed da aba 📣 Promoções e leitura dos canais `t.me/s` |
| `src/import-tax.js`, `src/final-price.js`, `src/ptax.js` | II e ICMS, Total Pix e Total Crédito, cotação PTAX |
| `src/reliability.js`, `src/seller-score.js`, `src/reclameaqui.js` | nota da loja, nota final por oferta (`offer.trust`) e Reclame Aqui |
| `src/telegram.js`, `src/update.js` | bot e `/atualizar` |

### Interface, extensão, scripts e testes

| Arquivo | Para quê |
|---|---|
| `public/` | interface: `app.js`, `index.html`, `styles.css`, `receber.html`/`receber.js` (favorito), `manifest.webmanifest` + `sw.js` + ícones (PWA) |
| `/lib/*.js` | o servidor entrega `src/compare.js`, `extract.js`, `ranking.js` e `offer.js` ao navegador: a mesma regra nos dois lados |
| `extensao/` | extensão MV3 (Chrome, Edge, Firefox e Firefox Android) |
| `scripts/` | `check.js` e os scripts do Termux (`instalar-termux.sh`, `iniciar.sh`, `ligar.sh`, `vigia.sh`, `atualizar.sh`, `nuvem.sh`) |
| `tests/` | `node:test`; fixtures em `tests/fixtures/`; `tests/helpers/server.js` sobe o demo com `PORT=0` |

### Arquivos de dados

**Configuração versionada em `data/`:**
- `stores.json`
- `taxes.json`
- `cep-uf.json`
- `coupon-rules.json`
- `seller-score.json`
- `telegram-channels.json` (os 26 canais)
- `coupons.example.json`
- `watchlist.example.json`

**Dados do usuário, fora do git:**
- `.env`
- `data/settings.json`
- `data/watchlist.json`
- `data/history.json`
- `data/alerts.json`
- `data/coupons.json`
- `data/channels-state.json`
- `data/promos.json`
- `data/ml-auth.json`
- `logs/`

### Guias em `docs/`

| Guia | Assunto |
|---|---|
| `como-funciona.md` | o funcionamento completo, incluindo "O que ainda não foi conferido" |
| `fontes-oficiais.md` | lojas bloqueadas, diagnóstico e APIs oficiais |
| `extensao.md` | extensão do navegador, no PC e no Android |
| `app-celular.md` | link ou app; HTTPS e Compartilhar |
| `cupons.md`, `impostos-importacao.md`, `score-vendedor.md` | estudos com fontes |
| `tiktok-shop.md` | por que a TikTok Shop está desligada |
| `telegram.md`, `instalacao.md`, `celular-servidor.md`, `nuvem.md`, `adicionar-loja.md`, `faq.md` | guias de uso e instalação |

## 5. Histórico: tudo o que foi feito

### 1.0.0: versão inicial
Comparava três produtos fixos e calculava um score de confiabilidade.

### 2.0.0: a base
- Busca livre em streaming nas 8 lojas.
- Busca profunda, com Buscapé e Zoom e navegador headless opcional.
- Fixados, com meta, histórico e alertas por produto.
- Bot do Telegram: `/fixados`, `/fixar`, `/desafixar`, `/buscar`, `/status`, `/atualizar`.
- Botão "Ver na loja", visual zine/colagem e nuvem de arquivos.
- Scripts para rodar 24 h no Android, testes, `npm run check` e CI.
- **Correções:** preço sem centavos e dados embutidos pequenos.

### 2.1.0 e 2.1.1: servidor sempre ativo no celular
- `vigia.sh` religa tudo a cada 15 min.
- Guia por marca de celular.
- `ligar.sh` liga tudo com um comando e grava `logs/boot.log`.
- Os scripts passaram a ser chamados com `sh`.
- Corrigido o código de barras decorativo.

### 2.2.0: nota sem cara de certificação
- O carimbo diz "confiável", "bom", "regular" ou "cautela".
- As notas estimadas aparecem como "(est.)".
- Avisos legais e de uso pessoal.

### 2.3.0: Fase 0, escopo de lojas
- Só as 8 lojas ficam ativas; Buscapé e Zoom foram desligados por configuração.
- Criados `src/scope.js`, `DATA_DIR` e `data/taxes.json`, com `importTaxStores` = Amazon, AliExpress e Shopee.

### 2.4.0: Fase 1, preços que sumiam
- **Bug:** todas as lojas depois da primeira apareciam como "Não disponível".
- **Causa:**
  - o extrator pegava o menor valor da página, muitas vezes uma parcela;
  - a faixa automática dos Fixados descartava as outras lojas sem salvar nenhum estado.
- **Correção:**
  - schema único em centavos;
  - preços classificados por campo e por contexto;
  - estado explícito por loja;
  - migração automática dos dados antigos;
  - Pix como referência.

### 2.5.0: Fases 2 e 3, cupons e total final
**Cupons**
- Pesquisa de fontes (`docs/cupons.md`).
- Parser de posts, testado com 24 exemplos e com o post real.
- Resolvedor de links encurtados.
- Regras de desconto: percentual com teto, valor fixo com mínimo, frete, forma de pagamento, primeira compra e assinantes.
- No bot: botões 📌 Fixar, ✅ Funcionou e ❌ Não funcionou, e o comando `/cupons`.
- Aba Cupons.

**Total final**
- Total Pix e Total Crédito com cupom, frete, II e ICMS "por dentro", parcelas e juros.
- UF pelo CEP, sem API externa.
- Cotação manual ou PTAX.

### 2.6.0: Fase 4, nota por vendedor com sinais de risco
- **Cálculo:** nota = 0,25 × Plataforma + 0,55 × Vendedor + 0,20 × Oferta.
- **Travas:**
  - risco alto ou CNPJ não ativo: no máximo 39 ("Alto risco");
  - risco moderado: no máximo 54 ("Cautela");
  - pouco dado: no máximo 69 ("Regular").
- **Métodos:** média bayesiana, limite de Wilson, rajadas de avaliações e textos repetidos.
- **Resultado:** o vendedor suspeito real sai "Alto risco" nos três marketplaces.

### 2.7.0: Fase 5, TikTok Shop
- A pesquisa concluiu que não há busca pública estável, que os endpoints são assinados e que os termos proíbem coleta automatizada.
- A loja ficou cadastrada, desligada e sem adaptador.

### 2.8.0: scroll infinito, ordem e canais
- Scroll infinito por loja.
- **Correção do filtro de acessórios:** antes, títulos como "Ryzen 5 7600 com Cooler Wraith" eram descartados, o que causava "Nenhum resultado".
- Resultados "Parecidos" quando nenhum título tem todos os termos.
- Ordem "Melhor escolha" em todo lugar (pedido do dono).
- "Bloqueado" passou a reconhecer captcha, com navegador como plano B e motivo por loja.
- Catálogo JSON da KaBuM.
- Aba 📣 Promoções com os 26 canais, lidos a cada 30 min, com aviso quando um post bate com um produto fixado.
- Celular sem cortes.

### 2.9.0: comparativo e vendedores
- Busca no modo **Comparativo**.
- Fixados com o vendedor da oferta principal e "Outros N vendedores".
- APIs oficiais opcionais.
- **Diagnóstico** das lojas (aba Lojas e `/diagnostico`), com erros de rede explicados.

### 2.10.0: saídas legítimas para o bloqueio
- Favorito "Enviar para o SetupSniper".
- Login oficial na conta do Mercado Livre.
- Link compartilhado ao bot fixa o produto mesmo quando a página não abre.

### 2.11.0: automático no PC e no celular
- **Extensão do navegador:** envia sozinha os preços das páginas de produto e de busca que o usuário abre. Nunca envia carrinho, pagamento ou conta. Testada no Chromium.
- **Preços do navegador:** ficam 24 h no servidor e entram no comparativo; nos Fixados valem até 12 h quando a loja recusa o servidor.
- **PWA instalável** com "Compartilhar → SetupSniper".
- **Login do Mercado Livre automático em HTTPS.**
- **`npm run navegador`** instala o Playwright no PC.

## 6. Decisões já tomadas (não reabrir)

- **Referência de preço:** Pix.
- **Cupons:** 1 cupom por pedido.
- **"Ver na loja":** abre a URL canônica limpa.
- **Importados:** mostram "informe a cotação" até haver cotação.
- **Imposto de importação:** só nas lojas de `importTaxStores`. Regras em 03/11/2026:
  - Remessa Conforme até US$ 50: II 0% desde 12/05/2026 (Lei 15.502/2026);
  - de US$ 50,01 a US$ 3.000: 60% − US$ 30;
  - fora do programa: 60%.
- **Ordem:** "Melhor escolha" é o padrão em todo lugar. Alto risco e suspeitos nunca ficam na frente de ofertas confiáveis.
- **Bloqueio:** veja a regra 4. As saídas são oficiais ou feitas pelo próprio usuário.
- **TikTok Shop:** desligada até ser testada com a rede liberada.
- **Grupos do Telegram:** não têm prévia pública. Só por encaminhamento ao bot; nada de userbot.
- **Celular:** a recomendação é o link instalado como app (PWA), não app nativo.
  - HTTPS via `tailscale serve` (PC) ou proxy com domínio (nuvem).
  - O Tailscale do Android não tem `serve`, então um celular servidor fica sem HTTPS.
  - Firefox é o único navegador do Android com extensões; a extensão precisa ser assinada pela Mozilla (não listada, grátis).

## 7. O que ainda não foi conferido

Durante todo o desenvolvimento, a rede bloqueava as lojas, o Telegram, o Banco Central e o Reclame Aqui. Tudo foi testado com fixtures e respostas simuladas.

- **Testes que o dono deve fazer:** rodar o **diagnóstico** (aba Lojas → Testar as lojas agora → Copiar relatório) e testar a extensão numa loja real.
- **O relatório do diagnóstico é o primeiro passo** antes de mexer em qualquer adaptador.
- **Não verificado ao vivo:**
  - os adaptadores das 8 lojas;
  - o catálogo da KaBuM;
  - as APIs oficiais e o OAuth do ML;
  - a leitura dos 26 canais (quais são grupos);
  - a PTAX;
  - a extensão no Firefox.
- **Dados a confirmar:** a regra `prc_pf_50_3000` e o ICMS das UFs com `"verificar": true` em `data/taxes.json`, e as notas do Reclame Aqui em `data/stores.json`.
- **Ler mais dados do vendedor** (idade, vendas, avaliações) e preencher `offer.sellerInfo`. Hoje, sem a API do ML, muitas ofertas de marketplace ficam limitadas a "Regular".
- **Commits antigos "Unverified"** (por exemplo `ab14c7a`): só somem com force push, que **não** foi autorizado.

## 8. Triagem legal (SetupSniper)

| Norma | Onde aparece | Risco | Como foi reduzido |
|---|---|---|---|
| Código Penal, art. 139, e Código Civil, art. 52 | rótulo "Alto risco" do vendedor | médio | estimativa com motivos objetivos; "sinais de risco", sem acusação; não publicar nomes de vendedores com nota |
| CDC, art. 37 | cupons e preços anunciados | baixo | não verificados aparecem como tal; nada é aplicado sozinho |
| Código Civil, art. 187, e termos das lojas | leitura de páginas públicas | médio | uso pessoal, intervalos conservadores, sem burlar proteção; TikTok Shop desligada |
| LGPD, art. 4º, I | CEP, perfil, tokens | baixo | ficam só no servidor do usuário |

É uma triagem automatizada, não um parecer jurídico.

## 9. Armadilhas conhecidas

- **Servidor demo:** não use `pkill`/`pgrep -f server.js`, porque eles derrubam o próprio shell. Use:

  ```bash
  ps -eo pid,args | awk '$2 ~ /node$/ && /server.js/'
  ```

- **Testes de integração:** use `startDemoServer` de `tests/helpers/server.js`. Porta fixa dá colisão.
- **Comandos encadeados:** use `&&` e não `;`. Já saiu um commit com teste falhando por causa disso.
- **Fixtures:**
  - o preço da Shopee vem multiplicado por 100000;
  - o `__NEXT_DATA__` da fixture da KaBuM não tem `type`, então o navegador acusa um erro de sintaxe ao abrir a página (é da fixture, não do código).
- **Parser de cupons:** nomes de lojas não são códigos (`NOT_CODES`), e "use" só vale como palavra inteira.
- **Comparativo:** `VARIANT` (ti, super, xt, xtx, gre) separa produtos. "Max" não entra, porque aparece em "Max Turbo".
- **Teste da extensão no Playwright:** use `chromium.launchPersistentContext` com `channel: 'chromium'` e `--load-extension`. No teste, adicione o servidor em `host_permissions`; no uso real, a permissão é pedida no popup.
- **Permissões do ambiente:** o sistema recusou imitar cabeçalhos de navegador (Sec-Fetch etc.). Não tente de novo.
- **Rede bloqueada:** pesquise na web e marque o que não foi conferido como **[não verificado]**.
