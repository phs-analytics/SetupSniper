# Score de confiança por vendedor (com sinais de risco)

> Documento de pesquisa e proposta. **Não é código do app** e não muda nada no comportamento atual.
> Data da pesquisa: 03/11/2026.

## Por que isto existe

Hoje a nota de confiança (`src/reliability.js`) avalia **a plataforma** com os valores de `data/stores.json`
(Reclame Aqui, avaliação da loja, volume de vendas, % de reviews positivas). No caso real que motivou
este documento, um anúncio do AliExpress saiu com nota **80 (Bom)**. Só que quem vendia era um
vendedor com loja aberta há ~23 dias, 5 vendas e 5 avaliações 5★, todas em idioma estrangeiro e
publicadas em 2 dias. A plataforma é conhecida, mas **o vendedor não**.

Há mais um detalhe: quando falta algum dado, a nota atual **redistribui o peso** entre os dados
disponíveis. Com isso, ter pouco dado não pesa contra o vendedor. A proposta abaixo muda essa lógica:
**faltar dado reduz a confiança**.

Termos usados aqui: falamos em **sinais de risco** e em vendedor de **alto risco**. O SetupSniper não
acusa ninguém. Um vendedor novo e honesto também acende alguns desses sinais, e é isso que o usuário
precisa saber antes de pagar.

---

## 1. O que a literatura diz (e qual sinal cada trabalho sugere)

| Trabalho | O que mostra | Sinal que aproveitamos (sem ML) |
|---|---|---|
| **Jindal & Liu (2008)**, *Opinion Spam and Analysis*, WSDM 2008, p. 219–230 | Analisou 5,8 milhões de reviews e 2,14 milhões de revisores da Amazon e encontrou spam de opinião espalhado. Reviews duplicadas ou quase iguais foram usadas como exemplos de spam. A maioria das notas é 5★. | **Texto duplicado ou muito parecido** entre avaliações; a nota média sozinha engana. |
| **Mukherjee et al. (KDD 2013)**, *Spotting Opinion Spammers using Behavioral Footprints* | Modelo bayesiano não supervisionado (ASM) que usa "pegadas" de comportamento: similaridade de conteúdo (CS), máximo de reviews por dia (MNR), burstiness (BST), notas extremas (EXT), desvio da nota (DEV), proporção de primeiras reviews (RFR). Quem faz spam tende a postar em rajadas curtas; os demais avaliam de forma espalhada no tempo. | **Rajada** (máx. por dia / total), **notas só extremas**, **similaridade de texto**. |
| **Fei et al. (ICWSM 2013)**, *Exploiting Burstiness in Reviews for Review Spammer Detection* | Rajadas de reviews vêm de popularidade repentina **ou** de ataque de spam. Os revisores que aparecem juntos nas rajadas são modelados como um Markov Random Field. A métrica de burstiness considera o intervalo entre a primeira e a última review, com janela de 28 dias. | **Intervalo curto entre a 1ª e a última avaliação**: `BST = 1 − dias/28` (se dias < 28). |
| **Li et al. (2016/2017)**, *Modeling Review Spam Using Temporal Patterns and Co-bursting Behaviors* (arXiv 1611.06625; versão no WWW 2017) | Dados do Dianping: a taxa de postagem é bimodal (fases ativa e calma) e as transições entre esses estados ajudam a separar spam de revisores genuínos. Também mostra o "co-bursting": várias contas postando no mesmo produto numa janela curta. | Usar **só os carimbos de data** das avaliações já informa muito. Concentração temporal é sinal forte. |
| **Ji et al. (2020)**, GSDB, *A burst-based unsupervised method for detecting review spammer groups*, Information Sciences 536:454–469 | GSDB = *Group Spam Detection algorithm based on review Burst*. Passo 1: acha produtos-alvo pela **distribuição de notas anômala**. Passo 2: gera grupos candidatos a partir das **rajadas**, com estimativa de densidade por kernel (KDE). | **Distribuição de notas anômala + rajada**, combinadas. O KDE é trocado por uma contagem por dia, que basta com poucas avaliações. |
| **Hu, Zhang & Pavlou (2009)**, *Overcoming the J-shaped Distribution of Product Reviews*, CACM 52(10) | A distribuição de notas **normal** de reviews é em J (muitas 5★, algumas 1★) por viés de autosseleção, e a média sozinha é um mau indicador. | **Cuidado:** uma distribuição em J **não** é sinal de risco por si só. O sinal é **"só 5★ com pouca base"**: nenhuma nota baixa e n pequeno. |
| **Mukherjee et al. (ICWSM 2013)**, *What Yelp Fake Review Filter Might Be Doing?* | No Yelp, os sinais de **comportamento** funcionaram bem melhor que os linguísticos. | Priorizar sinais de comportamento (tempo, volume, idade), não análise de texto pesada. |
| **Renjith (2018)**, *Detection of Fraudulent Sellers in Online Marketplaces using Support Vector Machine Approach* (arXiv 1805.00464; IJETT) | Usa dados históricos do marketplace num classificador SVM para alertar sobre comportamento de risco do **vendedor** (ex.: produto barato que nunca é enviado). | Reforça que o risco está no **vendedor**, não só na plataforma, e que preço muito abaixo do normal é um sinal. *As features exatas não foram confirmadas (o PDF não abriu).* |
| **Evan Miller (2009)**, *How Not To Sort By Average Rating* | A média simples e a % de positivas favorecem quem tem poucas avaliações. O correto é usar o **limite inferior do intervalo de Wilson**. | **Wilson** para "% positivas" e **média bayesiana** para estrelas. |

**Resumo prático:** com dado público e aritmética simples dá para cobrir os sinais que a literatura
mais repete: **pouco volume, conta nova, concentração temporal, notas só extremas e textos
parecidos**. O ML desses trabalhos serve para *combinar* os sinais. Aqui a combinação é feita com
pesos fixos e travas, que são explicáveis e não precisam de dependência.

---

## 2. Modelo proposto em três camadas

```
                 ┌───────────────────────────┐
  Plataforma  P  │ reliability.js atual       │  peso 0,25
                 └───────────────────────────┘
                 ┌───────────────────────────┐
  Vendedor    V  │ Vbase (sinais positivos)   │  peso 0,55
                 │ − R (pontos de risco)      │
                 └───────────────────────────┘
                 ┌───────────────────────────┐
  Oferta      O  │ fulfillment, preço x mediana│ peso 0,20
                 └───────────────────────────┘
  bruto = 0,25·P + 0,55·V + 0,20·O   →  aplicar TRAVAS  →  classificação
  Em paralelo: nível de CONFIANÇA (quanto dado havia), mostrado separado da nota.
```

### 2.1 Camada Plataforma (P)
É a nota atual de `computeReliability(store)`, sem mudanças. Valores atuais calculados a partir de
`data/stores.json`: AliExpress 80, Shopee 84, Mercado Livre 84, Amazon 88, Magalu 85, KaBuM! 88,
Pichau 84, Terabyte 89. A TikTok Shop está em `stores.json` desligada (`"enabled": false`), com indicadores
estimados (ver `docs/tiktok-shop.md`).

### 2.2 Camada Vendedor (V)
`Vbase` é a média ponderada dos **sinais positivos** (0–100). Depois subtraímos `R`, a soma dos
**pontos de risco** (0–100):

```
V = clamp(Vbase − R, 0, 100)
```

Regras:
- **Sinal ausente** (a página não mostrou o dado): entra com `valorAusente = 40`, que fica abaixo do
  neutro, e **reduz a cobertura** no nível de confiança. O peso **não** é redistribuído.
- **Sinal que não se aplica** (ex.: CNPJ para vendedor estrangeiro no AliExpress): sai do cálculo e
  não conta como ausente.
- **Vendido e entregue pela própria plataforma ou por loja oficial verificada** (Amazon, Magalu,
  KaBuM! e equivalentes): `V = max(V, 90)` e os sinais de "loja nova" não se aplicam, porque o
  vendedor *é* a plataforma.

### 2.3 Camada Oferta (O)
Base 60. **+20** se for fulfillment ou entrega da plataforma (Full do ML, "Vendido e entregue pela
Amazon", Choice do AliExpress, entrega Magalu). **−30** se o preço estiver abaixo de 60% da mediana
das outras lojas para o mesmo produto, porque preço baixo demais é o sinal clássico de risco de não
envio (Renjith 2018). Faixa final: 0–100.

### 2.4 Travas (o vendedor de alto risco limita a nota final)
A média ponderada sozinha deixaria uma plataforma forte "salvar" um vendedor fraco. As travas
impedem isso:

| Trava | Condição | Efeito na nota final |
|---|---|---|
| T1 Risco alto | `R ≥ 45` | no máximo **39** (Alto risco) |
| T2 Risco moderado | `25 ≤ R < 45` | no máximo **54** (Cautela) |
| T3 Bloqueio | CNPJ com situação ≠ ATIVA, **ou** termômetro do ML vermelho/laranja | no máximo **39** (Alto risco) |
| T4 Pouca confiança | confiança `< 40` | no máximo **69** (Regular): sem dado não existe "Bom" nem "Excelente" |

### 2.5 Classificação final (mantém os limites atuais e cria "Alto risco")

| Classe | Nota final |
|---|---|
| Excelente | ≥ 85 |
| Bom | 70–84 |
| Regular | 55–69 |
| Cautela | 40–54 |
| Alto risco | < 40 |

---

## 3. Tabela de sinais

Funções auxiliares (todas sem dependência):

```js
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
// 3-gramas de caracteres, sem acento/pontuação
const grams = s => { s = ' ' + s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  const g = new Set(); for (let i = 0; i < s.length - 2; i++) g.add(s.slice(i, i + 3)); return g; };
const jaccard = (a, b) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i); };
```

### 3.1 Sinais positivos (compõem `Vbase`, cada um 0–100)

| Sinal | Como medir com dado público | Fórmula simples em JS | Peso | Referência |
|---|---|---|---|---|
| Nota do vendedor (média bayesiana) | Estrelas médias e nº de avaliações do vendedor (ou do anúncio, se só houver isso) | `b = (C*m + n*media)/(C+n)` com `m=3.5`, `C=20`; `score = clamp((b-1)/4*100)` | 0,20 | Média bayesiana (prior); Miller 2009 |
| % positivas (Wilson) | "% avaliações positivas" (AliExpress, Amazon) + total | `wilsonLB(pos,n,z=1.96) = (p + z²/2n − z·√((p(1−p) + z²/4n)/n)) / (1 + z²/n)`; `score = 100*wilsonLB` | 0,10 | Wilson; Miller 2009 |
| Volume de vendas | "X vendas" / "X vendidos" do vendedor | `clamp(Math.log10(Math.max(1, vendas))/4*100)` (10 mil vendas = 100) | 0,20 | Volume como pré-requisito (Jindal & Liu; MercadoLíder exige volume) |
| Idade da loja | "Loja aberta em", "Ingressou há", `registration_date` (ML) | `clamp(100*Math.sqrt(dias/730))` (2 anos = 100; 23 dias ≈ 18) | 0,20 | Conta nova é sinal recorrente (Fei 2013; Mukherjee 2013) |
| Reputação nativa da loja | ML: `level_id` 5_green=100, 4_light_green=80, 3_yellow=50, 2_orange=20, 1_red=0, sem cor (novo)=30; MercadoLíder +10 (máx. 100). Shopee: Mall/Oficial=95, Indicado=80, sem selo=40. AliExpress: Official Store=90, sem selo=ausente. Amazon: % positivas 12 meses (via Wilson). TikTok: nota da loja (via bayesiana) | tabela de conversão em `seller-score.json` | 0,20 | Sistemas de reputação das próprias lojas |
| CNPJ | BrasilAPI `/api/cnpj/v1/{cnpj}`: `descricao_situacao_cadastral`, `data_inicio_atividade` | ATIVA e ≥ 2 anos = 100; ATIVA e < 2 anos = `40 + 60*dias/730`; diferente de ATIVA → trava T3; estrangeiro = não se aplica | 0,10 | Receita Federal via BrasilAPI |
| Vendido pela plataforma / oficial | Selo "Vendido e entregue por …", "Loja oficial" | `if (oficial) V = Math.max(V, 90)` | override | Lojas |

### 3.2 Sinais de risco (somam `R`; `pontos = intensidade (0–1) × pontos máximos`)

| Sinal de risco | Como medir com dado público | Intensidade em JS | Pontos máx. | Referência |
|---|---|---|---|---|
| Loja nova | Idade da loja em dias | `dias < 90 ? (90 - dias)/90 : 0` | 15 | Fei 2013; Mukherjee 2013 |
| Poucas vendas | Nº de vendas | `vendas < 50 ? (50 - vendas)/50 : 0` | 10 | Volume / Renjith 2018 |
| Rajada de avaliações | Datas das avaliações (n ≥ 3) | `maxDia = máx. de avaliações num dia / total`; `bst = dias(1ª→última) < 28 ? 1 - dias/28 : 0`; `Math.max(maxDia, bst)` | 20 | Mukherjee 2013 (MNR, BST); Fei 2013; Li 2016; GSDB 2020 |
| Notas só extremas com pouca base | Distribuição de estrelas | se não há nenhuma nota de 1–3★: `share5 * (1 - Math.min(n,50)/50)`; senão 0 | 10 | Mukherjee 2013 (EXT); GSDB 2020; Hu et al. 2009 (o J normal **não** é penalizado) |
| Idioma estrangeiro | Bandeira/país da avaliação (AliExpress mostra) ou heurística de stopwords PT | `estrangeiras / total`. Heurística: texto com ≥ 3 palavras e < 10% de stopwords PT (`de, que, o, a, e, não, muito, bom, chegou, produto…`) = estrangeiro | 15 (Shopee/ML/Magalu/BR); **8** no AliExpress, onde avaliação estrangeira é comum | Caso real; Mukherjee 2013 (sinal de contexto) |
| Textos parecidos | Textos das avaliações (n ≥ 3) | média do `jaccard(grams(a), grams(b))` entre pares; `clamp((sim - 0.25)/0.25*100)/100` | 15 | Jindal & Liu 2008; Mukherjee 2013 (CS) |
| CNPJ recente | `data_inicio_atividade` < 180 dias | `(180 - dias)/180` | 10 | BrasilAPI |
| Preço implausível | Preço < 60% da mediana das outras lojas | entra na camada O (−30) | — | Renjith 2018 |

**Referência para calibrar a similaridade:** num teste com 5 avaliações genuínas inventadas em
português, a média de Jaccard (3-gramas) deu **0,07**. As 5 avaliações curtas e genéricas do caso de
teste deram **0,53**. O limiar de 0,25 fica bem no meio.

**Limites de amostra:** rajada e similaridade só valem com n ≥ 3 avaliações com data ou texto. Com
menos, o sinal fica "ausente", o que reduz a confiança mas não soma risco.

---

## 4. "Falta de dado reduz a confiança": o nível de confiança

A nota responde **"quão bom parece?"**. A confiança responde **"quanto dado havia para concluir
isso?"**. As duas aparecem separadas na interface, por exemplo **"Cautela · confiança baixa"**.

```js
cobertura = soma dos pesos dos sinais presentes / soma dos pesos aplicáveis   // 0–1
volume    = Math.min(1, Math.log10(1 + nAvaliacoes) / 2)                       // 100 avaliações = 1
confianca = 100 * (0.5 * cobertura + 0.5 * volume)
```

| Confiança | Faixa | Efeito |
|---|---|---|
| Alta | ≥ 70 | nenhum |
| Média | 40–69 | mostrar aviso "poucos dados do vendedor" |
| Baixa | < 40 | trava T4 (máx. Regular) |

---

## 5. Caso de teste: o vendedor real em três formatos

**Fatos do vendedor:** loja aberta há 23 dias (11/10/2026), 5 vendas, 5 avaliações 5★, todas em
idioma estrangeiro, publicadas em 2 dias seguidos (3 em 28/10 e 2 em 29/10). Textos (exemplo
representativo): "Very good product, fast delivery" · "Good product, very fast delivery" · "Very good
quality product" · "Product is very good, recommend" · "Good product fast delivery". O preço está
dentro do normal e não há Choice/Full (O = 60).

### Valores dos sinais (iguais nos três formatos)

| Sinal | Cálculo | Valor |
|---|---|---|
| Nota bayesiana | (20·3,5 + 5·5)/(20+5) = 3,80 → (3,80−1)/4·100 | **70,0** |
| Wilson (5 de 5 positivas) | p=1, n=5, z=1,96 → 0,5655 | **56,6** |
| Vendas | log10(5)/4·100 | **17,5** |
| Idade | 100·√(23/730) | **17,8** |
| Loja nova | (90−23)/90 = 0,744 × 15 | **11,2 pts** |
| Poucas vendas | (50−5)/50 = 0,90 × 10 | **9,0 pts** |
| Rajada | maxDia = 3/5 = 0,60; intervalo 1 dia → bst = 1−1/28 = 0,964; máx = 0,964 × 20 | **19,3 pts** |
| Só 5★ com pouca base | 1,0 × (1 − 5/50) = 0,90 × 10 | **9,0 pts** |
| Similaridade | Jaccard médio 0,534 → (0,534−0,25)/0,25 > 1 → 1,0 × 15 | **15,0 pts** |
| Idioma estrangeiro | 5/5 = 1,0 × (8 no AliExpress, 15 nos demais) | **8 / 15 pts** |

### 5.1 AliExpress (P = 80)
- Dados visíveis: "Loja aberta em" 11/10/2026, 100% de avaliações positivas (5), 5 vendidos,
  avaliações com país. Não é Official Store nem Choice. CNPJ não se aplica.
- `Vbase` = (0,20·70 + 0,10·56,6 + 0,20·17,5 + 0,20·17,8 + 0,20·**40** [reputação ausente]) / 0,90 = **38,6**
- `R` = 11,2 + 9,0 + 19,3 + 9,0 + 8,0 + 15,0 = **71,5** → `V` = clamp(38,6 − 71,5) = **0**
- bruto = 0,25·80 + 0,55·0 + 0,20·60 = **32,0**
- Travas: R ≥ 45 → T1 (máx. 39). Confiança = 100·(0,5·0,778 + 0,5·0,389) = **58 (média)**
- **Resultado: 32 · Alto risco · confiança média.** (Hoje sai 80 · Bom.)

### 5.2 Shopee (P = 84)
- Dados visíveis: nota da loja 5,0 (5 avaliações), "Ingressou há 23 dias", 5 vendidos, sem selo
  Indicado/Mall (40), sem % positivas (ausente), CNPJ não exibido (ausente).
- `Vbase` = 0,20·70 + 0,10·40 + 0,20·17,5 + 0,20·17,8 + 0,20·40 + 0,10·40 = **37,0**
- `R` = 11,2 + 9,0 + 19,3 + 9,0 + 15,0 + 15,0 = **78,5** → `V` = **0**
- bruto = 0,25·84 + 0 + 12 = **33,0** → T1 → **33 · Alto risco** · confiança 60 (média)

### 5.3 Mercado Livre (P = 84)
- Dados visíveis: "+5 vendas", termômetro sem cor (vendedor novo, `level_id` nulo = 30),
  opiniões 5,0 (5), `registration_date` = 23 dias, sem Full, CNPJ não exibido.
- `Vbase` = 0,20·70 + 0,10·40 + 0,20·17,5 + 0,20·17,8 + 0,20·30 + 0,10·40 = **35,0**
- `R` = **78,5** (igual ao Shopee) → `V` = **0** → bruto = **33,0** → T1 → **33 · Alto risco**

### 5.4 Robustez: e se não houver texto nem datas das avaliações?
Sobram só os sinais "loja nova" + "poucas vendas" + "só 5★": R = 11,2 + 9,0 + 9,0 = **29,2**, que já
aciona T2 (máx. 54). No AliExpress, V = 38,6 − 29,2 = 9,4 e bruto = 20 + 5,2 + 12 = **37 → Alto
risco**. Mesmo com o mínimo de dado, o vendedor **não** sai como Bom.

### 5.5 Controle: vendedor estabelecido no ML
MercadoLíder Platinum (5_green = 100), 50 mil vendas, 6 anos, nota 4,8 com 12 mil avaliações, Full,
CNPJ ausente. Vbase = 0,2·94,9 + 0,1·40 + 0,2·100 + 0,2·100 + 0,2·100 + 0,1·40 = 87,0; R = 0;
O = 80; bruto = 21 + 47,9 + 16 = **84,9 → Excelente (arredondado 85) · confiança alta (90)**. O modelo
não pune quem tem histórico.

---

## 6. O que cada loja mostra publicamente sobre o vendedor

| Loja | O que dá para ler | Observações e status |
|---|---|---|
| **Mercado Livre** | Termômetro (cores vermelho → verde-escuro), selo MercadoLíder (Líder/Gold/Platinum), nº de vendas, opiniões do produto. API `/users/{id}`: `seller_reputation.level_id` (ex.: `5_green`), `power_seller_status` (`silver`/`gold`/`platinum`), `transactions` (total, completed, canceled, ratings), `registration_date`. Contas novas aparecem com `level_id: null`. | Requisitos de MercadoLíder variam entre fontes (ex.: 230 vendas e R$ 37 mil em 60 dias para Líder, segundo a Nubimetrics). **Não confirmado** se `/users/{id}` responde sem token em 2026: a documentação mostra exemplos com Bearer e há muitos relatos de 403 em `/sites/MLB/search` desde 2025. O teste daqui foi bloqueado pelo proxy. Plano B: ler a página do vendedor. |
| **Shopee** | Nota da loja (média), nº de avaliações, taxa de resposta (% de chats respondidos em 12 h, segundo a Shopee), tempo de resposta, seguidores, produtos, tempo na plataforma, selos **Shopee Mall/Loja Oficial** e **Vendedor Indicado** (Preferred; seleção automática com métricas semanais). | Os rótulos exatos da página ("Ingressou", "Participou") **não foram confirmados** em fonte oficial. Os critérios do Indicado (nota ~4,5, resposta ~60%) vêm de blogs e **não foram confirmados**. |
| **AliExpress** | % de avaliações positivas da loja, data de abertura da loja, seguidores, selo Official Store, itens **Choice**, vendidos por produto, avaliações com país e data. | Informações vindas de guias e diretórios de terceiros; **não há documentação oficial**. Choice é um selo de oferta e logística, não uma garantia do vendedor. |
| **Amazon** | "Vendido e entregue pela Amazon" (ou "Enviado pela Amazon"); perfil do vendedor com % positivas em 12 meses (se tiver mais de 10 avaliações em 12 meses) ou vitalício, e janelas de 30/90/365 dias. | Regra dos 10 feedbacks vista em fórum do Seller Central, não na página de ajuda ao comprador: **parcialmente confirmado**. |
| **Magalu** | "Vendido e entregue por <nome do lojista>" (nome cadastrado pelo parceiro), avaliações do produto; entrega Magalu/fulfillment. | **Não confirmado** se existe página pública com nota do lojista. |
| **TikTok Shop** | Nota da loja (estrelas) e avaliações. O *Shop Performance Score* (SPS) é métrica interna do Seller Center e só é atribuído com 30+ pedidos em 90 dias. | **Não confirmado** o que o comprador vê no Brasil. Fontes falam de reformulação do sistema de nota em 2026. |
| **KaBuM!** | Separa "vendido e entregue pelo KaBuM!" de "vendido por parceiros (marketplace)". O parceiro cuida de estoque, logística e atendimento. | Política oficial confirmada; o formato da página do parceiro **não foi confirmado**. |
| **Pichau / Terabyte** | — | **Não foi encontrado** marketplace de terceiros. A Terabyte tem "Programa de Parceiros", que é de afiliados, não de vendedores. Tratar como venda própria até prova em contrário. |
| **CNPJ (BrasilAPI)** | `GET https://brasilapi.com.br/api/cnpj/v1/{cnpj}` → `situacao_cadastral` (1 NULA, 2 ATIVA, 3 SUSPENSA, 4 INAPTA, 8 BAIXADA), `descricao_situacao_cadastral`, `data_situacao_cadastral`, `data_inicio_atividade`, `porte`, `opcao_pelo_mei`, `cnae_fiscal`, `capital_social`, `qsa`. Erros: 400 (inválido), 404 (não encontrado), 503 (fonte fora ou timeout de 5 s). | A fonte atual é a **Minha Receita** (minhareceita.org). **Não há limite numérico documentado**: o README pede para não abusar e não fazer crawling automatizado, com volume de "pessoa real". A doc diz que a resposta não deve ir para cache. Proposta: consultar só sob demanda (usuário clica em "verificar CNPJ"), no máximo 1 por anúncio, sem varredura. Projeto com licença MIT. |

---

## 7. Datasets e repositórios (para ideias, não como dependência)

### Datasets (Kaggle e afins)

| Dataset | Conteúdo | Licença | Uso possível |
|---|---|---|---|
| Brazilian E-Commerce Public Dataset by Olist (Kaggle `olistbr/brazilian-ecommerce`) | ~100 mil pedidos (2016–2018), ~3 mil vendedores, ~99 mil reviews (nota 1–5 e texto) | **CC BY-NC-SA 4.0** (fontes secundárias; conferir na página) | Calibrar priors (m, C) e a distribuição de notas "normal" num marketplace brasileiro. **Não comercial**: só para estudo, nunca embarcar no app. |
| Fake Reviews Dataset (Kaggle `mexwell/fake-reviews-dataset`) | ~40 mil reviews rotuladas como geradas por computador ou reais | **Não confirmada** | Testar o limiar de similaridade e idioma offline. |
| YelpChi / Amazon (usados em GNN/fraude; dataset do Yelp a partir de Mukherjee et al. 2013) | Reviews filtradas e não filtradas | Uso acadêmico; **não confirmada** | Validação offline das rajadas. |

Não foi encontrado dataset público **rotulado** de vendedores C2C de risco com licença aberta.

### Repositórios GitHub

| Repositório | Licença | Compatível com MIT? | O que aproveitar como ideia |
|---|---|---|---|
| `safe-graph/UGFraud` (133★) | Apache-2.0 | Sim (copiar código exige manter NOTICE e licença) | Catálogo de algoritmos não supervisionados (SpEagle, FRAUDAR etc.) e features de review. |
| `safe-graph/graph-fraud-detection-papers` (~1,9k★) | sem licença | Só leitura | Lista de artigos para aprofundar. |
| `instacart/wilson_score` | MIT | Sim | Fórmula de Wilson sem dependência. |
| `msn0/wilson-score-interval`, `jaytxng/wilson-score`, `math-utils/wilson-score` | MIT | Sim | Implementações de Wilson em JS (é melhor reescrever as ~5 linhas). |
| `rgmining/fraudar` | GPL-3.0 | **Não** para copiar código | Ideia de subgrafo denso (co-bursting de contas). |
| `arpitbbhayani/ranking-on-ratings` | sem licença | Só leitura | Comparação média simples × bayesiana. |
| `ashishsalunkhe/DeepSpamReview…`, `MiguelSteph/cnn-spam-review-detection-tf` | sem licença | Só leitura | Deep learning, fora do escopo. |
| Repos "seller trust score" (ex.: `Roshini133/Seller_Trust_score`, `FAZILATFATIMA313/TrustNet`) | sem licença | Só leitura | Projetos pequenos (0–1★), sem método reaproveitável. |

Fórmulas e ideias não são protegidas por direito autoral. A proposta é **reimplementar** em poucas
linhas, sem copiar código e sem adicionar dependência.

---

## 8. Proposta de `data/seller-score.json`

```json
{
  "_ajuda": "Pesos, limites e priors do score de VENDEDOR. Proposta inicial: calibre com casos reais. 'pontos' = máximo de pontos de risco de cada sinal.",
  "versao": 1,
  "camadas": { "plataforma": 0.25, "vendedor": 0.55, "oferta": 0.20 },
  "priors": {
    "notaBayesiana": { "m": 3.5, "C": 20 },
    "wilsonZ": 1.96,
    "valorAusente": 40,
    "vendasParaCem": 10000,
    "diasIdadeParaCem": 730
  },
  "pesosVendedor": {
    "nota": 0.20,
    "positivas": 0.10,
    "vendas": 0.20,
    "idade": 0.20,
    "reputacao": 0.20,
    "cnpj": 0.10
  },
  "risco": {
    "lojaNova": { "pontos": 15, "dias": 90 },
    "poucasVendas": { "pontos": 10, "vendas": 50 },
    "rajada": { "pontos": 20, "janelaDias": 28, "minAvaliacoes": 3 },
    "notasExtremas": { "pontos": 10, "baseCheia": 50 },
    "idiomaEstrangeiro": { "pontos": 15, "pontosPorLoja": { "aliexpress": 8 }, "minPalavras": 3, "minStopwordsPt": 0.10 },
    "similaridade": { "pontos": 15, "ngrama": 3, "limiar": 0.25, "faixa": 0.25, "minAvaliacoes": 3 },
    "cnpjRecente": { "pontos": 10, "dias": 180 }
  },
  "oferta": {
    "base": 60,
    "bonusFulfillment": 20,
    "precoImplausivel": { "fracaoDaMediana": 0.60, "penalidade": 30 }
  },
  "reputacaoNativa": {
    "mercadolivre": { "5_green": 100, "4_light_green": 80, "3_yellow": 50, "2_orange": 20, "1_red": 0, "semCor": 30, "bonusMercadoLider": 10 },
    "shopee": { "mall": 95, "indicado": 80, "semSelo": 40 },
    "aliexpress": { "officialStore": 90 }
  },
  "oficialOuPlataforma": { "vendedorMinimo": 90 },
  "travas": {
    "riscoAlto": { "R": 45, "notaMaxima": 39 },
    "riscoModerado": { "R": 25, "notaMaxima": 54 },
    "bloqueio": { "cnpjNaoAtivo": true, "mlTermometro": ["1_red", "2_orange"], "notaMaxima": 39 },
    "confiancaBaixa": { "confianca": 40, "notaMaxima": 69 }
  },
  "confianca": { "pesoCobertura": 0.5, "pesoVolume": 0.5, "avaliacoesParaCem": 100, "alta": 70, "media": 40 },
  "classes": { "Excelente": 85, "Bom": 70, "Regular": 55, "Cautela": 40, "Alto risco": 0 },
  "naoSeAplica": { "aliexpress": ["cnpj"] },
  "cnpj": { "fonte": "https://brasilapi.com.br/api/cnpj/v1/{cnpj}", "sobDemanda": true, "maxPorAnuncio": 1, "cache": false }
}
```

### Filtro "só vendedor bom" (modo Por loja, 3.0)

`src/por-loja.js` usa a nota final de cada oferta (`offer.trust`) para separar três grupos, com as regras de `data/search-rules.json`:

- **Aparece:** nota ≥ 70 (classe "Bom"), sem preço suspeito.
- **Sem dados do vendedor:** confiança < 40 (a trava T4 da tabela acima) **e** nenhuma trava de risco (T1, T2, T3). A oferta não some: fica num grupo próprio.
- **Oculto, com o motivo:** nota abaixo de 70, travas de risco ou preço suspeito. O motivo é a nota, a palavra do carimbo e o principal sinal, por exemplo "nota 35: alto risco — loja aberta há 18 dias". Pontos positivos ("48.000 vendas") não servem de motivo.

`vendedorAprovado(offer, minScore)` usa a mesma regra para Fixados, alertas e Ofertas. Falta de dado não aprova.

**Limitação conhecida:** sem o número de avaliações, um vendedor grande do Mercado Livre (termômetro verde, dezenas de milhares de vendas) fica com confiança 30 e cai em "Sem dados do vendedor". Os dados que faltam (avaliações e % positivas) só chegam pela API oficial ou pela extensão. [não verificado ao vivo]

---

## 9. Fontes (acesso em 03/11/2026)

Legenda: ✅ confirmado nas fontes consultadas · ⚠️ confirmado só em parte ou por fonte secundária · ❌ não foi possível confirmar.

**Literatura**
- ✅ Jindal, N.; Liu, B. *Opinion Spam and Analysis*. WSDM 2008, p. 219–230. DOI 10.1145/1341531.1341560. https://www.cs.uic.edu/~liub/FBS/opinion-spam-WSDM-08.pdf · https://ir.webis.de/anthology/2008.wsdm_conference-2008.23/
- ✅ Mukherjee, A.; Kumar, A.; Liu, B.; Wang, J.; Hsu, M.; Castellanos, M.; Ghosh, R. *Spotting Opinion Spammers using Behavioral Footprints*. KDD 2013, p. 632–640. DOI 10.1145/2487575.2487580. https://dblp.org/rec/conf/kdd/MukherjeeKLWHCG13 · https://www2.cs.uh.edu/~arjun/papers/KDD-13-latent-spam-camera_submit_final.pdf. ⚠️ A lista de features (CS, MNR, BST, EXT, DEV, RFR) veio de resumos secundários; o PDF não abriu nesta sessão.
- ✅ Fei, G.; Mukherjee, A.; Liu, B.; Hsu, M.; Castellanos, M.; Ghosh, R. *Exploiting Burstiness in Reviews for Review Spammer Detection*. ICWSM 2013, v. 7, p. 175–184. DOI 10.1609/icwsm.v7i1.14400. https://ojs.aaai.org/index.php/ICWSM/article/view/14400. ⚠️ A fórmula `BST = 1 − dias/28` (limiar 0,8) foi vista em patente que cita o trabalho (https://patents.google.com/patent/US20170221111A1/en), não no PDF original.
- ✅ Li, H.; Fei, G.; Wang, S.; Liu, B.; Shao, W.; Mukherjee, A.; Shao, J. *Modeling Review Spam Using Temporal Patterns and Co-bursting Behaviors*. arXiv:1611.06625 (21/11/2016). https://arxiv.org/abs/1611.06625. ⚠️ A versão WWW 2017 ("Bimodal Distribution and Co-Bursting in Review Spam Detection") vem do AMiner.
- ✅ Ji, S.; Zhang, Q.; Li, J.; Chiu, D. K. W.; Xu, S.; Yi, L.; Gong, M. *A burst-based unsupervised method for detecting review spammer groups* (GSDB). Information Sciences 536 (2020) 454–469. DOI 10.1016/j.ins.2020.05.084. https://www.sciencedirect.com/science/article/abs/pii/S0020025520305120 · https://dblp.org/rec/journals/isci/JiZLCXYG20. O nome **GSDB existe** e é desse trabalho. ⚠️ A fórmula exata da "distribuição de notas anômala" não foi lida (paywall).
- ✅ Renjith, S. *Detection of Fraudulent Sellers in Online Marketplaces using Support Vector Machine Approach*. arXiv:1805.00464 (17/04/2018); IJETT. https://arxiv.org/abs/1805.00464. ❌ Features e resultados não confirmados (arxiv.org bloqueado nesta sessão).
- ✅ Hu, N.; Zhang, J.; Pavlou, P. A. *Overcoming the J-shaped Distribution of Product Reviews*. CACM 52(10):144–147, 2009. DOI 10.1145/1562764.1562800. https://ink.library.smu.edu.sg/sis_research/780
- ✅ Mukherjee, A.; Venkataraman, V.; Liu, B.; Glance, N. *What Yelp Fake Review Filter Might Be Doing?* ICWSM 2013, p. 409–418. DOI 10.1609/icwsm.v7i1.14389. https://ojs.aaai.org/index.php/ICWSM/article/view/14389
- ✅ Miller, E. *How Not To Sort By Average Rating* (2009). https://evanmiller.org/how-not-to-sort-by-average-rating.html · *Ranking Items With Star Ratings*: https://www.evanmiller.org/ranking-items-with-star-ratings.html

**Lojas**
- ⚠️ Mercado Livre, reputação de vendedores (campos `level_id`, `power_seller_status`, `transactions`): https://developers.mercadolivre.com.br/pt_br/reputacao-de-vendedores · consulta de usuários: https://developers.mercadolibre.com.ar/servicios-consulta-usuarios · erro 403: https://developers.mercadolivre.com.br/erro-403. ❌ Acesso sem token a `/users/{id}` não foi testado (proxy bloqueou).
- ⚠️ Relatos de 403 na busca pública do ML: https://www.reclameaqui.com.br/mercado-livre/erro-403-forbidden-no-endpoint-de-busca-publica-de-anuncios-da-api-do-mercado-livre_kl_Q1h2_x_sPnREJ/
- ⚠️ Requisitos MercadoLíder (terceiros, números divergentes): https://academia.nubimetrics.com/br/mercadolider · https://tray.com.br/escola/mercadolider/
- ⚠️ Shopee, taxa de resposta em 12 h (resposta da Shopee no Reclame Aqui): https://www.reclameaqui.com.br/shopee/taxa-de-respostas_yPBDU4sMMsD30u2-/ · Vendedor Indicado (blogs): https://ecommercenapratica.com/blog/vendedor-indicado-shopee/ · https://gosmarter.com.br/vendedor-indicado-shopee-preferred/
- ⚠️ AliExpress, nota, data de abertura e selos (terceiros): https://aliexpress-bot-website.pages.dev/en/blog/aliexpress-seller-ratings-how-to-read/ · https://findniche.com/aliexpress-store · Choice: https://www.androidauthority.com/aliexpress-new-choice-offering-makes-shopping-easier-than-ever-3301737/
- ⚠️ Amazon, % positivas 12 meses × vitalício: https://sellercentral-europe.amazon.com/seller-forums/discussions/t/2013f074-d88f-423e-bf52-f14b2c8f2b9d · https://docs.trajectdata.com/rainforestapi/product-data-api/results/seller-profile
- ⚠️ Magalu, "Vendido e entregue por": https://blog.bling.com.br/como-vender-magalu-marketplace/ · https://tray.com.br/escola/parceiro-magalu/
- ⚠️ TikTok Shop SPS (terceiros): https://printify.com/blog/tiktok-shop-performance-score/ · https://www.lengow.com/get-to-know-more/what-is-the-shop-performance-score-sps-on-tiktok-shop · ❌ nota visível ao comprador no Brasil não confirmada.
- ✅ KaBuM!, políticas (próprio × parceiros): https://www.kabum.com.br/politicas · marketplace: https://www.kabum.com.br/hotsite/marketplace
- ⚠️ Terabyte, Programa de Parceiros (afiliados): https://www.terabyteshop.com.br/site/regras-programa-de-parceiros · ❌ Pichau: nenhuma informação sobre marketplace encontrada.

**CNPJ**
- ✅ BrasilAPI, especificação CNPJ: https://raw.githubusercontent.com/BrasilAPI/BrasilAPI/main/pages/docs/doc/cnpj.json · serviço (fonte Minha Receita, timeout 5 s): https://raw.githubusercontent.com/BrasilAPI/BrasilAPI/main/services/cnpj.js · README (uso responsável, sem crawling): https://raw.githubusercontent.com/BrasilAPI/BrasilAPI/main/README.md · repositório (MIT): https://github.com/BrasilAPI/BrasilAPI. ❌ Limite numérico de requisições: não documentado.

**Datasets e repositórios**
- ⚠️ Olist (CC BY-NC-SA 4.0, fonte secundária): https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce · https://scripts-and-tables.github.io/daa/data/
- ❌ Fake Reviews Dataset, licença não confirmada: https://www.kaggle.com/datasets/mexwell/fake-reviews-dataset
- ✅ Licenças via API de busca do GitHub: https://github.com/safe-graph/UGFraud (Apache-2.0) · https://github.com/safe-graph/graph-fraud-detection-papers (sem licença) · https://github.com/instacart/wilson_score (MIT) · https://github.com/msn0/wilson-score-interval (MIT) · https://github.com/rgmining/fraudar (GPL-3.0) · https://github.com/arpitbbhayani/ranking-on-ratings (sem licença)

**Limitações desta pesquisa:** nesta sessão não foi possível abrir arxiv.org, cs.uic.edu, cs.uh.edu,
developers.mercadolivre.com.br, api.mercadolibre.com e brasilapi.com.br (bloqueio de rede). Esses
dados foram confirmados por buscas, pelo dblp e pelo código da BrasilAPI no GitHub. Os pesos e
limites deste documento são **proposta inicial** e precisam ser calibrados com casos reais.
