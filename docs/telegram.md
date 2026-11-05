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
| `/grupos` | Lista os grupos e canais conectados ao bot |
| `/grupo_add` | **Dentro de um grupo:** conecta o grupo (só você). Veja [Grupos e canais em tempo real](#grupos-e-canais-em-tempo-real-com-o-seu-bot) |
| `/grupo_remover` | Dentro do grupo: desconecta. No privado: `/grupo_remover 2` |
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

O comando `/cupons` lista os cupons ativos.

### Canais públicos (opcional)

Abra a aba **🛒 Ofertas** e toque em **Ativar os canais sugeridos**. A lista dos 26 canais fica em `data/telegram-channels.json` e pode ser editada em **🛒 Ofertas → Editar a lista de canais** (até 40, um por linha).

- **Como lê:** pela prévia pública `https://t.me/s/<canal>`, sem login e sem conta do Telegram. Um canal de cada vez, com pausa entre eles.
- **Com que frequência:** cada canal tem o seu intervalo (`intervaloMin` em `data/telegram-channels.json`): 5 min para os canais de promoções, que postam mais, e 30 min para os de cupons e de lojas. Canal adicionado por você começa em 30 min. Um canal que fica 24 h sem post novo passa a ser lido a cada 30 min e volta ao ritmo normal quando posta de novo. As regras ficam no bloco `agendamento` do mesmo arquivo, com fonte e data. A atividade de cada canal foi estimada pelo tipo, não medida [não verificado].
- **Só o que é novo:** o SetupSniper guarda o número do último post visto em cada canal e só trata os posts depois dele.
- **Quando a prévia falha:** a espera aumenta sozinha (10 min, 20, 40… até 6 h) e volta ao normal no primeiro acerto. Canal sem prévia pública espera 6 h entre as tentativas.
- **O que guarda:** todo post com link de uma loja do escopo vira uma oferta na aba **🛒 Ofertas**: produto com preço baixo, cupom de desconto ou oferta de desconto, com o nome e o preço do produto lidos do post.
- **Cupons:** posts com cupom também passam pelo mesmo fluxo dos posts encaminhados (abre o link, lê o preço na loja e salva o cupom), no máximo 3 por canal a cada leitura.
- **Aviso no Telegram:** se uma promoção bater com um produto fixado e ficar dentro da meta, o bot avisa. O aviso diz "divulgado por @canal, não verificado".
- **Grupos não funcionam assim.** A prévia `t.me/s` só existe para **canais** públicos. Grupos e canais com a prévia desativada aparecem como "sem prévia pública" em "Situação de cada canal". Para eles, use o bot dentro do grupo (abaixo) ou encaminhe os posts ao seu bot.
- **Nada é lido** enquanto a lista estiver vazia.

## Grupos e canais em tempo real (com o seu bot)

Quando o seu bot está **dentro** de um grupo, ou é **admin** de um canal, o Telegram entrega cada mensagem nova a ele na hora, pelo mesmo long polling que já recebe os comandos. Não há leitura de página nem atraso de minutos.

| Origem | Como chega | Atraso | O que você faz |
|---|---|---|---|
| Canal público | prévia `t.me/s/<canal>`, só os posts novos | 5 a 30 min | nada |
| Canal onde o bot é admin | `channel_post` do bot | segundos | pôr o bot como admin |
| Grupo seu ou que aceita o bot | `message` do bot | segundos | desligar o privacy mode e readicionar o bot |
| Grupo que não aceita o bot | encaminhar o post ao bot | o seu tempo | encaminhar |

### 1. Desligar o privacy mode (para grupos)

Com o *privacy mode* ligado (o padrão), o bot só recebe, num grupo, os comandos e as respostas dirigidas a ele. Para ler as ofertas:

1. Abra o [@BotFather](https://t.me/BotFather) e envie `/setprivacy`.
2. Escolha o seu bot.
3. Toque em **Disable**. O BotFather responde que o privacy mode foi desligado.
4. **Remova o bot do grupo e adicione de novo.** A mudança só vale para os grupos em que o bot entrar depois dela.

Outra opção, sem mexer no privacy mode: tornar o bot **admin** do grupo. Bots admin recebem todas as mensagens.

A aba **Lojas → Diagnóstico** mostra a linha **Telegram** com "privacy mode ligado" ou "desligado", lido do próprio Telegram (`getMe`).

### 2. Conectar um grupo: `/grupo_add`

1. Adicione o bot ao grupo (Informações do grupo → Adicionar membros → procure o @ do bot).
2. **Dentro do grupo**, envie `/grupo_add`. Tem de ser você, com a mesma conta que fez o `/start` do bot.
3. O bot avisa no seu chat privado: "Grupo … conectado". Ele não escreve nada no grupo.

Se outra pessoa enviar `/grupo_add`, o bot ignora em silêncio. Se você for admin **anônimo** do grupo, o Telegram esconde quem enviou o comando e o bot também ignora: desligue o anonimato por um momento, envie o comando e ligue de novo.

Para desconectar: `/grupo_remover` dentro do grupo, ou `/grupos` no chat privado do bot e depois `/grupo_remover <nº>`.

### 3. Conectar um canal: bot como admin

1. No canal: Informações → Administradores → Adicionar administrador → o @ do bot. Basta a permissão mínima; ele não precisa postar.
2. Poste `/grupo_add` no canal (pode apagar depois).
3. Posts de canal não dizem quem escreveu, então o bot pede a sua confirmação: no seu chat privado chega "O canal … pediu para ser lido" com o botão **✅ Conectar este canal**. Só toque se o canal for seu ou se o dono dele concordou.

O pedido fica só na memória do servidor: se ele reiniciar antes do toque, poste `/grupo_add` de novo.

### O que o bot lê e guarda

- **Só grupos e canais da sua lista** (`data/telegram-groups.json`, fora do git). Mensagens de qualquer outro chat são descartadas sem processar.
- **Só o que parece oferta:** link de uma loja (ou encurtador de afiliado), ou preço junto de um link. Conversa, mesmo com um "R$" no meio, é descartada.
- **Nada de quem postou:** o bot não guarda nome, @ nem id de quem escreveu, nem a assinatura do autor nos canais. Guarda só o título e o @ do grupo ou canal, e a hora do último post.
- **Silêncio no grupo:** o bot nunca responde dentro do grupo ou do canal. Os comandos de dono (`/fixados`, `/buscar`…) só funcionam no chat privado, e `/start` num grupo não conecta nada.
- Todo post aceito segue o mesmo caminho dos canais e dos encaminhados: leitura do post, aba Ofertas, aviso ao vivo na página aberta e alerta se bater com um produto fixado.

### Por que não há userbot

Ler um grupo que **não aceita** o bot só seria possível com um *userbot*: a sua conta pessoal do Telegram conectada ao servidor por uma biblioteca de cliente. O SetupSniper não faz isso, por três motivos:

1. **Risco para a sua conta:** o Telegram limita ou bane contas pessoais usadas em automação.
2. **Acesso total guardado no servidor:** a sessão de um userbot lê todas as suas conversas, contatos e grupos. Se o servidor (ou o celular) for comprometido, a sua conta inteira vai junto.
3. **Zero dependências:** o protocolo do cliente (MTProto) exige uma biblioteca grande; o projeto roda só com Node.js.

Para esses grupos, continue encaminhando os posts ao bot. Isso só muda se você decidir por escrito.

## Segurança

- O token fica em `data/settings.json` ou no `.env`, ambos fora do git. A lista de grupos fica em `data/telegram-groups.json`, também fora do git.
- Se o token vazar, envie `/revoke` ao @BotFather, gere outro e cole no site.
- Para trocar o chat dono, clique em **Desconectar bot** na aba Alertas e conecte de novo.
