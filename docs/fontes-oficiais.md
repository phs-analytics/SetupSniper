# Quando aparece "bloqueado": fontes oficiais e outras saídas

Algumas lojas recusam acessos automáticos ao site (a resposta é HTTP 403/429 ou uma página de captcha). O SetupSniper **não tenta burlar** essas proteções. Em vez disso, ele tenta, nesta ordem:

1. **API oficial da loja**, se você cadastrar as suas credenciais no `.env`. O preço vem da própria loja, sem ler o site, e não cai no bloqueio.
2. **API pública** que o próprio site usa (KaBuM!, Mercado Livre, Shopee).
3. **Página de busca da loja** (HTML).
4. **Navegador de verdade** (Playwright), quando a loja recusa e o navegador está instalado no aparelho.

## Primeiro: descubra o que está acontecendo

Abra a aba **Lojas** e toque em **Testar as lojas agora**. Também dá para mandar `/diagnostico` para o bot.

Para cada loja, aparece o que cada tentativa devolveu:

| O que aparece | Quer dizer |
|---|---|
| `HTTP 403` ou `HTTP 429` (bloqueio anti-bot) | a loja recusou o acesso automático |
| `a loja pediu verificação (captcha)` | apareceu uma página "confirme que você é humano" |
| `endereço não encontrado (DNS)` | o aparelho está sem internet, ou a rede (operadora, VPN, DNS) bloqueia o site |
| `a conexão foi cortada` | a loja ou a rede derrubou a conexão (pode ser bloqueio) |
| `N itens via oficial/api/html/navegador` | funcionou, e mostra por qual caminho |

Toque em **Copiar relatório** e envie para quem estiver ajudando. O relatório não tem CEP, token, chat nem os seus produtos.

## Enviar da loja pelo seu navegador (funciona em todas as lojas)

Esta é a saída para as lojas sem API (KaBuM!, Pichau, Terabyte, Magalu, Amazon). Você abre a página **no seu navegador**, como sempre: logado ou não, resolvendo a verificação da loja se ela aparecer. Depois toca no favorito **Enviar para o SetupSniper**.

1. **Instale o favorito** na aba **Lojas**, em "Enviar da loja para o SetupSniper":
   - **no PC:** arraste o botão para a barra de favoritos;
   - **no celular:** toque em "Copiar o código do favorito", crie um favorito chamado `SetupSniper` e cole o código no lugar do endereço.
2. **Abra a página** de um produto ou de uma busca na loja e toque no favorito. No celular, digite `SetupSniper` na barra de endereço e toque no favorito.
3. **Uma janela do SetupSniper abre** com as ofertas lidas da sua tela, a nota de confiança e o botão 📌 Fixar.
4. **Se o produto já estiver fixado** com aquele link, o preço dele é atualizado na hora e entra no histórico e nos alertas.

O favorito só entrega à janela do **seu** servidor o HTML que já está na sua tela. Nenhum acesso automático é feito à loja, e nada do que você digitou na loja é enviado.

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
4. Reinicie o SetupSniper e rode o diagnóstico: o Mercado Livre deve aparecer como "via oficial".

Só com o app, o SetupSniper usa um token do aplicativo (`client_credentials`).

### Conectar a sua conta (login oficial)

Algumas consultas da API do Mercado Livre só respondem para um usuário conectado. Para isso:

1. **Cadastre o endereço de retorno no app.** No app do Mercado Livre, em "Redirect URI", cadastre `https://localhost/setupsniper-ml`, ou o endereço HTTPS do seu servidor terminado em `/auth/ml/callback` (veja abaixo). Se usar outro endereço, coloque-o também no `.env`:
   ```
   ML_REDIRECT_URI=https://localhost/setupsniper-ml
   ```
2. **Peça o login.** Na aba **Lojas → Conta do Mercado Livre**, toque em **Conectar minha conta do Mercado Livre** e autorize no site do Mercado Livre.
3. **Conclua.** O navegador vai para o endereço de retorno. Com `https://localhost/...`, a página não abre, e tudo bem: copie o endereço inteiro da barra (ele tem `?code=TG-...`), cole no campo e toque em **Concluir**. O código vale por poucos minutos.

- **Retorno automático:** se o seu servidor tiver HTTPS (por exemplo, com `tailscale serve`), use `ML_REDIRECT_URI=https://<seu-servidor>/auth/ml/callback`. Aí o login conclui sozinho.
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

## Lojas sem API pública

KaBuM!, Pichau, Terabyte, Magalu e Amazon não oferecem uma API de preços para uso pessoal.

- **Amazon:** a Product Advertising API exige ser afiliado com vendas recentes, então não foi integrada.
- **Para essas lojas, o que mais ajuda:**
  1. **Rode o servidor em casa.** Internet residencial (Wi-Fi ou 4G) é bloqueada bem menos que servidores na nuvem ou VPNs.
  2. **No PC, instale o navegador:** `npm i playwright && npx playwright install chromium`. Com ele, quando a loja recusa, a mesma página pública é aberta num Chromium de verdade. Ele não resolve captcha: se a loja pedir verificação, a loja continua "bloqueada". No celular (Termux) o Playwright não funciona.
  3. **Fixe o link do produto.** A página de um produto costuma ser menos protegida que a busca, e os Fixados conferem o preço direto nela.
  4. **Encaminhe posts de promoção para o bot** e ative os canais na aba 📣 Promoções: o preço vem do post, e o link é conferido quando possível.
