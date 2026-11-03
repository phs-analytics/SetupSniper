# Impostos de importação em compras internacionais (pessoa física)

Pesquisa para o cálculo de "total final" das ofertas da Amazon, AliExpress e Shopee.
Situação em **03/11/2026**.

> **Aviso:** este documento é uma triagem informativa para orientar o cálculo estimado do app.
> Não é parecer tributário. Regras, alíquotas e listas de empresas mudam com frequência.
> Antes de confiar em um número, confira no checkout da loja e nas fontes oficiais.

## Como a pesquisa foi feita (e o limite dela)

Nesta sessão, as páginas oficiais (gov.br, planalto.gov.br, camara.leg.br, senado.leg.br,
comsefaz.org.br, correios.com.br) **não abriram diretamente**: o acesso foi bloqueado pela rede.
Todo o conteúdo veio de **resultados de busca**. Em alguns casos o buscador mostrou trechos
da própria página oficial. Por isso o grau de confirmação usa quatro níveis:

| Grau | Significado |
|---|---|
| **Oficial (trecho)** | Trecho de página oficial (Receita, Planalto, Comsefaz, SEF estadual) visto no resultado de busca. A página inteira não foi aberta. |
| **Imprensa** | Confirmado por imprensa ou por mais de uma fonte especializada que concordam entre si. |
| **Não confirmado** | Fontes divergem ou só há uma fonte fraca. Fica com `verificar: true`. |

Quando alguém puder abrir os links oficiais da seção "Fontes", vale reler e promover os itens
de "Imprensa" para "Oficial".

---

## 1. Resumo das regras vigentes em 03/11/2026

### 1.1 Imposto de Importação (II), federal, Regime de Tributação Simplificada (RTS)

| # | Regra | Vigência | Grau | Fonte principal |
|---|---|---|---|---|
| R1 | **Remessa Conforme (PRC), pessoa física, valor aduaneiro até US$ 50: II = 0%.** Só o ICMS incide. | DIRs registradas desde **12/05/2026** (algumas fontes dizem que vale desde 13/05/2026). Base: MP 1.357/2026 + Portaria MF 1.342/2026, depois Lei 15.502/2026. | **Oficial (trecho)**. A página "Novas Regras" e a página "Tributação" da Receita aparecem com esse texto. | [Receita, Tributação](https://www.gov.br/receitafederal/pt-br/assuntos/aduana-e-comercio-exterior/manuais/remessas-postal-e-expressa/topicos/tributacao); [Receita, Novas Regras](https://www.gov.br/receitafederal/pt-br/assuntos/aduana-e-comercio-exterior/manuais/remessas-postal-e-expressa/regras-futuras) |
| R2 | **Remessa Conforme, pessoa física, US$ 50,01 a US$ 3.000: II = 60% do valor aduaneiro, menos uma dedução fixa equivalente a US$ 30.** | Desde 12/05/2026. Antes disso a dedução era de US$ 20. | **Oficial (trecho)** para 60% com US$ 30 (Receita, Tributação). Alguns blogs ainda citam US$ 20, mas estão desatualizados. | Mesmas fontes de R1 |
| R3 | **Fora do Remessa Conforme (site não certificado, ou envio entre pessoas), até US$ 3.000: II = 60% do valor aduaneiro, sem dedução**, inclusive abaixo de US$ 50. | Regra geral do RTS, mantida em 2026. | **Oficial (trecho)**: exemplo da Receita em "Quanto vou pagar de impostos?" usa 60% sem desconto. Confirmado também por imprensa. | [Receita, Quanto vou pagar](https://www.gov.br/receitafederal/pt-br/assuntos/aduana-e-comercio-exterior/manuais/remessas-postal-e-expressa/preciso-pagar-impostos-nas-compras-internacionais/quanto-pagarei-de-imposto) |
| R4 | **Pessoa jurídica comprando em plataforma do PRC não tem a alíquota zero.** Paga 60%. | Desde 12/05/2026 | **Imprensa** (Econet) | [Econet](https://blog.econeteditora.com.br/remessa-conforme-o-que-muda-com-a-portaria-mf-1-342-2026/) |
| R5 | **Acima de US$ 3.000**, o RTS não se aplica. A compra vai para a importação comum (fora do escopo do app). | Regra antiga, mantida | **Imprensa** | [Toexceed](https://toexceed.com.br/blog/2026/09/12/receita-federal-e-encomendas-internacionais-como-funciona-a-fiscalizacao-tributacao-e-liberacao/) |
| R6 | **Lei 15.502/2026 permite ao Ministério da Fazenda baixar a faixa US$ 50,01 a US$ 3.000 para até 30%.** **Não encontrei nenhum ato que tenha feito isso até 03/11/2026.** Considerar 60% em vigor. | Lei de 10/09/2026; redução depende de portaria | Autorização: **Imprensa** (Fecomércio-RS, Forbes). Ausência de portaria: **não confirmado**, `verificar: true`. | [Fecomércio-RS](https://www.fecomercio-rs.org.br/noticiadetalhe/2026/09/14/lei-n-155022026-altera-tributacao-das-remessas-internacionais-de-pequeno-valor/20d26f02-463f-4006-845e-992bf177c882); [Forbes](https://forbes.com.br/forbes-money/2026/09/taxa-das-blusinhas-veja-como-ficam-as-compras-internacionais/) |
| R7 | **A lei permite limites de quantidade e de frequência** para a alíquota reduzida de pessoa física, contra o fracionamento de pedidos. **Nenhum limite concreto foi encontrado até agora.** | Lei 15.502/2026; depende de regulamentação | **Imprensa**. Os limites estão **não confirmados**. | [Mix Vale](https://www.mixvale.com.br/2026/09/11/nova-lei-elimina-imposto-de-importacao-em-compras-internacionais-de-ate-us-50-e-define-regras/) |

Uma fonte (Canal Rural, maio/2026) diz que a portaria de maio **já** reduziu a faixa acima de US$ 50 para 30%.
Fontes posteriores (E-Commerce Brasil em agosto, Forbes em setembro, a Receita em "Tributação") dizem que a faixa segue em **60% com dedução de US$ 30**.
Este documento adota **60% − US$ 30**.

### 1.2 ICMS, estadual

| # | Regra | Grau | Fonte |
|---|---|---|---|
| R8 | **O ICMS incide sempre**, inclusive na faixa com II zero. A alíquota fica entre **17% e 20%**, conforme a UF de destino. Algumas fontes indicam 18% no AP e 19% no PA (ver tabela). | **Oficial (trecho)** para "17% a 20% conforme o Estado" (Receita). A alíquota por UF fica entre Oficial (trecho) e não confirmado, conforme a seção 2. | Receita, Tributação; [Comsefaz](https://comsefaz.org.br/novo/informacoes-fiscais/) |
| R9 | **ICMS "por dentro"**: `ICMS = ((valor aduaneiro + II) / (1 − alíquota)) × alíquota`. O valor aduaneiro é produto + frete + seguro. | **Oficial (trecho)**. A Receita traz exatamente esse exemplo: (49 + 5 + 3 + 34,20) / 0,83 = 109,88; 109,88 × 17% = 18,68. | Receita, Quanto vou pagar |

### 1.3 Pontos específicos pedidos

| Pergunta | Resposta | Grau |
|---|---|---|
| O valor aduaneiro inclui frete e seguro? | **Sim.** Valor aduaneiro é bens + frete + seguro, e a faixa de US$ 50 é medida sobre ele. Um item de US$ 46 com frete de US$ 5 (total US$ 51) sai da faixa zero. | **Oficial (trecho)**, Receita, Tributação |
| A faixa de US$ 50 vale por remessa ou por pedido? | **Por remessa (declaração de importação, a DIR).** O texto legal fala em "remessas cujo valor não ultrapasse US$ 50", e o cálculo é feito por DIR. Um pedido com vários pacotes pode virar várias remessas, e vários itens num pacote formam uma remessa só. A Lei 15.502 prevê medidas contra o "fracionamento artificial". | Remessa: **Imprensa / Oficial (trecho)**. Como cada plataforma agrupa os itens: **não confirmado**, `verificar: true`. |
| Que cotação de câmbio é usada? | A Receita diz que o valor em moeda estrangeira é convertido pela **taxa de câmbio da data de registro da declaração**. A norma geral (Portaria MF 6/1999 e as tabelas do Siscomex) usa a taxa fiscal derivada da **PTAX de venda do Bacen**, divulgada num dia para uso no dia seguinte. **Não confirmei** qual PTAX exata vale para a DIR de remessas. No PRC, a plataforma cobra no checkout com uma cotação **própria**, que também não está confirmada. | Data de registro: **Oficial (trecho)**. PTAX de qual dia: **não confirmado**. Por isso o app deve usar `cotacao.modo = "manual"`. |
| Taxa de despacho postal dos Correios ainda existe? | **Sim, segundo a imprensa de 2026: R$ 15,00 por encomenda** tributada que chega pelos Correios sem os impostos pagos na origem (fora do PRC). Compras do PRC, com imposto pago no checkout, **não pagam**, segundo a imprensa. Uma fonte mais antiga cita R$ 16,50. Transportadoras expressas (courier) têm taxas próprias. | **Imprensa**, `verificar: true` para o valor |

### 1.4 Histórico recente (2023–2026)

- **01/08/2023**: começa o Remessa Conforme (Portaria MF 612/2023 e IN RFB 2.146/2023). Até US$ 50 no PRC: II 0%. O ICMS fica unificado em **17%** (Convênio ICMS 81/2023).
- **Out–dez/2023**: certificações por ADE Coana. AliExpress e Shopee entram (set/out 2023). Amazon é certificada pelo ADE Coana 10, de 03/11/2023.
- **01/08/2024**: a "taxa das blusinhas" (Lei 14.902/2024, Programa Mover, regulamentada por portaria MF). No PRC: **20%** até US$ 50, e **60% com dedução de US$ 20** de US$ 50,01 a US$ 3.000. Fora do PRC: 60% sem dedução.
- **01/04/2025**: o Convênio ICMS 135/2024 autoriza 20%. Nove UFs sobem para **20%** (AC, AL, BA, CE, PB, PI, RN, RR, SE), segundo a tabela do Comsefaz. MG anunciou 20%, mas revogou e ficou em 17%. As listas de imprensa divergem quanto ao AP.
- **Jan/2026**: segundo a imprensa, o PA sobe para 19%. Não confirmado.
- **12/05/2026**: a **MP 1.357/2026** (DOU extra) autoriza zerar o II até US$ 50, e a **Portaria MF 1.342/2026** aplica II **0%** até US$ 50 (PF, PRC) e eleva a dedução para **US$ 30**. Na mesma época, a Portaria Coana 193/2026 cria selos e critérios de exclusão do PRC (desempenho abaixo de 98%).
- **10/09/2026**: a MP é convertida na **Lei 15.502/2026**. A lei mantém a autorização para II zero até US$ 50 e permite reduzir a faixa até US$ 3.000 para até 30% (ainda sem ato). Também permite limites de quantidade e frequência para PF, alíquota zero para medicamentos de doenças raras e obrigações antifraude para as plataformas.

---

## 2. ICMS por UF, remessas internacionais (RTS)

Base: tabela do Comsefaz "Alíquota ICMS import. RTS por UF 17% e 20% (CV 81/23)", versões de abril e maio de 2025, vista em trechos de busca.
Existe uma versão de **22/12/2025** que não consegui ler. Confira nela.

| UF | Alíquota | Grau | Observação |
|---|---|---|---|
| AC | 20% | Oficial (trecho) + imprensa | Desde 01/04/2025 |
| AL | 20% | Oficial (trecho) + imprensa | Desde 01/04/2025 |
| AP | 18% | **Não confirmado** | Imprensa de 2025 dizia 20%; fontes de 2026 dizem 18% |
| AM | 17% | Imprensa (2025) | verificar |
| BA | 20% | Oficial (trecho) + imprensa | Desde 01/04/2025 |
| CE | 20% | Oficial (trecho) + imprensa | Desde 01/04/2025 |
| DF | 17% | Imprensa (2025) | Podia subir por decreto a partir de 2026; verificar |
| ES | 17% | Imprensa (2025) | verificar |
| GO | 17% | Imprensa (2025) | verificar |
| MA | 17% | Imprensa (2025) | Podia subir por decreto a partir de 2026; verificar |
| MT | 17% | Imprensa (2025) | verificar |
| MS | 17% | Imprensa (2025) | verificar |
| MG | 17% | Oficial (trecho, SEF/MG) + imprensa | O decreto de 20% foi revogado em 01/04/2025 |
| PA | 19% | **Não confirmado** | Imprensa de 2026: subiu de 17% para 19% em jan/2026 |
| PB | 20% | Oficial (trecho) + imprensa | Desde 01/04/2025 |
| PR | 17% | Imprensa (2025) | verificar |
| PE | 17% | Imprensa (2025/2026) | verificar |
| PI | 20% | Oficial (trecho) + imprensa | Desde 01/04/2025 |
| RJ | 17% | **Não confirmado** | Uma fonte de 2026 cita 20%; o restante diz 17%. verificar |
| RN | 20% | Oficial (trecho) + imprensa | Desde 01/04/2025 |
| RS | 17% | Imprensa (2025) | verificar |
| RO | 17% | Imprensa (2025) | verificar |
| RR | 20% | Oficial (trecho) + imprensa | Uma lista de imprensa troca RR por AP |
| SC | 17% | Imprensa (2025) | verificar |
| SP | 17% | Imprensa (2025) | Uma fonte cita 18%; verificar |
| SE | 20% | Oficial (trecho) + imprensa | Desde 01/04/2025 |
| TO | 17% | Imprensa (2025) | Podia subir por decreto a partir de 2026; verificar |

**Observação prática:** algumas plataformas subsidiam parte do ICMS ou exibem o preço já com 17% e cobram só a diferença nos estados de 20%, segundo o Diario de Pernambuco (2026).
O app deve tratar o ICMS calculado como **estimativa**.

---

## 3. Fórmula passo a passo

```
1. valorAduaneiroUSD = produto + frete + seguro          (seguro = 0 se não informado)
2. Faixa e II (em US$):
   - Remessa Conforme e pessoa física:
       valorAduaneiro <= 50          -> II = 0
       50 < valorAduaneiro <= 3000   -> II = max(0, valorAduaneiro × 60% − 30)
   - Fora do Remessa Conforme (<= 3000):
                                        II = valorAduaneiro × 60%
3. ICMS por dentro (alíquota a da UF):
       baseICMS = (valorAduaneiro + II) / (1 − a)
       ICMS     = baseICMS × a
4. total (US$) = valorAduaneiro + II + ICMS  (= baseICMS)
5. total (R$)  = total (US$) × cotação       (+ R$ 15 de despacho postal, só fora do PRC via Correios; verificar)
```

**Atenção ao "degrau" de US$ 50:** com a dedução de US$ 30, o II logo acima de US$ 50 é quase zero (US$ 50,01 × 60% − 30 ≈ US$ 0,006).
A dedução só "zera" no limite de US$ 50. O II cresce aos poucos a partir daí, sem salto brusco.

### Exemplos. Cotação **ilustrativa** de R$ 5,50 por US$ 1; ICMS de 17% (SP) e de 20% (BA)

**A) Produto US$ 40 + frete US$ 5 = valor aduaneiro US$ 45**

| Cenário | II | Base ICMS (por dentro) | ICMS | Total US$ | Total R$ (×5,50) |
|---|---|---|---|---|---|
| PRC, ICMS 17% | 0,00 | 45 / 0,83 = 54,22 | 9,22 | **54,22** | **298,19** |
| PRC, ICMS 20% | 0,00 | 45 / 0,80 = 56,25 | 11,25 | **56,25** | **309,38** |
| Fora do PRC, 17% | 45 × 0,6 = 27,00 | 72 / 0,83 = 86,75 | 14,75 | **86,75** | **477,11** (+ R$ 15 Correios?) |
| Fora do PRC, 20% | 27,00 | 72 / 0,80 = 90,00 | 18,00 | **90,00** | **495,00** (+ R$ 15 Correios?) |

**B) Valor aduaneiro US$ 120 (produto + frete)**

| Cenário | II | Base ICMS | ICMS | Total US$ | Total R$ |
|---|---|---|---|---|---|
| PRC, 17% | 120 × 0,6 − 30 = 42,00 | 162 / 0,83 = 195,18 | 33,18 | **195,18** | **1.073,49** |
| PRC, 20% | 42,00 | 162 / 0,80 = 202,50 | 40,50 | **202,50** | **1.113,75** |
| Fora do PRC, 17% | 120 × 0,6 = 72,00 | 192 / 0,83 = 231,33 | 39,33 | **231,33** | **1.272,29** |
| Fora do PRC, 20% | 72,00 | 192 / 0,80 = 240,00 | 48,00 | **240,00** | **1.320,00** |

**C) Caso de borda: produto US$ 48 + frete US$ 5 = US$ 53 (PRC, 17%)**
II = 53 × 0,6 − 30 = 1,80. Base = 54,80 / 0,83 = 66,02. ICMS = 11,22. Total de US$ 66,02 (R$ 363,13).
O frete tirou o pedido da faixa de II zero, mas o II ficou pequeno.

Conferência com o exemplo oficial da Receita, fora do PRC e em reais: (49 + 5 + 3 + 34,20) / 0,83 = 109,88, e ICMS = 18,68.
A fórmula acima reproduz o resultado.

---

## 4. Amazon, AliExpress e Shopee no Remessa Conforme

| Loja | Situação no PRC | Desde | Grau |
|---|---|---|---|
| **AliExpress** | Certificada | Registro em 18/09/2023; começou a operar pelo PRC em ~15/10/2023 | Imprensa (FazComex, Remessa Online). Número do ADE não confirmado. |
| **Shopee** (SHPS Tecnologia e Serviços) | Certificada | ~09/10/2023 | Imprensa (InfoMoney, Money Times, Suno). Número do ADE não confirmado. |
| **Amazon** (Amazon Serviços de Varejo do Brasil) | Certificada para compras em **amazon.com.br e amazon.com** | ADE Coana 10, de 03/11/2023. Foi **revogado e substituído** pelo ADE Coana 51, de 01/08/2025, com alterações em 15/09/2025, 07/01/2026, 12/03/2026, 31/03/2026 e 21/10/2026. | **Oficial (trecho)**: índice de normas da Receita. O conteúdo das alterações não foi lido. |

**Alguma saiu?** Não encontrei exclusão de nenhuma das três. A substituição do ADE da Amazon em 2025 foi uma reemissão da certificação, não uma saída.
Desde maio/2026 a Portaria Coana 193/2026 prevê exclusão por desempenho abaixo de 98%. Vale checar a lista oficial de empresas certificadas de tempos em tempos (`verificar: true`).

**Os impostos já vêm no preço?** Nas plataformas do PRC, os impostos (II e ICMS) são **cobrados no checkout**, e a entrega não tem cobrança extra (Receita, "Novas Regras": "o comprador paga todos os impostos no momento da compra").
Na **página do produto**, porém, o preço exibido **nem sempre** inclui os impostos. Em geral eles aparecem discriminados no carrinho ou checkout. A Amazon mostra "Depósito de taxas de importação" ou "Impostos de importação" estimados. Para o app, isso significa:

- não somar imposto duas vezes: se o preço coletado já for "com impostos", não aplicar a fórmula;
- se o preço for da página do produto (sem imposto), aplicar a fórmula como estimativa.

Como cada plataforma exibe isso hoje: **não confirmado**, `verificar: true`.

### Produtos de vendedores nacionais

Mercadoria vendida e enviada **de dentro do Brasil** não passa pela alfândega na compra do consumidor, então **não tem II nem ICMS-importação** para quem compra.
O vendedor nacional (ou quem importou o estoque) já recolheu os tributos e emite nota fiscal brasileira, com ICMS de operação interna embutido no preço. Para o app, o preço exibido é o preço final (fora o frete).
Grau: **Imprensa** (guias de 2026), coerente com a regra legal (o RTS só se aplica a remessas internacionais).

### Como identificar na página (textos típicos)

| Loja | Nacional (sem imposto de importação) | Internacional (aplicar regra) |
|---|---|---|
| AliExpress | "Envio do Brasil", "Enviado do Brasil", "Envio nacional", aba/filtro "Choice BR", "Entrega rápida do Brasil" | "Enviado da China" ou de outro país, "Envio internacional", selo/aviso "Remessa Conforme", "Impostos incluídos" no checkout |
| Shopee | Campo "Enviado de: \<cidade/UF brasileira\>" (ex.: "São Paulo") | "Enviado de: China Continental" ou de outro país, "Internacional", filtro "Envio internacional" |
| Amazon | "Vendido e enviado por Amazon" (amazon.com.br), "Enviado por Amazon" (FBA, estoque no Brasil), vendedor parceiro com envio do Brasil | "Envio Internacional", "Vendido por Amazon.com" ou "Amazon US", "Enviado do exterior", "Inclui depósito de impostos de importação", prazo longo vindo dos EUA ou China |

Grau: os termos de Shopee ("Enviado de") e AliExpress ("Enviado do Brasil" e Choice BR) aparecem em fontes de imprensa e guias.
Os demais rótulos são **típicos, mas não confirmados** como texto exato atual (`verificar: true`). As plataformas mudam esses textos sem aviso.
Na dúvida, o app deve marcar a oferta como "origem incerta" em vez de supor nacional.

---

## 5. Proposta de conteúdo para `data/taxes.json`

Proposta apenas. O arquivo atual não foi alterado. Os valores marcados com `verificar: true` precisam de checagem antes do uso.

```json
{
  "_ajuda": "Regras de impostos de importação (RTS) para pessoa física. Só as lojas em importTaxStores têm o imposto calculado; as outras são tratadas como nacionais. Valores com verificar=true não foram confirmados em fonte oficial. Triagem informativa, não é parecer tributário.",
  "atualizadoEm": "2026-11-03",
  "importTaxStores": ["amazon", "aliexpress", "shopee"],
  "baseInclui": ["produto", "frete", "seguro"],
  "formulaIcms": "por_dentro",
  "cotacao": {
    "modo": "manual",
    "observacao": "A Receita converte pela taxa de câmbio da data de registro da declaração (DIR). A PTAX exata usada não foi confirmada. No Remessa Conforme a plataforma cobra no checkout com cotação própria. Informe a cotação manualmente (ex.: PTAX venda do dia) e trate o total como estimativa."
  },
  "regras": [
    {
      "id": "prc_pf_ate_50",
      "descricao": "Remessa Conforme, pessoa física, valor aduaneiro até US$ 50: II zero; incide só ICMS.",
      "remessaConforme": true,
      "vigenteDesde": "2026-05-12",
      "fonte": "https://www.gov.br/receitafederal/pt-br/assuntos/aduana-e-comercio-exterior/manuais/remessas-postal-e-expressa/topicos/tributacao",
      "verificar": false,
      "aliquotaII": 0,
      "deducaoUSD": 0,
      "faixaUSD": [0, 50]
    },
    {
      "id": "prc_pf_50_3000",
      "descricao": "Remessa Conforme, pessoa física, US$ 50,01 a US$ 3.000: II de 60% com dedução fixa de US$ 30 (Lei 15.502/2026 permite reduzir para até 30%, sem ato encontrado até 03/11/2026).",
      "remessaConforme": true,
      "vigenteDesde": "2026-05-12",
      "fonte": "https://www.gov.br/receitafederal/pt-br/assuntos/aduana-e-comercio-exterior/manuais/remessas-postal-e-expressa/topicos/tributacao",
      "verificar": true,
      "aliquotaII": 0.60,
      "deducaoUSD": 30,
      "faixaUSD": [50.01, 3000]
    },
    {
      "id": "fora_prc_ate_3000",
      "descricao": "Fora do Remessa Conforme, até US$ 3.000: II de 60% sem dedução, inclusive abaixo de US$ 50.",
      "remessaConforme": false,
      "vigenteDesde": "2024-08-01",
      "fonte": "https://www.gov.br/receitafederal/pt-br/assuntos/aduana-e-comercio-exterior/manuais/remessas-postal-e-expressa/preciso-pagar-impostos-nas-compras-internacionais/quanto-pagarei-de-imposto",
      "verificar": false,
      "aliquotaII": 0.60,
      "deducaoUSD": 0,
      "faixaUSD": [0, 3000]
    }
  ],
  "taxaDespachoPostalBRL": {
    "valor": 15.00,
    "aplicaSe": "fora do Remessa Conforme, entregue pelos Correios com imposto a pagar na chegada",
    "fonte": "https://toexceed.com.br/blog/2026/09/09/importacao-pelos-correios-regras-tributacao-e-como-funciona/",
    "verificar": true
  },
  "icms": {
    "AC": { "aliquota": 0.20, "fonte": "https://comsefaz.org.br/novo/informacoes-fiscais/", "verificar": false },
    "AL": { "aliquota": 0.20, "fonte": "https://comsefaz.org.br/novo/informacoes-fiscais/", "verificar": false },
    "AP": { "aliquota": 0.18, "fonte": "https://www.gabrieldevs.com.br/2026/10/fim-da-taxa-das-blusinhas-quanto-de.html", "verificar": true },
    "AM": { "aliquota": 0.17, "fonte": "https://comsefaz.org.br/novo/informacoes-fiscais/", "verificar": true },
    "BA": { "aliquota": 0.20, "fonte": "https://comsefaz.org.br/novo/informacoes-fiscais/", "verificar": false },
    "CE": { "aliquota": 0.20, "fonte": "https://comsefaz.org.br/novo/informacoes-fiscais/", "verificar": false },
    "DF": { "aliquota": 0.17, "fonte": "https://comsefaz.org.br/novo/informacoes-fiscais/", "verificar": true },
    "ES": { "aliquota": 0.17, "fonte": "https://comsefaz.org.br/novo/informacoes-fiscais/", "verificar": true },
    "GO": { "aliquota": 0.17, "fonte": "https://comsefaz.org.br/novo/informacoes-fiscais/", "verificar": true },
    "MA": { "aliquota": 0.17, "fonte": "https://comsefaz.org.br/novo/informacoes-fiscais/", "verificar": true },
    "MT": { "aliquota": 0.17, "fonte": "https://comsefaz.org.br/novo/informacoes-fiscais/", "verificar": true },
    "MS": { "aliquota": 0.17, "fonte": "https://comsefaz.org.br/novo/informacoes-fiscais/", "verificar": true },
    "MG": { "aliquota": 0.17, "fonte": "https://tribunademinas.com.br/noticias/economia/01-04-2025/governo-de-minas-derruba-decreto-que-aumentava-o-icmssobre-compras-internacionais-comeca-a-valer-em-todo-o-estado.html", "verificar": false },
    "PA": { "aliquota": 0.19, "fonte": "https://portalbenews.com.br/taxa-das-blusinhas-icms-ainda-e-cobrado/", "verificar": true },
    "PB": { "aliquota": 0.20, "fonte": "https://comsefaz.org.br/novo/informacoes-fiscais/", "verificar": false },
    "PR": { "aliquota": 0.17, "fonte": "https://comsefaz.org.br/novo/informacoes-fiscais/", "verificar": true },
    "PE": { "aliquota": 0.17, "fonte": "https://comsefaz.org.br/novo/informacoes-fiscais/", "verificar": true },
    "PI": { "aliquota": 0.20, "fonte": "https://comsefaz.org.br/novo/informacoes-fiscais/", "verificar": false },
    "RJ": { "aliquota": 0.17, "fonte": "https://comsefaz.org.br/novo/informacoes-fiscais/", "verificar": true },
    "RN": { "aliquota": 0.20, "fonte": "https://comsefaz.org.br/novo/informacoes-fiscais/", "verificar": false },
    "RS": { "aliquota": 0.17, "fonte": "https://comsefaz.org.br/novo/informacoes-fiscais/", "verificar": true },
    "RO": { "aliquota": 0.17, "fonte": "https://comsefaz.org.br/novo/informacoes-fiscais/", "verificar": true },
    "RR": { "aliquota": 0.20, "fonte": "https://comsefaz.org.br/novo/informacoes-fiscais/", "verificar": false },
    "SC": { "aliquota": 0.17, "fonte": "https://comsefaz.org.br/novo/informacoes-fiscais/", "verificar": true },
    "SP": { "aliquota": 0.17, "fonte": "https://comsefaz.org.br/novo/informacoes-fiscais/", "verificar": true },
    "SE": { "aliquota": 0.20, "fonte": "https://comsefaz.org.br/novo/informacoes-fiscais/", "verificar": false },
    "TO": { "aliquota": 0.17, "fonte": "https://comsefaz.org.br/novo/informacoes-fiscais/", "verificar": true }
  },
  "lojasRemessaConforme": {
    "amazon": { "certificada": true, "desde": "2023-11-03", "observacao": "ADE Coana 10/2023 substituído pelo ADE Coana 51/2025 (com alterações até 21/10/2026). Vale para amazon.com.br e amazon.com.", "verificar": true },
    "aliexpress": { "certificada": true, "desde": "2023-09-18", "observacao": "Data de registro segundo a imprensa; início da operação ~15/10/2023.", "verificar": true },
    "shopee": { "certificada": true, "desde": "2023-10-09", "observacao": "Data segundo a imprensa.", "verificar": true }
  }
}
```

Campos `remessaConforme`, `taxaDespachoPostalBRL` e `lojasRemessaConforme` são extras, além dos pedidos. Podem ser descartados.

---

## 6. Fontes

Todas foram consultadas em **03/11/2026**. Nenhuma página abriu diretamente nesta sessão. O conteúdo foi lido em trechos e resumos de resultados de busca.

**Oficiais**
- Receita Federal, Tributação (remessas): https://www.gov.br/receitafederal/pt-br/assuntos/aduana-e-comercio-exterior/manuais/remessas-postal-e-expressa/topicos/tributacao
- Receita Federal, Novas Regras (DIR desde 12/05/2026): https://www.gov.br/receitafederal/pt-br/assuntos/aduana-e-comercio-exterior/manuais/remessas-postal-e-expressa/regras-futuras
- Receita Federal, Quanto vou pagar de impostos?: https://www.gov.br/receitafederal/pt-br/assuntos/aduana-e-comercio-exterior/manuais/remessas-postal-e-expressa/preciso-pagar-impostos-nas-compras-internacionais/quanto-pagarei-de-imposto
- Receita Federal, Programa Remessa Conforme: https://www.gov.br/receitafederal/pt-br/assuntos/aduana-e-comercio-exterior/manuais/remessas-postal-e-expressa/programa-remessa-conforme-o-que-e-como-funciona
- Receita Federal, Declaração aduaneira (câmbio): https://receita.economia.gov.br/orientacao/aduaneira/manuais/remessas-postal-e-expressa/topicos/declaracao
- Receita Federal, ADE Coana 10/2023 (Amazon) e índice de normas Coana: https://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=134541
- Lei 15.502/2026 (Planalto): https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/lei/l15502.htm
- Lei 15.502/2026 (Câmara, publicação original): https://www2.camara.leg.br/legin/fed/lei/2026/lei-15502-10-setembro-2026-799916-publicacaooriginal-181312-pl.html
- MPV 1.357/2026 (Congresso): https://www.congressonacional.leg.br/materias/medidas-provisorias/-/mpv/174123
- Agência Senado, MP zera "taxa das blusinhas" (13/05/2026): https://www12.senado.leg.br/noticias/materias/2026/05/13/medida-provisoria-zera-taxa-das-blusinhas-para-importacoes-de-ate-us-50
- Agência Câmara, MP permite eliminar a "taxa das blusinhas": https://www.camara.leg.br/noticias/1271806-medida-provisoria-permite-eliminar-a-taxa-das-blusinhas
- Comsefaz, Informações Fiscais (tabela ICMS RTS por UF, v22-12-2025): https://comsefaz.org.br/novo/informacoes-fiscais/
- Comsefaz, tabela RTS v2 (abr/2025): https://comsefaz.org.br/novo/wp-content/uploads/2025/04/Aliquota-ICMS-import.-RTS-por-UF-17-e-20-CV81-23v2.pdf
- Comsefaz, tabela RTS v21-05-2025: https://comsefaz.org.br/novo/wp-content/uploads/2025/05/Aliquota-ICMS-import.-RTS-por-UF-17-e-20-CV81-23-v21-05-2025.pdf
- SEF/MG, importação por remessas (17%): https://www.fazenda.mg.gov.br/noticias/2023/2023.10.10_importacao/
- Correios, Comunicado 13/05/26: https://www.correios.com.br/central-de-informacoes/boletim-aos-clientes/comunicado-13-05-26-2013-atualizacao-das-regras-de-tributacao-simplificada-das-remessas-internacionais
- Exposição de Motivos MP 1.236/2024 (histórico 20% / US$ 20): https://planalto.gov.br/ccivil_03/_ato2023-2026/2024/Exm/Exm-1236-24.pdf

**Imprensa e especializadas**
- Econet, Portaria MF 1.342/2026: https://blog.econeteditora.com.br/remessa-conforme-o-que-muda-com-a-portaria-mf-1-342-2026/
- E-Commerce Brasil, MP e faixa até US$ 3 mil: https://www.ecommercebrasil.com.br/noticias/mp-pode-mudar-tributacao-de-remessas-internacionais-de-ate-us-3-mil
- Forbes, setembro/2026: https://forbes.com.br/forbes-money/2026/09/taxa-das-blusinhas-veja-como-ficam-as-compras-internacionais/
- Fecomércio-RS, Lei 15.502/2026: https://www.fecomercio-rs.org.br/noticiadetalhe/2026/09/14/lei-n-155022026-altera-tributacao-das-remessas-internacionais-de-pequeno-valor/20d26f02-463f-4006-845e-992bf177c882
- Mix Vale, nova lei (11/09/2026): https://www.mixvale.com.br/2026/09/11/nova-lei-elimina-imposto-de-importacao-em-compras-internacionais-de-ate-us-50-e-define-regras/
- Atlas Público, sanção da lei: https://atlaspublico.com.br/noticias/presidente-sanciona-lei-que-muda-tributacao-de-remessas-86904
- Dia a Dia Tributário, Lei 15.502: https://www.diaadiatributario.com.br/lei-no-15-502-2026-consolida-aliquota-zero-do-imposto-de-importacao-em-compras-de-ate-us-50/
- Canal Rural, MP de maio (cita 30%, divergente): https://www.canalrural.com.br/economia/governo-publica-mp-que-isenta-imposto-federal-em-compras-internacionais-de-ate-us-50/
- CNN Brasil, DOU extra traz MP: https://www.cnnbrasil.com.br/economia/money/macroeconomia/dou-extra-traz-mp-que-isenta-tributacao-para-compras-internacionais-ate-us-50/
- Rota da Jurisprudência, Portaria Coana 193/2026: https://rotadajurisprudencia.com.br/2026/05/receita-federal-cria-indicadores-e-fixa-novos-criterios-para-manutencao-no-programa-remessa-conforme/
- InfoMoney, estados com ICMS 20% (2025): https://www.infomoney.com.br/consumo/taxa-das-blusinhas-veja-estados-que-sobem-o-icms-de-compras-internacionais-para-20/
- Congresso em Foco, ICMS 20% em dez estados: https://www.congressoemfoco.com.br/noticia/107364/icms-de-compras-internacionais-sobe-para-20-em-dez-estados-na-terca
- Tribuna de Minas, MG revoga 20%: https://tribunademinas.com.br/noticias/economia/01-04-2025/governo-de-minas-derruba-decreto-que-aumentava-o-icmssobre-compras-internacionais-comeca-a-valer-em-todo-o-estado.html
- Portal BeNews, ICMS por estado (AP 18%, PA 19%): https://portalbenews.com.br/taxa-das-blusinhas-icms-ainda-e-cobrado/
- Gabriel Devs, out/2026 (AP 18%): https://www.gabrieldevs.com.br/2026/10/fim-da-taxa-das-blusinhas-quanto-de.html
- Diario de Pernambuco, ICMS continua (maio/2026): https://www.diariodepernambuco.com.br/amp/economia/2026/05/11714254-taxa-das-blusinhas-chega-ao-fim-mas-icms-nos-estados-continua-entenda.html
- FazComex, empresas certificadas: https://www.fazcomex.com.br/comex/programa-remessa-conforme-conheca-as-empresas-certificadas/
- InfoMoney, Shopee certificada: https://www.infomoney.com.br/consumo/shopee-recebe-certificado-do-remessa-conforme-e-isencao-para-compras-de-ate-us-50-passa-a-valer/
- Remessa Online, Amazon e Remessa Conforme: https://www.remessaonline.com.br/blog/amazon-remessa-conforme/
- TechTudo, Amazon no Remessa Conforme: https://www.techtudo.com.br/guia/2023/11/amazon-no-remessa-conforme-o-que-muda-e-o-que-fazer-se-compra-for-taxada-edsoftwares.ghtml
- TechTudo, taxação na Shopee ("Enviado de"): https://www.techtudo.com.br/guia/2023/09/taxacao-na-shopee-como-saber-se-foi-taxado-o-que-fazer-e-mais-edsoftwares.ghtml
- Adoro Cupom, AliExpress "Enviado do Brasil" / Choice BR: https://adorocupom.com/blog/como-nao-ser-taxado-no-aliexpress/
- Toexceed, Correios e despacho postal (set/2026): https://toexceed.com.br/blog/2026/09/09/importacao-pelos-correios-regras-tributacao-e-como-funciona/
- Jusbrasil, taxa de despacho postal: https://www.jusbrasil.com.br/noticias/correios-comecam-a-cobrar-taxa-em-todas-encomendas-internacionais/619046349

---

*Triagem informativa preparada para o SetupSniper. Não é parecer tributário nem substitui a consulta às normas oficiais ou a um profissional.*
