# Alertas no Telegram

## Conectar

1. No Telegram, abra o [@BotFather](https://t.me/BotFather), envie `/newbot`, escolha um nome e copie o **token**.
2. No SetupSniper, abra a aba **Alertas**, cole o token e clique em **Salvar**. Outra opção é colocar o token em `TELEGRAM_TOKEN=` no `.env`.
3. Abra o seu bot no Telegram e envie `/start`. O primeiro chat que fizer isso vira o dono, e só ele recebe alertas e usa os comandos.
4. Clique em **Enviar mensagem de teste**.

## Quando o bot avisa

- Quando um produto **fixado** atinge a **meta de preço**.
- Quando cai pelo menos **X% abaixo da média de 30 dias**. O padrão é 10%, e o aviso só vale depois de existir histórico.

Os avisos só consideram ofertas cuja **nota final** (loja + vendedor + oferta, ver [Como funciona](como-funciona.md#nota-final-por-oferta-plataforma-vendedor-e-oferta-srcseller-scorejs)) fica acima do mínimo, que por padrão é 60. Preços **suspeitos** (muito abaixo da mediana) são ignorados, a menos que você ative essa opção. Cada produto gera **uma mensagem só**, com a melhor oferta e as outras abaixo da meta. A mesma oferta não é repetida por 24h, a não ser que caia mais 1%.

Cada produto fixado tem um sininho 🔔 para ligar ou desligar os alertas só dele.

## Comandos

| Comando | O que faz |
|---|---|
| `/fixados` | Lista os fixados com o melhor preço atual |
| `/fixar ryzen 5 7600 meta 1200` | Fixa um produto. A meta é opcional e também aceita `R$ 1200` ou `até 1200`. |
| `/desafixar 2` | Remove o fixado nº 2 da lista |
| `/buscar rtx 4060` | Busca rápida nas lojas |
| `/cupons` | Lista os cupons ativos |
| *(post encaminhado)* | Calcula o Total Pix e o Total Crédito com o cupom |
| `/status` | Versão, tempo ligado e memória do servidor |
| `/atualizar` | Baixa a versão nova do GitHub e reinicia (precisa ter sido instalado com `git clone`) |

`/diagnostico` testa todas as lojas agora e diz, para cada uma, se funcionou e por qual caminho (API oficial, API pública, página ou navegador), ou por que falhou.

## Encaminhar posts de promoção

Encaminhe ao bot um post de grupo ou canal de promoções, com link e cupom. O bot:

1. lê o produto, o preço anunciado, os cupons ("X OU Y") e as regras;
2. resolve o link encurtado (meli.la, amzn.to, s.shopee.com.br, a.aliexpress.com…) até a página da loja, sem login. Loja fora do escopo é descartada;
3. lê o preço atual no Pix e no cartão;
4. salva o cupom. Sem regra no post, ele **infere** o desconto pelo preço anunciado;
5. responde com o **Total Pix** e o **Total Crédito**, a nota de confiança da oferta com os motivos e três botões:
   - **📌 Fixar:** passa a acompanhar o produto;
   - **✅ Funcionou** e **❌ Não funcionou:** marcam o cupom como confirmado ou expirado.

Também dá para colar o post na aba **🎟️ Cupons** do site. O comando `/cupons` lista os cupons ativos.

### Canais públicos (opcional)

Abra a aba **📣 Promoções** e toque em **Ativar os canais sugeridos**. A lista dos 26 canais fica em `data/telegram-channels.json` e pode ser editada na aba 🎟️ Cupons (até 40, um por linha).

- **Como lê:** pela prévia pública `https://t.me/s/<canal>`, sem login e sem conta do Telegram. Um canal de cada vez, com pausa entre eles, a cada 30 min (`channelIntervalMin`, mínimo 15).
- **O que guarda:** todo post com link de uma loja do escopo entra no feed da aba Promoções, com scroll infinito, filtro por loja e por produto. Com um produto no filtro, os mais baratos vêm primeiro.
- **Cupons:** posts com cupom também passam pelo mesmo fluxo dos posts encaminhados (abre o link, lê o preço na loja e salva o cupom), no máximo 3 por canal a cada leitura.
- **Aviso no Telegram:** se uma promoção bater com um produto fixado e ficar dentro da meta, o bot avisa. O aviso diz "divulgado por @canal, não verificado".
- **Grupos não funcionam assim.** A prévia `t.me/s` só existe para **canais** públicos. Grupos e canais com a prévia desativada aparecem como "sem prévia pública" em "Situação de cada canal". Para eles, encaminhe os posts ao seu bot.
- **Nada é lido** enquanto a lista estiver vazia.

## Segurança

- O token fica em `data/settings.json` ou no `.env`, ambos fora do git.
- Se o token vazar, envie `/revoke` ao @BotFather, gere outro e cole no site.
- Para trocar o chat dono, clique em **Desconectar bot** na aba Alertas e conecte de novo.
