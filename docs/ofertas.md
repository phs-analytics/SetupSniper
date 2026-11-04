# Aba Ofertas

A aba Ofertas mostra **uma linha por oferta de tecnologia**: nome do produto, preço anunciado, loja, cupom (se houver) e preço final estimado com o cupom. As ofertas chegam sozinhas dos canais e grupos do Telegram, dos cupons oficiais das redes de afiliados, das APIs das lojas e da extensão do navegador.

A aba 📣 Promoções continua como o feed bruto dos canais. A aba Ofertas é a versão filtrada e organizada.

## De onde vêm as ofertas

| Origem | Função | O que entra |
|---|---|---|
| Canais, grupos e posts encaminhados ao bot | `fromPost(text, meta, deps)` | todo post com link de loja do escopo ou link encurtado |
| Cupons oficiais (Awin, Lomadee) | `fromCoupon(c)` | cupons com código; promoção sem código não vira card |
| APIs das lojas | `fromApiItem(offer)` | só itens com desconto (preço "de" maior que o preço) |
| Extensão e favorito | `fromCapture(offer)` | as páginas que **você** abriu no seu navegador |

Tudo vira o mesmo formato, com dinheiro em centavos (veja o topo de `src/offers.js`).

## Como um post é lido

- **Nome, preço e preço "de"**: `src/promo-parser.js`, mais "de R$ X por R$ Y", "(de R$ X)", "349 reais" e "💰 189,90".
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
- **Rótulo:** o cupom aparece como **"cupom oficial"** quando o mesmo código veio de uma rede de afiliados. Fora isso, aparece como **"cupom divulgado, não verificado"**, com "Divulgado por @canal em 04/11".
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
