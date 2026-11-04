# Histórico próprio de preços

Todo preço que o SetupSniper vê, de qualquer loja e de qualquer origem (busca, Fixados, extensão, API oficial,
Telegram), vira um ponto numa série temporal guardada no seu servidor. Com ela, o app mostra um minigráfico,
o menor preço em 90 dias e um aviso quando a "promoção" só devolve o preço de antes.

O código está em `src/price-history.js` (gravação, leitura, indicadores, migração, retenção e Keepa) e
`public/historico.js` (minigráfico e selos). As regras que mudam estão em `data/history-rules.json`, com fonte e data.

## Onde fica

Um arquivo por mês, em JSON Lines (uma linha por ponto), dentro da pasta de dados:

```
data/history/2026-10.jsonl
data/history/2026-11.jsonl
```

O mês é contado em UTC. Cada linha:

```json
{"t":"2026-11-04T15:00:00.000Z","sig":"7 7800x3d|","store":"kabum","seller":null,"pix":189990,"origem":"busca"}
```

| Campo | O que é |
|---|---|
| `t` | data e hora (ISO, UTC) |
| `sig` | assinatura do produto: `productSignature()` de `src/compare.js` em texto, `"códigos|palavras"` em ordem alfabética. Títulos diferentes do mesmo modelo dão a mesma chave |
| `store`, `seller` | loja e vendedor (`null` quando é a própria loja) |
| `pix` | preço Pix em **centavos inteiros** |
| `origem` | `busca`, `fixado`, `extensao`, `api`, `telegram` ou `keepa` |
| `key` | opcional: o fixado de onde veio (`"itemId:storeId"`) |
| `fonte` | opcional: `"Keepa"` nos pontos que vieram de lá |
| `diario` | opcional: `true` nos pontos já compactados (veja Retenção) |

Os arquivos são pessoais e ficam fora do git, como o resto de `data/`. Só se usam módulos do Node (`node:fs/promises`);
a gravação é por `appendFile`, em fila, sem bloquear o servidor. Uma linha corrompida (por exemplo, o celular
desligou no meio da gravação) é ignorada na leitura, e o resto do arquivo continua valendo.

## Sem inchaço

No máximo **1 ponto por produto × loja × vendedor × fixado por hora**, a menos que o preço mude
(`gravacao.janelaDedupeMin` = 60). O controle é feito em memória; ao reiniciar, o servidor relê o arquivo do
mês corrente para montar o índice de novo.

## Indicadores

Calculados por `computeIndicators(pontos, { now, atual?, precoDe? })`:

- **menor preço e mediana em 30 e 90 dias** (a mediana de um número par de pontos é arredondada para o centavo);
- **preço atual**: o informado pelo chamador ou, se não houver, o menor visto nas últimas 24 h (`atualHoras`);
- **"menor preço em 90 dias"**: o preço atual é menor ou igual a tudo o que foi visto em 90 dias;
- **selo "preço inflado antes da promoção"** (veja abaixo).

**Histórico começando:** com menos de 3 pontos ou menos de 2 dias de série (`historicoComecando`), os indicadores
não mostram números e dizem "histórico começando". O minigráfico mostra só o que foi visto; sem nenhum ponto,
mostra a mesma frase.

### Selo "preço inflado antes da promoção"

Na tela, ele aparece como **"provável preço inflado antes da promoção (estimativa)"**: é um critério próprio do SetupSniper sobre o que ele mesmo viu, não uma acusação à loja.

É uma **estimativa** feita só com o que o seu servidor viu, nunca uma acusação. Olha a série da loja × vendedor do
ponto mais recente (misturar lojas inventaria "altas"):

1. **Preço "de"**: o último preço antes da queda, ou o preço "de" anunciado pela loja (`precoDe`), se o chamador informar.
2. **Base**: o menor preço visto nos **30 dias antes da queda** (`inflado.janelaDias`).
3. O selo aparece quando o "de" ficou **pelo menos 10% acima da base** (`altaMinimaPct`), o preço novo ficou
   **a menos de 5% abaixo da base** (`quedaRealMaximaPct`) e a queda aconteceu **nos últimos 14 dias** (`quedaRecenteDias`).

Exemplo (fixture `tests/fixtures/historico-series.json`): R$ 1.000 por semanas, sobe para R$ 1.200 e "cai" para
R$ 990. Alta de 20%, queda real de 1%: ganha o selo. Se cair para R$ 850 (15% abaixo da base), é promoção de verdade.

**Fonte dos limites:** critério próprio do projeto, inspirado no CDC (Lei 8.078/1990), art. 37 (publicidade
enganosa), e na regra europeia de anunciar o menor preço dos 30 dias anteriores a uma redução (Diretiva UE 2019/2161,
que incluiu o art. 6.º-A na Diretiva 98/6/CE). **Não há norma brasileira com esses números exatos**; os valores
10% / 30 dias / 5% / 14 dias são escolha do projeto. [não verificado]

## Migração do `data/history.json` antigo

O formato antigo é `{ "itemId:storeId": [{ t (ms), price (centavos) }], "itemId:__best": [...], "__schema": 2 }`.
`migrateLegacy(historyJson, fixados)`:

- copia **todos** os pontos (sem dedupe), com origem `fixado` e a chave antiga em `key`;
- a assinatura sai do `name` do fixado (ou da `query`); se o fixado já foi apagado, a série fica como `legado:<itemId>`;
- a série `__best` (o melhor de todas as lojas) vira `store: "__best"` e fica fora das consultas gerais; ela só aparece
  pedindo `store: "__best"` ou a `key`;
- sem `__schema: 2`, os preços estão em reais e são convertidos para centavos;
- é **idempotente**: ao terminar, grava o marcador `data/history/.migrado-history-json`, e as chamadas seguintes não fazem nada.
  O `history.json` antigo não é apagado.

## Retenção

`compact({ olderThanDays: 180 })`: pontos com mais de 180 dias viram **1 ponto por dia, o menor do dia**, por
produto × loja × vendedor × fixado (`retencao.compactarAposDias`). O dia é o de Brasília (UTC−3, sem horário de
verão desde 2019). Só os meses afetados são reescritos (arquivo temporário + `rename`), e rodar de novo não muda nada.

## Keepa (opcional, só Amazon)

A API da Keepa custa a partir de €49 por mês e cobre só a Amazon, por isso é um extra. Com `KEEPA_API_KEY` no `.env`,
`fetchKeepa(asin)` busca o histórico do produto na amazon.com.br (domínio 12) e devolve pontos com origem `keepa`
e `fonte: "Keepa"`, que a interface mostra como "fonte: Keepa".

- `csv[0]` (vendido pela Amazon) vira o vendedor "Amazon"; `csv[1]` (menor preço novo de terceiros) vira "Marketplace (novo)".
- O tempo da Keepa é em minutos desde 01/01/2011 (`(minuto + 21564000) × 60000` = milissegundos Unix); `-1` é "sem oferta" e é descartado.
- O preço da Keepa é o preço anunciado, não o Pix; ele é guardado no campo `pix` por simplicidade, marcado pela origem.
- A chave nunca aparece em mensagens de erro.

O formato foi conferido no cliente oficial da Keepa em Java (`github.com/keepacom/api_backend`, em 04/11/2026), mas
**nenhuma resposta real foi recebida** (sem chave). O teste usa a fixture `tests/fixtures/keepa-produto.json`. [não verificado ao vivo]

## Alternativa SQLite (futuro)

O Node tem o módulo nativo `node:sqlite`. Neste ambiente de desenvolvimento (Node v22.23.4),
`node -e "require('node:sqlite')"` funcionou sem flag, mas com o aviso "ExperimentalWarning: SQLite is an
experimental feature and might change at any time". Por isso:

- o **padrão continua sendo JSONL**, que funciona em qualquer Node ≥ 18.18 e no Termux;
- SQLite fica como **opção futura**, não implementada. Antes de oferecê-la, é preciso conferir a versão do Node do
  Termux (`node -v` e `node -e "require('node:sqlite')"` no celular) e esperar o módulo sair do estado experimental.
  [não verificado no Termux]

## API (para quem liga no servidor e na interface)

```js
import { createPriceHistory, computeIndicators, signatureKey, keepaConfigured, fetchKeepa } from './src/price-history.js';
const hist = createPriceHistory({ dir: DATA_DIR });           // now e fs são injetáveis nos testes
hist.record({ title, store, seller, pix, origem, key });      // Promise<boolean>; nunca rejeita
hist.recordMany(pontos);                                      // Promise<número gravado>
await hist.series({ sig | title | key, store, seller, days }); // pontos em ordem de tempo
await hist.indicators({ key: 'cpu:kabum' }, { atual, precoDe });
await hist.migrateLegacy(historyJson, watchlist.items);
await hist.compact();                                         // 180 dias, pela regra
await hist.flush();                                           // espera a fila de gravação
```

```js
import { sparklineSvg, historyBadges, dailyMin } from './historico.js';   // em public/
el.innerHTML = sparklineSvg(dailyMin(pontos)) + historyBadges(indicadores, { fonte });
```
