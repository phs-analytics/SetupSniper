# SetupSniper: o projeto e tudo o que mudou até a 3.2.0

> Situação em 05/11/2026: versão **3.2.0**, com **380 testes** passando e zero dependências.

## O que é

O **SetupSniper** é um caçador e comparador de preços de hardware para quem monta PC no Brasil. Ele busca o mesmo produto em várias lojas ao mesmo tempo, compara **lojas e vendedores dos marketplaces**, mostra uma **nota de confiança** para cada oferta e avisa no **Telegram** quando o preço cai.

- **Projeto pessoal**, sem fins comerciais, licença MIT.
- **Node.js puro**, sem nenhuma dependência: não tem `npm install`.
- **Roda num servidor seu**: PC, mini PC, Raspberry Pi, Docker, VPS ou um celular Android antigo. Não existe servidor central, e os seus dados ficam só nele.
- **Lojas acompanhadas:** KaBuM!, Pichau, Terabyte, Amazon, Mercado Livre, Magalu, Shopee e AliExpress.

## Como ele está hoje

A interface tem cinco abas:

| Aba | O que faz |
|---|---|
| **Busca** | Busca livre nas 8 lojas, com os resultados chegando loja por loja. Três modos: **Comparativo** (o mesmo produto em todas as lojas e vendedores, lado a lado), **Lista** e **Por loja** (até 10 produtos por loja, só de vendedores com nota 70 ou mais; os outros ficam em "Mostrar ocultos", com o motivo). |
| **📌 Fixados** | Produtos acompanhados com meta de preço. O servidor confere de tempos em tempos, guarda o histórico, mostra o minigráfico, "menor em 90 dias" e o selo de provável preço inflado antes da promoção. |
| **🛒 Ofertas** | Tudo o que os canais e grupos do Telegram divulgam, separado em **Produtos com preço baixo**, **Cupons de desconto** e **Ofertas de desconto**, só de tecnologia. Mostra o preço anunciado e o preço final estimado com o cupom. Aqui também ficam a situação dos canais, "Ler agora" e a lista de canais. |
| **Lojas** | Nota de confiabilidade de cada loja, login oficial do Mercado Livre, preferências da busca por loja e o **diagnóstico** das lojas, com relatório para copiar. |
| **Alertas** | Bot do Telegram, regras de alerta e o **cálculo do total final**: CEP (para o ICMS dos importados), cotação do dólar (manual ou PTAX), lojas onde você já comprou e assinaturas. |

Além das abas:

- **Total Pix e Total Crédito** em cada oferta, com cupom (um por pedido), frete quando a loja informa, parcelas e, nos importados, imposto de importação e ICMS da sua UF.
- **Nota de confiança por oferta**, que junta loja, vendedor e oferta, com motivos e "sinais de risco". É sempre uma estimativa, não uma certificação.
- **Extensão do navegador** (Chrome, Edge, Firefox e Firefox Android): envia sozinha os preços das páginas de loja que você abre e mostra, no ícone, quantos cupons ativos a loja tem e o menor preço dos últimos 90 dias. Ela nunca preenche cupom nem clica em nada.
- **App instalável (PWA)**: o site vira um app no celular e aparece no **Compartilhar** do Android. O link compartilhado abre uma janela com o preço e o botão Fixar.
- **Bot do Telegram**: alertas, `/fixar`, `/fixados`, `/buscar`, `/cupons`, `/diagnostico`, `/atualizar` e leitura dos grupos e canais em que você o colocar (`/grupo_add`).

### De onde vêm os preços

Cada loja tem uma lista de fontes, da mais oficial para a menos oficial:

1. **API oficial** com as suas credenciais (Mercado Livre, Shopee, AliExpress, Amazon Creators API).
2. **Feed de afiliado** (Awin para a KaBuM!, Lomadee para a Terabyte).
3. **API pública** que o próprio site usa.
4. **Página pública** da loja.

Fonte sem credencial é pulada. Se a página de uma loja recusar o acesso, ela fica 6 horas sem nova tentativa. O servidor se identifica como **SetupSniper** e nunca tenta burlar bloqueio: nada de captcha, proxy, cookies de login, disfarce de navegador ou navegador automático. Quando uma loja recusa, a saída é a fonte oficial ou a extensão no seu navegador.

### De onde vêm os cupons

Só dos **canais e grupos do Telegram** e dos posts que você encaminha ao bot. Cada cupom aparece como **"divulgado por @canal em data, não verificado"**. O SetupSniper nunca testa, gera ou aplica cupom: o botão só copia o código.

## Regras do projeto

- Commits no nome do dono, com mensagens só sobre o projeto.
- Nada de dado pessoal ou chave no GitHub. O `npm run check` confere isso antes de cada publicação.
- CEP, perfil, tokens e chat id ficam só em `data/` e no `.env`, fora do git, e nunca aparecem em logs, no Telegram ou no relatório do diagnóstico.
- Nunca burlar a proteção das lojas.
- Regras que mudam (impostos, limites, pesos, categorias) ficam em JSON, com fonte e data.
- Dinheiro sempre em centavos inteiros.
- Testes com páginas salvas e sem rede.
- **Uma versão só**: `package.json`, extensão, CHANGELOG e modelo de relato de bug sempre com o mesmo número, conferido pelo `npm run check`.
- Linguagem: "sinais de risco", nunca "fraudador"; estimativa sempre aparece como estimativa.

## Como usar

```bash
git clone https://github.com/phs-analytics/SetupSniper.git && cd SetupSniper
cp .env.example .env     # defina uma SENHA (guia: docs/credenciais.md)
npm start                # abra http://localhost:3000
npm run demo             # interface com preços simulados
npm test                 # testes, sem rede
npm run check            # sintaxe, arquivos pessoais, segredos e versão única
```

Para atualizar o servidor: mande `/atualizar` ao bot, ou rode `git pull` e reinicie.

## Histórico de versões

### 1.0.0: o começo
Comparava três produtos fixos e calculava uma nota de confiabilidade das lojas.

### 2.0.0 a 2.2.0: a base
- **2.0.0:** busca livre em streaming em várias lojas, busca profunda, Fixados com meta e histórico, alertas e bot do Telegram, botão "Ver na loja", visual zine e colagem, nuvem de arquivos, scripts para rodar 24 h no Android, testes e verificação antes de publicar.
- **2.1.0 e 2.1.1:** servidor sempre ligado no celular, com vigia que religa tudo a cada 15 min, guia por marca de celular e um comando que liga tudo.
- **2.2.0:** a nota deixou de parecer certificação ("confiável", "bom", "regular", "cautela", com "(est.)") e entraram os avisos legais.

### 2.3.0 a 2.7.0: preços certos, cupons, total e nota por vendedor
- **2.3.0:** escopo fechado nas 8 lojas.
- **2.4.0:** corrigido o problema de lojas que apareciam "Não disponível" (o preço lido era o da parcela). Entraram o formato único de oferta em centavos e o Pix como referência.
- **2.5.0:** cupons lidos de posts, links encurtados resolvidos, regras de desconto e **Total Pix e Total Crédito** com cupom, frete, imposto de importação e ICMS.
- **2.6.0:** nota por vendedor com sinais de risco (plataforma, vendedor e oferta), com travas para alto risco e pouco dado.
- **2.7.0:** TikTok Shop estudada e deixada desligada (sem busca pública estável e com termos que proíbem coleta).

### 2.8.0 a 2.11.0: comparativo e saídas para bloqueio
- **2.8.0:** scroll infinito, ordem "Melhor escolha" (menor preço entre os vendedores confiáveis), filtro de acessórios corrigido, 26 canais de promoção do Telegram e uso no celular sem cortes.
- **2.9.0:** **Comparativo** entre lojas e vendedores, APIs oficiais opcionais e **diagnóstico** das lojas.
- **2.10.0:** login oficial na conta do Mercado Livre e link compartilhado ao bot.
- **2.11.0:** **extensão do navegador**, app instalável (PWA) e login do Mercado Livre sem colar nada.

### Diagnóstico real (novembro de 2026)
O primeiro teste com a rede de verdade, feito num servidor em casa, mostrou que KaBuM!, Amazon e AliExpress respondiam e que Pichau, Terabyte, Magalu, Mercado Livre e Shopee recusavam o acesso automático. Isso guiou as versões seguintes (`docs/diagnostico-2026-11.md`).

### 2.12.0 a 2.17.0: fontes oficiais, histórico e ofertas
- **2.12.0:** lista de fontes por loja, adaptadores da Awin, Lomadee e Amazon Creators API, limites de chamadas, pausa de 6 h depois de um bloqueio, aviso "visto por você há 3 h" quando a loja recusa e diagnóstico com as credenciais que faltam.
- **2.13.0:** **histórico próprio de preços** em arquivos mensais, com menor preço e mediana de 30 e 90 dias e o selo de provável preço inflado.
- **2.14.0:** **Telegram quase em tempo real**: cada canal no seu ritmo (5 a 30 min) e leitura dos grupos e canais com o bot, sem guardar quem postou.
- **2.15.0:** cupons das redes de afiliados (retirados depois, na 3.1.0).
- **2.16.0:** busca **Por loja**, com filtro pela nota do vendedor e alertas só de vendedor bom.
- **2.17.0:** aba **Ofertas**, só de tecnologia, com preço final estimado e aviso de novas ofertas.

### 3.0.0 e 3.0.1: fechamento da 3.0
- **3.0.0:** a extensão passou a mostrar os cupons e o histórico da loja aberta. O servidor passou a se identificar como SetupSniper, sem imitar o navegador Chrome. Guias novos de **servidor próprio** e de **credenciais**.
- **3.0.1:** retirado o navegador automático que reabria a página quando a loja recusava. Versão única em todo o projeto, conferida pelo `npm run check`.

### 3.1.0: ofertas com nome e preço certos
- A aba Promoções foi juntada à **Ofertas**, separada em produtos, cupons e descontos.
- Leitura nova dos posts: pula as chamadas do canal ("ESSA É SUCESSO NA FARIA LIMA", "Novo Cupom KABUM") para achar o nome do produto e lê o preço com ou sem "R$". O cifrão que o Telegram manda como `R&#036;`, que fazia muitos preços sumirem, passou a ser lido.
- Lojas reconhecidas também por encurtadores dos canais e pelo texto do post. O encurtador nunca vira o link "Ver na loja".
- Cupons só do Telegram (saíram os das redes de afiliados).
- Testado com posts reais de quatro canais públicos.

### 3.2.0: menos abas e total corrigido
- Saiu a aba **Cupons**. Os cupons do Telegram continuam no total e na aba Ofertas, e a lista de canais foi para a aba Ofertas.
- O **cálculo do total final** foi para a aba **Alertas**, com três correções: a cotação aceita "R$ 5,40" e recusa valor inválido com aviso, a data da PTAX é a do Banco Central e os Fixados são recalculados ao salvar.
- O Compartilhar do app instalado abre uma janela com o preço lido.
- A aba Lojas perdeu o favorito "Enviar para o SetupSniper" e a opção de links de afiliado. O "Ver na loja" abre sempre a página limpa.

## O que ainda falta ou depende de você

**Para fazer no servidor:**
- Rodar o **diagnóstico** de novo (aba Lojas → Testar as lojas agora). Desde a 3.0.0 o servidor se identifica como SetupSniper e não abre navegador automático, então lojas que respondiam podem passar a recusar.
- Cadastrar as **credenciais** na ordem de `docs/credenciais.md`: Mercado Livre, Shopee e AliExpress, Lomadee e Awin, e por último a Amazon (que exige vendas como associado).
- No Telegram, no **BotFather**, mandar `/setprivacy` (Disable), readicionar o bot aos seus grupos e mandar `/grupo_add` dentro de cada um.
- Testar a **extensão** numa loja real e no Firefox.

**Ideias que ficaram de fora:**
- A aba Ofertas ainda não recebe os itens com desconto das APIs das lojas, e só marca "pode ter acabado" depois de 24 h.
- Muitos vendedores grandes do Mercado Livre ficam "sem dados do vendedor" por falta do número de avaliações, e por isso não disparam alerta. A saída é ler esse número pela API do Mercado Livre ou recalibrar a nota.
- A nota do vendedor ainda não é lida da Creators API da Amazon.
- O frete não é calculado pelo CEP; ele entra só quando a loja informa.
- Uma versão na nuvem que buscaria dados enquanto o servidor de casa está desligado não foi feita.

**Não verificado ao vivo:** as APIs da Awin, Lomadee e Amazon Creators (sem conta), os encurtadores `link.amazon`, `ofertou.ai` e `pcdofafa.com.br`, a extensão no Firefox e o Keepa. A lista completa fica em `docs/como-funciona.md`, na seção "O que ainda não foi conferido".

## Onde saber mais

| Guia | Assunto |
|---|---|
| `README.md` | visão geral e como começar |
| `docs/como-funciona.md` | funcionamento completo, API local e o que ainda não foi conferido |
| `docs/servidor-proprio.md` | onde rodar 24 h e acesso pelo Tailscale |
| `docs/credenciais.md` | como pôr senha, Telegram e APIs no `.env` |
| `docs/fontes-oficiais.md` | fontes por loja, bloqueios e cadastros |
| `docs/ofertas.md` | aba Ofertas e leitura dos posts |
| `docs/historico.md` | histórico de preços |
| `docs/telegram.md` | bot, canais, grupos e privacy mode |
| `docs/extensao.md` | extensão do navegador |
| `CHANGELOG.md` | todas as mudanças, versão a versão |
