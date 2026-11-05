# Aba Ofertas

A aba Ofertas mostra **uma linha por oferta de tecnologia**: nome do produto, preço anunciado, loja, cupom (se houver) e preço final estimado com o cupom. As ofertas chegam sozinhas dos canais e grupos do Telegram, dos posts encaminhados ao bot e da extensão do navegador.

A antiga aba 📣 Promoções foi juntada aqui: a situação de cada canal, "Ativar os canais sugeridos" e "Ler agora" ficam no topo da aba Ofertas.

## Três seções

| Seção | O que é | Exemplo de post |
|---|---|---|
| **Produtos com preço baixo** | um produto com preço | "Monitor Gamer AOC 25" 310Hz · Valor: R$ 949,99 no Pix · Cupom: BF20OFF" |
| **Cupons de desconto** | um código (ou um cupom para resgatar) sem produto específico | "Novo Cupom KABUM · 15% OFF em Memórias RAM selecionadas · Código: DRAMOFF15" |
| **Ofertas de desconto** | um desconto anunciado pela loja, sem código | "Semana do Hardware na Pichau: até 30% OFF em placas de vídeo" |

O tipo é decidido por `src/post-oferta.js`, testado com posts reais de canais (`tests/fixtures/ofertas-posts-reais.json`).

## De onde vêm as ofertas

| Origem | Função | O que entra |
|---|---|---|
| Canais, grupos e posts encaminhados ao bot | `fromPost(text, meta, deps)` | todo post com link de loja do escopo ou link encurtado |
| APIs das lojas | `fromApiItem(offer)` | só itens com desconto (preço "de" maior que o preço) |
| Extensão do navegador | `fromCapture(offer)` | as páginas que **você** abriu no seu navegador |

Tudo vira o mesmo formato, com dinheiro em centavos (veja o topo de `src/offers.js`).

## Como um post é lido

- **Nome do produto**: `src/post-oferta.js` pula as chamadas do canal ("ESSA É SUCESSO NA FARIA LIMA", "🚨 Novo Cupom KABUM", "Exclusivo prime"), os avisos ("Só aviso de Cupom", "Mais grupos de ofertas", "Link para PC") e escolhe a linha com cara de produto (marca, modelo, capacidade).
- **Preço e preço "de"**: com ou sem "R$" ("Por 98,60 à vista", "por 1.539 em 12x", "Valor: R$584,99 no PIX", "- R$128"), "de R$ X por R$ Y", "(de R$ X)", "349 reais" e "💰 189,90". O cifrão que o Telegram manda como `R&#036;` é convertido.
- **Loja**: pelo link (inclusive `link.amazon`, `meli.la`, `ofertou.ai/…-Kabum` e `pcdofafa.com.br/p/kabum/…`) ou pelo texto ("Cupom KABUM", "AMAZON SOLTOU CUPOM"). Esses encurtadores nunca viram o link do botão "Ver na loja": o card mostra "Ver o post" até o link da loja ser conhecido. Se `link.amazon`, `ofertou.ai` e `pcdofafa.com.br` redirecionam por HTTP ou por HTML ainda não foi conferido \[não verificado\].
- **Cupom no anúncio**: "Resgate o cupom do anúncio" aparece no card como aviso para ativar o cupom na página do produto.
- **Forma de pagamento do preço**: Pix, à vista, parcelado (o total das parcelas, quando o post só traz "10x de R$ 99,90") ou cartão.
- **Emojis no lugar de números**: "R$ 3️⃣4️⃣9️⃣" vira R$ 349, e dígitos em negrito ("𝟖𝟗") viram números. A numeração "1️⃣ 2️⃣ 3️⃣" de listas é tratada como marcador.
- **Vários produtos num post**: um trecho por link de loja. O post só é dividido quando pelo menos dois trechos têm preço. Um cupom no fim do post ("Cupom para os dois: X") vale para todos, se forem da mesma loja.
- **Links encurtados** (bit.ly, meli.la, amzn.to...): a aba Ofertas não os abre sozinha. O card mostra "link a resolver" e não tem o botão "Ver na loja"; o link de verdade aparece quando o mesmo produto chega por outra fonte, ou quando você encaminha o post ao bot.
- **Conversa** (sem link de loja) e lojas fora do escopo são ignoradas. A TikTok Shop está desligada.

## Só tecnologia

O filtro (`src/tech-filter.js`) dá uma nota de 0 a 100 a cada título, com as palavras de `data/tech-categories.json`:

- **Categorias:** processador, placa de vídeo, placa-mãe, memória, SSD e armazenamento, fonte, gabinete, cooler, periféricos, monitores, notebooks e PCs, celulares e tablets, rede, áudio, consoles e jogos.
- Cada categoria tem palavras **fortes**, **fracas**, **padrões** (por exemplo "RTX 4060" e "i5-12400F") e **negativas** ("Jogo de **panelas**", "Monitor de **pressão**", "Cooler para **bebidas**").
- **Negativas gerais** ("camiseta", "air fryer", "caneca") e **acessórios** ("Capa para iPhone", com a mesma regra de `src/extract.js`) baixam a nota.
- Abaixo da **nota mínima**, a oferta vai para "Outros". Essas ofertas ficam escondidas, com o botão "Mostrar N ofertas fora de tecnologia".
- Cupom de loja inteira da KaBuM!, da Pichau ou da Terabyte conta como tecnologia, na categoria "Cupons de loja".

O teste `tests/tech-filter.test.js` confere 50 títulos, metade de tecnologia e metade não, contra o **acerto mínimo** do JSON (`acertoMinimo`).

## Cupom e preço final

- **Com cupom:** o preço final é **estimado** com `src/final-price.js`, usando **um cupom por pedido**. Se o post traz "X OU Y", os códigos são alternativas e não somam.
- **Rótulo:** o cupom aparece como **"cupom divulgado, não verificado"**, com "Divulgado por @canal em 04/11". Os cupons vêm só dos canais e grupos do Telegram.
- **Sem estimativa:** sem a regra do cupom, sem loja definida, abaixo do pedido mínimo ou com o cupom só no Pix num preço parcelado, o card diz **"não estimado"** e o motivo.
- **Preço já com cupom:** se o post diz "preço com cupom", o preço do post é mostrado como está.
- **Sem cupom:** o preço do post é mostrado como está.
- **Nunca aplica cupom:** o SetupSniper não testa, não gera e não aplica cupons. O botão **Copiar** só copia o código, e quem digita o cupom na loja é você.

## Repetidas e validade

- **Repetidas:** a mesma assinatura de produto (a do comparativo), na mesma loja e pelo mesmo preço, dentro de 24 h, vira um card só, com **"visto em N canais"**. O mesmo cupom de loja, divulgado e oficial, também vira um card só, e fica o rótulo oficial.
- **"Pode ter acabado":** o card ganha esse aviso quando:
  - a oferta passa 24 h sem ser vista de novo;
  - uma conferência na loja acha outro preço ou o produto indisponível;
  - o cupom venceu;
  - você marca ❌.
- **Prazos:** as ofertas ficam guardadas por 7 dias em `data/offers.json`, que fica fora do git. Todos os prazos estão em `data/tech-categories.json` → `ofertas`.

## Ordem "Melhor escolha"

**Desconto sobre o histórico × confiança da loja e do vendedor.**

1. **Desconto:**
   - com histórico, é a diferença para a mediana dos 90 dias (`src/price-history.js`);
   - sem histórico, conta o preço "de", a menos que o selo **preço inflado antes da promoção** esteja ativo;
   - sem nenhum dos dois, conta o desconto do cupom.
2. **Confiança:** é a nota da loja ou do vendedor. Sem nota, conta 50.
3. **Fim da lista:** alto risco (nota abaixo de 40) e preço **suspeito** (mais de 50% abaixo da mediana) ficam sempre no fim. "Pode ter acabado" fica depois das ativas, e ofertas sem preço vão por último.

Também dá para ordenar por menor preço ou pelas mais recentes. Nas duas, alto risco e suspeitos continuam depois.

## Filtros e botões

- **Filtros:** com cupom, sem cupom, categoria, loja, preço máximo (pelo preço final estimado, quando há) e "Outros".
- **Botões:** 📌 Fixar, Ver na loja (sempre a URL limpa, sem rastreamento), Copiar cupom, Ver nas outras lojas, ✅ Funcionou e ❌ Não funcionou.
- **Ofertas novas** chegam ao vivo com o aviso "3 novas ofertas: toque para ver". A lista não muda sozinha enquanto você rola a página.

## O que ainda não foi conferido

- [não verificado] Os formatos de post vêm de exemplos escritos à mão, no estilo dos canais. Posts reais podem trazer formatos novos.
- [não verificado] A resolução de links encurtados ao vivo, porque a rede estava bloqueada nos testes.
- [não verificado] Os pesos e a nota mínima do filtro foram calibrados só com os 50 títulos de teste.
