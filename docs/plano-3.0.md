# SetupSniper 3.0 — plano de etapas para subagentes

Nov 4, 2026 · @Pedro

## Como usar este plano

O Claude Code principal age como **orquestrador**: lê o `CONTEXTO_CLAUDE.md`, cria os subagentes e delega uma etapa por vez. Cada etapa termina com testes passando, `npm run check` limpo e um commit pequeno no nome do Pedro.

1. Exporte este doc em Markdown e salve como `docs/plano-3.0.md` no repositório.
2. Abra o Claude Code na pasta do projeto e cole o prompt inicial da última seção.
3. O orquestrador cria os arquivos de `.claude/agents/` da próxima seção e começa pela Etapa 0.
4. Ao fim de cada etapa, ele mostra o resumo, os testes e o diff, e só segue depois do seu "ok".

**Subagentes não veem a conversa.** Cada um recebe só o próprio prompt e detalhes básicos do ambiente. Por isso, todo arquivo de agente começa mandando ler `CONTEXTO_CLAUDE.md` e `docs/plano-3.0.md`.

### Regras que valem para todos

- Só o orquestrador faz commit: autor `Pedro Henrique Santos <336734781+phs-analytics@users.noreply.github.com>`, sem `Co-Authored-By`, arquivos adicionados um por um.
- Testes primeiro, com fixtures e sem rede. Dinheiro em centavos inteiros.
- Regras que mudam (limites de API, categorias, pesos, prazos) ficam em JSON com **fonte e data**.
- Nunca burlar proteção de loja: sem captcha, disfarce de navegador, proxy ou cookies de sessão. Quando uma loja recusa, a saída é API oficial, feed de afiliado ou o navegador do próprio usuário.
- Cupom nunca é testado, gerado nem aplicado sozinho. Cupom de terceiros aparece como "divulgado por X em data, não verificado".
- O que não puder ser conferido ao vivo recebe a marca **\[não verificado\]** no código e nos docs.
- Sem force push e sem PR sem pedido explícito. Na dúvida, o orquestrador pergunta.
- `server.js` e `public/app.js` são arquivos compartilhados: nunca são editados por dois subagentes em paralelo.
- Versão: cada etapa concluída sobe uma versão menor (2.12.0, 2.13.0…), com entrada no CHANGELOG.

## Subagentes

São nove subagentes de projeto, em `.claude/agents/`, cada um com escopo fechado. Só `name` e `description` são obrigatórios; os demais campos são opcionais.

| Subagente | O que faz | Pode mexer em | Ferramentas |
| --- | --- | --- | --- |
| `diagnostico-lojas` | Lê o relatório do diagnóstico e classifica cada loja | nada (só leitura) + `docs/diagnostico-*.md` | Read, Grep, Glob, Bash |
| `fontes-oficiais` | Troca consultas bloqueadas por APIs e feeds oficiais | `src/official-apis.js`, `src/stores.js`, novos `src/sources/*.js`, `data/stores.json`, `data/source-limits.json`, testes | Read, Edit, Write, Bash |
| `cupons-oficiais` | Puxa cupons das redes de afiliados | `src/discounts.js`, novo `src/coupon-feed.js`, `data/coupon-sources.json`, testes | Read, Edit, Write, Bash |
| `historico-precos` | Histórico próprio de preços de todas as lojas | novo `src/price-history.js`, `data/history-rules.json`, testes | Read, Edit, Write, Bash |
| `busca-por-loja` | Vários produtos por loja, filtrados pela nota do vendedor | `src/compare.js`, `src/ranking.js`, `src/extract.js`, `src/seller-score.js`, paginação em `src/stores.js`, `data/search-rules.json`, testes | Read, Edit, Write, Bash |
| `telegram-tempo-real` | Canais quase em tempo real e grupos com o bot | `src/telegram.js`, `src/telegram-channels.js`, `src/promo-parser.js`, testes | Read, Edit, Write, Bash |
| `ofertas-tech` | Pipeline e aba Ofertas | novos `src/offers.js`, `src/tech-filter.js`, `data/tech-categories.json`, `public/` (aba nova), testes | Read, Edit, Write, Bash |
| `extensao-cupons` | Extensão mostra cupons e histórico da loja aberta | `extensao/`, testes da extensão | Read, Edit, Write, Bash |
| `revisor-regras` | Confere as regras 1 a 11 antes de cada commit | nada (só leitura) | Read, Grep, Glob, Bash |

O `revisor-regras` roda `npm test` e `npm run check`, procura dado pessoal, chave, `git add -A`, preço em reais com vírgula fora do formatador e qualquer tentativa de contornar bloqueio. Ele devolve "aprovado" ou a lista do que corrigir.

### Modelo de arquivo de agente

```markdown
---
name: fontes-oficiais
description: Use para trocar adaptadores de loja bloqueados por APIs oficiais e feeds de afiliados no SetupSniper. Não faz commit.
tools: Read, Edit, Write, Grep, Glob, Bash
model: inherit
---

Antes de tudo, leia CONTEXTO_CLAUDE.md e docs/plano-3.0.md (Etapa 1).
Você só pode editar os arquivos listados para o seu papel no plano.
Nunca burle proteção de loja (regra 4). Testes primeiro, com fixtures e sem rede.
Dinheiro em centavos. Limites de API em data/source-limits.json, com fonte e data.
Não faça commit: devolva ao orquestrador o resumo, os testes novos e o diff.
O que não puder conferir ao vivo, marque como [não verificado].
```

Os outros sete seguem o mesmo molde, trocando a etapa e a lista de arquivos da tabela.

## Etapa 0 — Diagnóstico real das lojas

Nenhum adaptador é trocado antes de saber, na rede de verdade, por que cada loja falha. Todo o desenvolvimento até a 2.11.0 rodou com a rede bloqueada, então parte dos "bloqueios" pode ser só parser desatualizado.

**Você faz (fora do Claude Code):** no servidor de casa, abra a aba Lojas → Testar as lojas agora → Copiar relatório. Repita no celular-servidor, se usar. Cole os relatórios em `docs/diagnostico-2026-11.md`, sem CEP, token ou chat id.

**Subagente `diagnostico-lojas`:** classifica cada uma das 8 lojas em uma de quatro situações e gera a tabela de ação.

| Situação | Sinal no relatório | Ação na Etapa 1 |
| --- | --- | --- |
| Funciona | preços lidos, sem erro | só validar e adicionar fixture nova |
| Quebrado | página abre, mas nenhum preço sai | atualizar o parser com fixture da página nova |
| Bloqueado | 403, 429, captcha ou desafio | trocar por fonte oficial; sem oficial, usar o navegador do usuário |
| Rede | DNS, timeout, conexão recusada | revisar `netError` e intervalos; não é bloqueio |

**Pronto quando:** `docs/diagnostico-2026-11.md` tem a tabela loja → situação → ação, e o orquestrador mostrou essa tabela ao Pedro antes de começar a Etapa 1.

## Etapa 1 — Trocar consultas bloqueadas por fontes oficiais

Cada loja ganha uma lista ordenada de fontes em `data/stores.json`. O servidor tenta da mais oficial para a menos oficial e para de insistir numa página que bloqueou. Subagente: `fontes-oficiais`.

| Loja | Fonte nova (ordem) | O que o Pedro precisa | Sem a fonte oficial |
| --- | --- | --- | --- |
| KaBuM! | catálogo JSON público (já existe) → feed de produtos e Offers API da Awin | conta de afiliado Awin Brasil aprovada no programa da KaBuM | navegador do usuário |
| Terabyte | API de produtos da Lomadee (limite de 10 requisições por minuto) | conta Lomadee aprovada no programa da Terabyte | navegador do usuário |
| Amazon | Creators API (a PA-API foi desligada em 15/05/2026) | conta Amazon Associados com acesso à Creators API | navegador do usuário |
| Mercado Livre | API oficial + login OAuth (já existe) | validar ao vivo | navegador do usuário |
| Shopee | API de afiliados (já existe) | validar ao vivo | navegador do usuário |
| AliExpress | API de afiliados (já existe) | validar ao vivo | navegador do usuário |
| Pichau | nenhuma fonte oficial encontrada \[não verificado\] | nada | navegador do usuário (extensão, favorito, PWA) |
| Magalu | programa Parceiro Magalu, API \[não verificado\] | o subagente pesquisa e anota em `docs/fontes-oficiais.md` | navegador do usuário |

### Tarefas

1. **Lista de fontes por loja.** Campo `sources` em `data/stores.json`, por exemplo `["api-oficial", "feed-afiliado", "pagina", "navegador"]`. `searchStore()` percorre a lista e devolve no `trace` qual fonte respondeu.
2. **Adaptadores novos** em `src/sources/`: `awin.js` (feed JSONL e Offers API), `lomadee.js` e `amazon-creators.js` (OAuth 2.0 client credentials). Cada um com fixture em `tests/fixtures/`.
3. **Limites de taxa** em `data/source-limits.json`, com fonte e data: Awin 20 chamadas por minuto, Lomadee 10 por minuto. Uma fila simples por fonte (balde de fichas) em `src/rate-limit.js`, sem dependência.
4. **Pausa após bloqueio.** Quando `isChallenge()` detecta bloqueio numa página, aquela loja fica 6 horas sem tentar a página de novo (valor em JSON). Isso acaba com as tentativas repetidas que só geram erro.
5. **Modo degradado honesto.** Sem fonte oficial e com a página bloqueada, a interface mostra o último preço visto pelo navegador do usuário com a idade ("visto por você há 3 h") e o botão "Abrir na loja para atualizar". Nunca mostra "Não disponível" sem motivo.
6. **Links de afiliado.** As APIs devolvem links rastreados, mas o "Ver na loja" continua abrindo a URL canônica limpa (decisão já tomada). Usar link de afiliado só se o Pedro ligar uma opção, e com aviso visível.
7. **Variáveis novas no `.env.example`:** `AWIN_TOKEN`, `AWIN_PUBLISHER_ID`, `LOMADEE_API_KEY`, `AMAZON_CREATORS_CLIENT_ID`, `AMAZON_CREATORS_CLIENT_SECRET`, `AMAZON_PARTNER_TAG`. Todas opcionais.
8. **Diagnóstico** passa a testar também as fontes oficiais configuradas e diz qual credencial falta.

**Pronto quando:** as lojas marcadas como "bloqueado" na Etapa 0 respondem por fonte oficial ou mostram o modo degradado com motivo; testes novos passam sem rede; `docs/fontes-oficiais.md` atualizado.

## Etapa 2 — Cupons oficiais das redes de afiliados

A aba Cupons passa a juntar duas origens com rótulos diferentes: cupom **oficial**, enviado pela loja via rede de afiliados, e cupom **divulgado**, vindo do Telegram e não verificado. Subagente: `cupons-oficiais`.

1. **`src/coupon-feed.js`** busca a cada 6 horas (valor em JSON):
   - Awin Offers API: promoções e códigos ativos, futuros e expirando. Os códigos só vêm das lojas em que o Pedro foi aceito.
   - Lomadee: endpoint de cupons, se ainda existir na API atual. O subagente confere a documentação; se não existir, registra \[não verificado\] e pula.
   - Shopee e AliExpress: cupons ou vouchers, se as APIs já integradas oferecerem \[não verificado\].
2. **Normalização** para o formato de regras que já existe: percentual com teto, valor fixo com mínimo, frete, forma de pagamento, primeira compra e assinantes. Valores em centavos.
3. **Rótulos na interface:** "Oficial — enviado pela loja via Awin, válido até 10/11" e "Divulgado por @canal em 04/11, não verificado".
4. **Deduplicação** por loja + código. Se o mesmo código vier das duas origens, fica o rótulo oficial.
5. **Expiração:** cupom vencido some da lista ativa e vai para o histórico de cupons.
6. **Arquivos:** `data/coupon-sources.json` versionado (fontes, intervalos, com fonte e data); `data/coupons-feed.json` com os dados, fora do git.
7. **Nunca aplicar.** O total final continua usando um cupom por pedido, escolhido pelo usuário ou sugerido como "melhor cupom estimado".

**Pronto quando:** fixtures da Offers API e da Lomadee viram cupons normalizados nos testes; a aba Cupons mostra as duas origens; `docs/cupons.md` atualizado.

## Etapa 3 — Histórico próprio de preços (estilo Keepa)

Todo preço que o servidor vê, de qualquer loja, vira um ponto numa série temporal. A API do Keepa custa a partir de €49 por mês e cobre só a Amazon, então ela fica como extra opcional. Subagente: `historico-precos`.

1. **Gravação** em `src/price-history.js`, num arquivo JSONL por mês (`data/history/2026-11.jsonl`), só com módulos do Node. Cada linha: data e hora, assinatura do produto (`productSignature`), loja, vendedor, preço Pix em centavos e origem (busca, fixado, extensão, API, Telegram).
2. **Sem inchaço:** no máximo um ponto por produto × loja × vendedor por hora, a menos que o preço mude.
3. **Alternativa SQLite:** o subagente confere se o Node do Termux tem `node:sqlite`. Se tiver e for estável, oferece como opção; o JSONL continua sendo o padrão.
4. **Indicadores:** menor preço e mediana em 30 e 90 dias, "menor preço em 90 dias" e o selo **"preço inflado antes da promoção"**, quando o preço subiu antes da queda anunciada. Limites em `data/history-rules.json`, com fonte e data.
5. **Interface:** minigráfico (SVG simples) nos Fixados e na aba Ofertas, com a frase "menor em 90 dias: R$ X". O gráfico mostra só o que foi visto; sem dados, diz "histórico começando".
6. **Migração** do `data/history.json` atual para o formato novo, sem perder pontos.
7. **Retenção:** pontos com mais de 180 dias viram um ponto diário (o menor do dia).
8. **Keepa opcional:** se existir `KEEPA_API_KEY`, produtos da Amazon puxam o histórico de lá, marcado como "fonte: Keepa".

**Pronto quando:** fixtures com séries simuladas geram os indicadores certos; os Fixados mostram o minigráfico; o `docs/como-funciona.md` explica o histórico.

## Etapa 3b — Vários produtos por loja, só de vendedores bem avaliados

A busca passa a mostrar, para cada loja, todos os produtos relevantes para o termo pesquisado (não só o melhor de cada loja), escondendo por padrão os vendedores com nota abaixo de "Bom". O modo Comparativo continua igual. Subagente: `busca-por-loja`.

### Como fica para o usuário

- **Modo novo "Por loja"** ao lado de Resultados e Comparativo: uma seção por loja, com contagem ("KaBuM!: 8 produtos · 3 ocultos pela nota").
- Dentro de cada loja, até 10 produtos relevantes (valor ajustável), na ordem "Melhor escolha"; dá para trocar para menor preço ou maior nota.
- O mesmo produto vendido por vários vendedores da loja vira um card, com o melhor vendedor em cima e "Outros N vendedores".
- **Filtro "só vendedor bom"**, ligado por padrão: nota mínima 70 ("bom" ou "confiável"), ajustável nas configurações. Os ocultos ficam num botão "Mostrar ocultos (N)", com o motivo de cada um.
- Ofertas sem dados suficientes do vendedor aparecem em grupo próprio, "Sem dados do vendedor", e não somem caladas.
- Alto risco e suspeitos nunca ficam na frente de vendedores confiáveis (regra já existente).
- No celular, cada loja vira uma seção recolhível, sem cortes de 320 a 768 px.

### Tarefas

1. **Relevância por loja:** `cleanResults()` já filtra acessórios e termos; acrescentar uma nota de relevância (todos os termos, modelo exato, variante certa) e cortar por loja em `resultsPerStore` (padrão 10).
2. **Mais páginas quando faltar:** se a primeira página não tiver produtos suficientes com vendedor bom, buscar a próxima, até um máximo de páginas por loja e busca (padrão 3), respeitando a pausa após bloqueio e os limites da Etapa 1.
3. **Agrupar dentro da loja:** reaproveitar `productSignature` e `groupOffers` de `src/compare.js` para juntar o mesmo produto de vendedores diferentes.
4. **Filtro por nota:** usar `offer.trust` de `src/seller-score.js`; ocultos guardam o motivo ("nota 48: cautela — poucas avaliações").
5. **Mais dados do vendedor**, para que menos ofertas caiam em "Regular" por falta de dado: reputação pela API oficial do Mercado Livre (já existe), nota da loja nas APIs da Shopee, AliExpress e Amazon \[não verificado\], vendedor parceiro no catálogo da KaBuM \[não verificado\] e dados lidos pela extensão nas páginas que o usuário abre. Tudo preenche `offer.sellerInfo`.
6. **Configuração** em `data/search-rules.json` (nota mínima, produtos por loja, páginas máximas, com fonte e data) e preferência do usuário em `data/settings.json`.
7. **Fixados e Ofertas** usam o mesmo filtro: o alerta de preço só dispara para vendedor acima da nota mínima, a menos que o usuário desligue.

### Testes

- Fixture por loja com 20 resultados misturados (produto certo, variantes, acessórios, vendedores bons, ruins e sem dados).
- Conferir: até 10 por loja, agrupamento correto, contagem de ocultos, nenhum alto risco à frente e a busca parando no limite de páginas.

**Pronto quando:** o modo "Por loja" mostra vários produtos por loja no `npm run demo`, o filtro de nota funciona nos testes de integração e o `docs/como-funciona.md` explica o modo novo.

Como a nota depende de dados do vendedor, esta etapa rende mais depois da Etapa 1: sem as APIs oficiais, muitas ofertas de marketplace ficam limitadas a "Regular" e cairiam no grupo "Sem dados do vendedor".

## Etapa 4 — Telegram em tempo real

Dá para ter tempo real de verdade em grupos onde o seu bot pode entrar, e quase tempo real nos canais públicos. Grupos de terceiros que não aceitam o bot continuam só por encaminhamento. Subagente: `telegram-tempo-real`.

| Origem | Como ler | Atraso | O que o Pedro faz |
| --- | --- | --- | --- |
| Canal público | prévia `t.me/s/<canal>` só com posts novos (cursor por canal) | 3 a 5 min nos canais ativos | nada |
| Canal onde o bot é admin | atualização `channel_post` pelo bot | segundos | pôr o bot como admin (canal seu ou com aceite do dono) |
| Grupo seu ou que aceita o bot | atualização `message` pelo bot | segundos | desligar o privacy mode no BotFather (`/setprivacy`) e readicionar o bot, ou torná-lo admin |
| Grupo que não aceita o bot | encaminhar o post ao bot (como hoje) | o seu tempo | encaminhar |

Com o privacy mode ligado, o bot só recebe comandos e respostas dirigidas a ele. Desligar o modo só vale para grupos onde ele for adicionado depois, por isso é preciso readicionar.

### Tarefas

1. **Canais mais rápidos:** intervalo por canal em `data/telegram-channels.json` (3 a 5 min para os mais ativos, 30 min para os parados), com recuo automático quando a prévia falha. Ler só depois do último post visto.
2. **Grupos com o bot:** tratar `message` de grupos e supergrupos e `channel_post` de canais no long polling que já existe. Só chats de uma lista de permissão em `data/telegram-groups.json` (fora do git), adicionados com o comando `/grupo_add` dentro do grupo, pelo Pedro.
3. **Privacidade:** o bot ignora mensagens que não parecem oferta (sem preço nem link de loja) e não guarda nome ou id de quem postou, só o nome do grupo.
4. **Saída única:** todo post novo, de qualquer origem, entra no mesmo fluxo: `promo-parser` → aba Ofertas (Etapa 5), aviso ao vivo para a página aberta (SSE) e alerta no Telegram se bater com um Fixado.
5. **Diagnóstico:** a aba Lojas ganha a linha "Telegram": canais lidos, grupos conectados, privacy mode ligado ou desligado e o último post recebido.

### Decisão pendente: userbot

Ler em tempo real um grupo que não aceita o bot só seria possível com um **userbot**, ou seja, a sua conta pessoal do Telegram conectada por uma biblioteca de cliente. O projeto já decidiu não usar userbot, e este plano mantém a decisão. Os motivos: risco de a sua conta pessoal ser limitada ou banida por automação, uma sessão com acesso total à sua conta guardada no servidor, e a quebra da regra de zero dependências. Só vira etapa se você decidir por escrito mudar isso.

**Pronto quando:** fixtures de `message` e `channel_post` entram no fluxo de ofertas; grupos fora da lista são ignorados; `docs/telegram.md` explica BotFather e privacy mode passo a passo.

## Etapa 5 — Aba Ofertas (só tecnologia)

A aba Ofertas mostra uma linha por oferta de tecnologia: nome do produto, preço anunciado, loja, cupom (se houver) e preço final estimado com o cupom. Ela recebe tudo ao vivo do Telegram, dos cupons oficiais e das APIs. Subagente: `ofertas-tech`.

### Fluxo de uma oferta

1. **Entrada:** posts de canais, grupos e encaminhados; cupons oficiais (Etapa 2); itens com desconto das APIs do Mercado Livre, Shopee e AliExpress; capturas da extensão.
2. **Extração** (`src/offers.js`, usando `promo-parser.js` e `link-resolver.js`): nome do produto, preço em centavos, preço "de" se houver, forma de pagamento do preço (Pix, à vista, parcelado), cupom e regra do cupom, loja e link canônico. Post com vários produtos vira várias ofertas.
3. **Filtro de tecnologia** (`src/tech-filter.js` + `data/tech-categories.json`, com fonte e data): categorias hardware (CPU, GPU, placa-mãe, memória, SSD, fonte, gabinete, cooler), periféricos, monitores, notebooks e PCs, celulares e tablets, rede, áudio, consoles e jogos. Palavras positivas e negativas por categoria, reaproveitando o filtro de acessórios de `extract.js`. Abaixo da nota mínima, a oferta vai para um filtro "Outros" escondido.
4. **Cupom:** com cupom, calcula o preço final com `final-price.js` e mostra "cupom oficial" ou "cupom divulgado, não verificado"; sem cupom, mostra o preço do post como está.
5. **Enriquecimento:** pela assinatura do produto, liga ao comparativo ("ver nas outras lojas"), ao histórico ("menor em 90 dias" e selo de preço inflado) e à nota de confiança da loja e do vendedor.
6. **Duplicadas:** mesma assinatura, loja e preço em 24 horas viram um só card, com "visto em 3 canais".
7. **Validade:** depois de 24 horas, ou se uma conferência mostrar preço diferente, o card ganha "pode ter acabado". Dados em `data/offers.json` (fora do git), guardados por 7 dias.

### Interface

- Filtros: com cupom, sem cupom, categoria, loja e preço máximo.
- Ordem padrão "Melhor escolha": desconto em relação ao histórico × confiança; alto risco e suspeitos no fim.
- Ofertas novas chegam por SSE com o aviso "3 novas ofertas", sem pular a rolagem.
- Botões por card: Fixar, Ver na loja (URL limpa), Copiar cupom, ✅ Funcionou e ❌ Não funcionou.
- Sem cortes de 320 a 768 px, no estilo zine/colagem atual.
- A aba 📣 Promoções continua como feed bruto dos canais. Se o Pedro preferir, numa etapa futura as duas viram uma só.

### Testes

- Pelo menos 30 posts de exemplo: com e sem cupom, Pix e parcelado, preço "de/por", vários produtos num post, link encurtado e emojis no lugar de números.
- Pelo menos 40 títulos para o filtro (metade tecnologia, metade não), com acerto mínimo combinado no JSON.

**Pronto quando:** a aba Ofertas mostra os exemplos certos nos testes de integração com `startDemoServer`, e o `npm run demo` exibe ofertas simuladas com e sem cupom.

## Etapa 6 — Extensão mostra cupons e histórico da loja aberta

É o "Honey" do SetupSniper, só que informativo: a extensão avisa e lista, e quem decide e digita o cupom é você. Subagente: `extensao-cupons`.

1. **Selo no ícone** com o número de cupons ativos para o domínio da aba aberta, buscado no servidor do Pedro.
2. **Janela da extensão:** lista os cupons com origem (oficial ou divulgado), validade, regra ("10% até R$ 50, mínimo R$ 300") e botão **Copiar**. Nunca preenche o campo de cupom nem clica em nada na loja.
3. **Página de produto:** se a assinatura bater com o histórico, mostra "menor em 90 dias: R$ X" e o selo de preço inflado, quando houver.
4. **Sem permissões novas** além das que a extensão já pede. Nada de carrinho, pagamento ou conta é enviado (regra já existente).
5. **Firefox Android:** manter a nota de assinatura não listada pela Mozilla em `docs/extensao.md`.

**Pronto quando:** o teste no Chromium com Playwright mostra o selo e a lista numa página de fixture, e nenhum teste encontra escrita no campo de cupom.

## Etapa 7 — Nuvem opcional e fechamento

A coleta nas lojas continua no servidor de casa ou no celular. A nuvem só entra para buscar cupons das APIs quando o servidor de casa passa muito tempo desligado.

### Opção A: Cloudflare Worker (recomendada, se precisar)

- Um Worker com agendamento a cada 6 horas chama Awin e Lomadee e guarda o resultado num KV. O servidor de casa busca esse JSON com um token secreto.
- O plano grátis tem 5 agendamentos por conta e 10 ms de CPU por execução; esperar a resposta da API não conta como CPU, mas processar muito texto, sim. Serve para JSON pequeno, não para ler HTML.
- Código em `nuvem/cloudflare/`, separado do servidor, com guia em `docs/nuvem.md`.

### Opção B: GitHub Actions

- Possível, mas pior para este caso: intervalo mínimo de 5 minutos, atrasos comuns e agendamento desligado depois de 60 dias sem commit.
- O repositório é público, então o log também é: chaves só em Secrets e nada de dado pessoal na saída.

### Fechamento

1. Atualizar README, CHANGELOG, `docs/como-funciona.md`, `docs/fontes-oficiais.md`, `docs/cupons.md`, `docs/telegram.md` e criar `docs/ofertas.md` e `docs/historico.md`.
2. Atualizar a seção "Decisões já tomadas" e "O que ainda não foi conferido" no `CONTEXTO_CLAUDE.md`.
3. Atualizar a triagem legal: links de afiliado (CDC, art. 37, aviso visível se a opção for ligada) e dados de grupos do Telegram (LGPD: não guardar autor).
4. Rodar `npm test`, `npm run check` e o `revisor-regras` uma última vez; subir para a versão **3.0.0**.

## Ordem, tarefas do Pedro e prompt inicial

São cinco ondas. Dentro de uma onda, os subagentes trabalham em paralelo só nos próprios arquivos; a ligação em `server.js` e `public/app.js` é feita pelo orquestrador, um de cada vez.

| Onda | Etapas | Em paralelo | Depende de |
| --- | --- | --- | --- |
| 1 | 0 — Diagnóstico | não | relatório real do Pedro |
| 2 | 1 — Fontes oficiais · 3 — Histórico | sim | onda 1 |
| 3 | 2 — Cupons oficiais · 3b — Vários produtos por loja · 4 — Telegram | sim (3b não divide arquivos com 2 e 4) | onda 2 |
| 4 | 5 — Aba Ofertas | não | ondas 2 e 3 |
| 5 | 6 — Extensão · 7 — Nuvem e fechamento | sim | onda 4 |

### O que só você pode fazer

- [ ] Rodar o diagnóstico no servidor de casa e colar o relatório (Etapa 0)
- [ ] Pedir cadastro de afiliado na Awin Brasil e entrar no programa da KaBuM
- [ ] Pedir cadastro na Lomadee e entrar no programa da Terabyte
- [ ] Ver se a sua conta Amazon Associados tem acesso à Creators API
- [ ] No BotFather, rodar `/setprivacy` (Disable) e readicionar o bot aos seus grupos
- [ ] Decidir se a aba Promoções continua separada da aba Ofertas
- [ ] Manter ou mudar a decisão sobre userbot (o plano assume que fica sem)

Os cadastros de afiliado dependem de aprovação. Se algum for recusado, a loja fica no navegador do usuário e o plano segue.

### Prompt para colar no Claude Code

```text
Leia CONTEXTO_CLAUDE.md inteiro e depois docs/plano-3.0.md.
Você é o orquestrador. Crie os subagentes da seção "Subagentes" em .claude/agents/,
seguindo o modelo do plano. Depois execute as ondas na ordem da tabela final.
Regras: só você faz commit, no meu nome, um arquivo por vez, depois de npm test,
npm run check e aprovação do subagente revisor-regras. server.js e public/app.js
nunca são editados por dois subagentes ao mesmo tempo.
Ao fim de cada etapa, me mostre resumo, testes novos e diff, e espere meu "ok".
Comece pela Etapa 0: confira se docs/diagnostico-2026-11.md existe; se não existir,
me peça o relatório do diagnóstico e pare.
```

### Fontes

- [Awin: My Offers e Offers API](https://success.awin.com/articles/en_US/Knowledge/How-do-I-find-an-advertiser-offers-vouchers) · [limite de 20 chamadas por minuto](https://help.awin.com/apis/apidocs/introduction-1) · [programa KaBuM na Awin](https://ui.awin.com/merchant-profile/17729)
- [Terabyte na Lomadee](https://www.lomadee.com.br/en/brands/terabyte) · [limite de 10 requisições por minuto da Lomadee](https://ce-docs.keywordrush.com/modules/affiliate/lomadeeproducts)
- [Fim da PA-API e Creators API](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/paapiv5-deprecation)
- [Preço da API do Keepa](https://revenuegeeks.com/software/keepa/api)
- [Privacy mode de bots em grupos](https://github.com/python-telegram-bot/python-telegram-bot/wiki/Frequently-Asked-Questions)
- [Subagentes do Claude Code](https://code.claude.com/docs/en/subagents)
- [Limites do Cloudflare Workers](https://developers.cloudflare.com/workers/platform/limits/index.md) · [limites do agendamento no GitHub Actions](https://cronuru.com/guides/github-actions-scheduled-workflows)
