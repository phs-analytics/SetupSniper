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

O SetupSniper pede um token só de leitura (`client_credentials`), renovado sozinho. Não acessa a sua conta, não compra nada e não vê os seus dados de comprador.

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
