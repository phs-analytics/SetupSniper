# Quando aparece "bloqueado": fontes oficiais e outras saídas

Algumas lojas recusam acessos automáticos ao site (a resposta é HTTP 403/429 ou uma página de captcha). O SetupSniper **não tenta burlar** essas proteções: nada de captcha, disfarce de navegador, proxy ou cookies de login. Em vez disso, cada loja tem uma **lista de fontes**, da mais oficial para a menos oficial, em `data/stores.json` (campo `sources`):

| Id | Fonte | Precisa de |
|---|---|---|
| `api-oficial` | API oficial da loja | as suas credenciais no `.env` |
| `feed-afiliado` | rede de afiliados (Awin, Lomadee) | conta de afiliado aprovada no programa da loja |
| `api-publica` | o JSON público que o próprio site usa | nada |
| `pagina` | a página pública de busca (HTML) | nada |

A busca tenta as fontes nessa ordem e para na primeira que devolver produtos. **Fontes sem credencial são puladas** sem erro. No diagnóstico, cada tentativa mostra a fonte usada.

## Fontes por loja (04/11/2026)

Baseada no diagnóstico real feito no celular em 04/11/2026 (`docs/diagnostico-2026-11.md`).

| Loja | Ordem das fontes | Situação no diagnóstico | O que você precisa fazer |
|---|---|---|---|
| KaBuM! | API pública → feed Awin → página → navegador | funciona (API pública, 40 itens) | nada; a Awin é reforço, se um dia a API pública parar |
| Terabyte | feed Lomadee → página → navegador | bloqueada (HTTP 403 na página) | conta Lomadee aprovada no programa da Terabyte |
| Amazon | Creators API → página → navegador | funciona (página, 47 itens) | opcional: Creators API (exige vendas como associado) |
| Mercado Livre | API oficial → API pública → página → navegador | bloqueada (403 na API pública, página sem itens) | só as credenciais `ML_CLIENT_ID` e `ML_CLIENT_SECRET` |
| Shopee | API de afiliados → API pública → página → navegador | bloqueada (403 na API pública, página sem itens) | só as credenciais `SHOPEE_AFFILIATE_APP_ID` e `SHOPEE_AFFILIATE_SECRET` |
| AliExpress | API de afiliados → página → navegador | funciona (página, 7 itens) | opcional: `ALIEXPRESS_APP_KEY` e `ALIEXPRESS_APP_SECRET` traz mais itens |
| Pichau | página → navegador | bloqueada (HTTP 403) | nenhuma fonte oficial encontrada \[não verificado\]; use a extensão |
| Magalu | página → navegador | bloqueada (HTTP 403) | nenhuma API de busca encontrada \[não verificado\]; use a extensão |

Mercado Livre, Shopee e AliExpress **já têm o código pronto**: só faltam as credenciais no `.env` (passo a passo abaixo).

## Pausa após bloqueio (6 horas)

Quando a **página** de uma loja bloqueia (captcha, ou HTTP 401, 403, 429 ou 503), o SetupSniper deixa a página daquela loja **6 horas sem nova tentativa**. Insistir só gera erro e pode piorar o bloqueio.

- Durante a pausa, a loja aparece como bloqueada, e o motivo diz até que horas vai a pausa.
- As fontes oficiais e de afiliado **continuam funcionando** durante a pausa.
- **Testar as lojas agora** (diagnóstico) ignora a pausa, porque foi você quem pediu. Se a página responder, a pausa acaba na hora.
- A pausa fica só na memória: reiniciar o servidor também a encerra.
- O valor fica em `data/source-limits.json` (`pausaAposBloqueioHoras`), com a fonte e a data.

## Limites de chamadas

As redes de afiliados limitam quantas consultas você faz por minuto. Os limites ficam em `data/source-limits.json`, com a fonte e a data, e o SetupSniper espera a vez antes de chamar. Se a espera passar de 20 segundos, aquela fonte é pulada nesta busca, com uma mensagem clara.

| Fonte | Limite usado | Fonte do número |
|---|---|---|
| Awin (API) | 20 por minuto | https://help.awin.com/apis/apidocs/introduction-1 |
| Awin (download do feed) | 5 por minuto; o feed fica guardado 6 h | https://help.awin.com/apidocs/retail-publisher-productapidocumentation-1 |
| Lomadee | 10 por minuto | https://ce-docs.keywordrush.com/modules/affiliate/lomadeeproducts (a documentação oficial fala em 60; fica o menor) |
| Amazon Creators API | 30 por minuto e 8640 por dia | https://affiliate-program.amazon.com/creatorsapi/docs/en-us/concepts/api-rates (no início, 1 por segundo) |

## Primeiro: descubra o que está acontecendo

Abra a aba **Lojas** e toque em **Testar as lojas agora**. Também dá para mandar `/diagnostico` para o bot.

Para cada loja, aparece o que cada tentativa devolveu:

| O que aparece | Quer dizer |
|---|---|
| `HTTP 403` ou `HTTP 429` (bloqueio anti-bot) | a loja recusou o acesso automático |
| `a loja pediu verificação (captcha)` | apareceu uma página "confirme que você é humano" |
| `endereço não encontrado (DNS)` | o aparelho está sem internet, ou a rede (operadora, VPN, DNS) bloqueia o site |
| `a conexão foi cortada` | a loja ou a rede derrubou a conexão (pode ser bloqueio) |
| `N itens via api-oficial/feed-afiliado/api-publica/pagina/navegador` | funcionou, e mostra por qual fonte |
| `pausada após bloqueio até 18:30` | a página bloqueou há pouco; o SetupSniper só tenta de novo depois desse horário |

Toque em **Copiar relatório** e envie para quem estiver ajudando. O relatório não tem CEP, token, chat nem os seus produtos.

## Automático: extensão do navegador

A forma mais automática para as lojas sem API é a **extensão** (`docs/extensao.md`). Ela envia sozinha os preços de toda página de produto ou de busca que você abrir, no PC e no Firefox do Android. Os itens abaixo são as alternativas sem extensão.

## Compartilhar o link pelo app da loja

No app da loja, toque em **Compartilhar** e mande o link para o seu bot do Telegram. O bot responde com o preço e um botão 📌 Fixar. Se a loja não deixar ler o preço na hora, o bot fixa mesmo assim, pelo nome do produto no link, e os Fixados tentam de novo nas próximas verificações.

## Mercado Livre: API oficial (grátis, recomendado)

É a melhor fonte para o **comparativo de vendedores**: para cada produto do catálogo, a API devolve **todos os vendedores** que o vendem, com o preço de cada um e a reputação (termômetro, MercadoLíder, vendas, idade da conta). Isso alimenta a nota de confiança.

1. Entre em https://developers.mercadolivre.com.br com a sua conta do Mercado Livre e abra **Minhas aplicações → Criar aplicação**.
2. Preencha o nome (ex.: "SetupSniper pessoal"), uma descrição curta e uma URL de redirecionamento qualquer que seja sua (ex.: `https://localhost`). Ela não é usada, porque o SetupSniper só faz leitura.
3. Copie o **Client ID** (App ID) e o **Client Secret** para o `.env`:
   ```
   ML_CLIENT_ID=123456789
   ML_CLIENT_SECRET=abc...
   ```
4. Reinicie o SetupSniper e rode o diagnóstico: o Mercado Livre deve aparecer como "via api-oficial".

Só com o app, o SetupSniper usa um token do aplicativo (`client_credentials`).

Cada oferta do Mercado Livre também traz a **tarifa de venda** do anúncio (`fee`: tipo de anúncio, valor em R$ e %) e a **% de avaliações positivas** do vendedor.

### Coleta automática para planilha

Com as credenciais acima, o SetupSniper pode coletar sozinho, de tempos em tempos, nome, preço, frete, loja, avaliação da loja e tarifa de venda. Os dados vão para `data/coletas/AAAA-MM-DD.csv` (um arquivo por dia, abre no Excel ou no Google Sheets).

1. No `.env`, preencha `COLETA_BUSCAS` (ex.: `rtx 4060;ssd 1tb`), `COLETA_PAGINAS`, `COLETA_INTERVALO_MIN` (0 = uma vez só) e, se quiser o frete pago, `COLETA_CEP`.
2. Rode `npm run coletar`. No celular (Termux), rode antes `termux-wake-lock` para o Android não pausar a coleta.

As buscas rodam uma por vez, com 5 segundos de pausa entre elas. Um erro numa busca não para a coleta: a próxima rodada tenta de novo. É tudo pela API oficial, sem imitar visitante no site.

### Conectar a sua conta (login oficial)

Algumas consultas da API do Mercado Livre só respondem para um usuário conectado. Para isso:

1. **Cadastre o endereço de retorno no app.** No app do Mercado Livre, em "Redirect URI", cadastre `https://localhost/setupsniper-ml`, ou o endereço HTTPS do seu servidor terminado em `/auth/ml/callback` (veja abaixo). Se usar outro endereço, coloque-o também no `.env`:
   ```
   ML_REDIRECT_URI=https://localhost/setupsniper-ml
   ```
2. **Peça o login.** Na aba **Lojas → Conta do Mercado Livre**, toque em **Conectar minha conta do Mercado Livre** e autorize no site do Mercado Livre.
3. **Conclua.** O navegador vai para o endereço de retorno. Com `https://localhost/...`, a página não abre, e tudo bem: copie o endereço inteiro da barra (ele tem `?code=TG-...`), cole no campo e toque em **Concluir**. O código vale por poucos minutos.

- **Retorno automático:** abra o SetupSniper pelo endereço HTTPS (por exemplo, com `tailscale serve`, veja `docs/app-celular.md`) e cadastre no app do Mercado Livre o endereço que a aba Lojas mostra (`https://<seu-servidor>/auth/ml/callback`). Aí é só tocar em Conectar e autorizar, sem colar nada. Também dá para fixar o endereço com `ML_REDIRECT_URI` no `.env`.
- **Renovação:** o acesso é renovado sozinho se o app tiver a permissão "offline_access". Sem ela, conecte de novo quando vencer.
- **Onde fica:** o token fica em `data/ml-auth.json`, que nunca vai para o GitHub. O SetupSniper só **lê** a API: não compra, não vê os seus pedidos e não recebe a sua senha.
- **Para desconectar:** toque em **Desconectar**, ou revogue o acesso no Mercado Livre (Minha conta → Segurança → Aplicativos).

## Shopee: Shopee Affiliate Open API

1. Cadastre-se no programa de afiliados da Shopee: https://affiliate.shopee.com.br
2. Depois de aprovado, abra **Open API** no painel e gere o **App ID** e o **Secret**.
3. No `.env`:
   ```
   SHOPEE_AFFILIATE_APP_ID=...
   SHOPEE_AFFILIATE_SECRET=...
   ```

A API devolve o produto com o nome da loja vendedora e indica se é **Shopee Mall** (oficial). O SetupSniper salva o link normal do produto, **não** o seu link de afiliado.

## AliExpress: AliExpress Affiliate API

1. Cadastre-se no AliExpress Portals (afiliados) e na Open Platform: https://openservice.aliexpress.com
2. Crie um app do tipo Affiliate e copie o **App Key** e o **App Secret**.
3. No `.env`:
   ```
   ALIEXPRESS_APP_KEY=...
   ALIEXPRESS_APP_SECRET=...
   ```

Os preços vêm em reais, com envio para o Brasil.

> As três integrações seguem a documentação pública de cada API, mas **não foram testadas ao vivo**: a rede do ambiente de desenvolvimento bloqueava esses domínios. Se uma delas falhar, o diagnóstico mostra o erro exato.
>
> As credenciais ficam só no `.env`, que nunca vai para o GitHub. O `.env` é lido pelo Node 20.12 ou mais novo (o Termux já instala uma versão nova).

## KaBuM!: feed de produtos da Awin

A KaBuM! tem programa de afiliados na **Awin** \[não verificado: confira no diretório de anunciantes da Awin Brasil\]. Hoje a API pública da KaBuM! funciona, então a Awin entra só se ela parar.

1. Crie uma conta de **publisher** (afiliado) em https://www.awin.com/br e anote o **número da conta** (Publisher ID), que aparece no painel.
2. No painel, procure o programa da **KaBuM!** e peça para entrar. Espere a aprovação.
3. Gere o seu token em https://ui.awin.com/awin-api ("Show my API token").
4. No `.env`:
   ```
   AWIN_TOKEN=...
   AWIN_PUBLISHER_ID=...
   ```

O SetupSniper acha o programa da KaBuM! sozinho, pelo domínio, entre os programas em que você foi aprovado. Se quiser fixar o número do anunciante, preencha `afiliado.awin.advertiserId` na KaBuM! em `data/stores.json`.

O feed é o catálogo inteiro da loja (formato Google, JSON Lines). Ele é baixado no máximo a cada 6 horas e a busca é feita nele, sem chamar a Awin a cada pesquisa.

\[não verificado\]: se a KaBuM! publica o feed no formato Google com o idioma `pt_BR`, e o nome do campo com o link rastreado.

## Terabyte: busca de produtos da Lomadee

1. Crie uma conta de afiliado na **Lomadee** (https://www.lomadee.com.br) e peça a entrada no programa da **Terabyte** \[não verificado: confira se a Terabyte está na Lomadee\].
2. No painel, abra o menu do usuário → **Credenciais de API** e crie uma chave com o escopo `products:read`.
3. No `.env`:
   ```
   LOMADEE_API_KEY=...
   ```

A busca da Lomadee pode trazer produtos de outras lojas da rede: o SetupSniper mostra só os da Terabyte (pelo domínio). Se souber o identificador da Terabyte na Lomadee (um UUID), preencha `afiliado.lomadee.organizationId` em `data/stores.json`, para a busca já vir filtrada.

\[não verificado\]: se o preço da Lomadee é o à vista (Pix) ou o parcelado. Por segurança, ele entra como preço no cartão.

## Amazon: Creators API

A Product Advertising API (PA-API 5) foi desligada e responde HTTP 403. A substituta é a **Creators API**.

1. Você precisa ser **associado aceito** no Amazon Associados (https://associados.amazon.com.br) e ter **vendas qualificadas recentes**: a Amazon exige 10 vendas nos últimos 30 dias para liberar a API e corta o acesso depois de 30 dias sem vendas. Para uso só pessoal, isso pode não ser possível; a página da Amazon continua funcionando como hoje.
2. No Associados, abra **Ferramentas → Creators API → Create Application** e crie uma credencial. Copie o **Credential ID** e o **Credential Secret** (o segredo só aparece uma vez).
3. No `.env`:
   ```
   AMAZON_CREATORS_CLIENT_ID=...
   AMAZON_CREATORS_CLIENT_SECRET=...
   AMAZON_PARTNER_TAG=seunome-20
   ```

O SetupSniper pede o token (OAuth 2.0, client credentials) em `api.amazon.com`, que é o endereço da região do Brasil, e guarda por 1 hora. \[não verificado ao vivo\]

## Links de afiliado

As redes de afiliados e a Amazon devolvem **links rastreados**. O SetupSniper guarda o link rastreado separado (`affiliateUrl`), mas o **"Ver na loja" continua abrindo a URL limpa** da loja. O link de afiliado nunca é usado no botão.

## Pichau e Magalu: sem fonte oficial

- **Pichau:** nenhuma API pública nem programa de afiliados com API de produtos foi encontrado \[não verificado\].
- **Magalu:** o programa **Parceiro Magalu** tem uma API de links de parceiro que lê um produto pelo endereço, mas não foi encontrada uma API de **busca** documentada \[não verificado\]. Fica para uma etapa futura.
- **Para as duas, o que funciona:** a **extensão** do navegador e o **app instalado** com "Compartilhar". O preço que você viu aparece com a idade ("visto por você há 3 h").

## Outras dicas quando a loja bloqueia

1. **Rode o servidor em casa.** Internet residencial (Wi-Fi ou 4G) é bloqueada bem menos que servidores na nuvem ou VPNs.
2. **Use a extensão.** Quando a loja recusa, o que você abrir no seu navegador continua chegando ao SetupSniper. O servidor não abre navegador nenhum para ler lojas.
3. **Fixe o link do produto.** A página de um produto costuma ser menos protegida que a busca, e os Fixados conferem o preço direto nela.
4. **Encaminhe posts de promoção para o bot** e ative os canais na aba 🛒 Ofertas: o preço vem do post, e o link é conferido quando possível.
