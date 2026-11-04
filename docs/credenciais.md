# Credenciais: como colocar no seu servidor

Senhas, o token do bot e as chaves das APIs oficiais ficam num arquivo chamado **`.env`**, na pasta do SetupSniper, **no seu servidor**. Ele nunca vai para o GitHub: está no `.gitignore`, e o `npm run check` e o CI recusam publicar segredos.

Todas as credenciais são **opcionais**, menos a `SENHA` (recomendada). Sem uma credencial, a fonte correspondente é pulada e o resto continua funcionando.

## 1. Crie o `.env`

O modelo é o `.env.example`. Copie e edite com o editor que preferir.

| Onde roda o servidor | Comando |
|---|---|
| Linux, macOS, Raspberry Pi | `cp .env.example .env` e depois `nano .env` |
| Windows (PowerShell) | `copy .env.example .env` e depois `notepad .env` |
| Docker | `cp .env.example .env`: o `docker-compose.yml` já lê o arquivo (`env_file: .env`) |
| Celular Android (Termux) | o instalador já cria o `.env`; edite com `nano .env` (salvar: **CTRL+O**, **Enter**, **CTRL+X**) |
| VPS | igual ao Linux, pelo SSH |

Cada linha é `NOME=valor`, sem aspas e sem espaço ao redor do `=`:

```
SENHA=uma-senha-forte
ML_CLIENT_ID=123456789
```

> O `.env` é lido sozinho pelo **Node 20.12 ou mais novo**. Com Node 18, passe o arquivo na hora de ligar: `node --env-file=.env server.js` (Node 20.6+) ou exporte as variáveis no terminal.

Depois de proteger o arquivo (Linux, macOS, Termux), deixe só você ler: `chmod 600 .env`.

## 2. Quais credenciais existem

| Variável | Para quê | Onde conseguir |
|---|---|---|
| `SENHA` | senha para abrir o site (login: qualquer usuário + esta senha) | você inventa |
| `PORT` | porta do site (padrão 3000) | você escolhe |
| `TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID` | bot de alertas (também dá para colar o token na aba Alertas) | [telegram.md](telegram.md) |
| `INTERVAL_MIN` | de quantos em quantos minutos os Fixados são conferidos | você escolhe (padrão 15) |
| `ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `ML_REDIRECT_URI` | API oficial do **Mercado Livre** (grátis) | [passo a passo](fontes-oficiais.md#mercado-livre-api-oficial-grátis-recomendado) |
| `SHOPEE_AFFILIATE_APP_ID`, `SHOPEE_AFFILIATE_SECRET` | API de afiliados da **Shopee** | [passo a passo](fontes-oficiais.md#shopee-shopee-affiliate-open-api) |
| `ALIEXPRESS_APP_KEY`, `ALIEXPRESS_APP_SECRET` | API de afiliados do **AliExpress** | [passo a passo](fontes-oficiais.md#aliexpress-aliexpress-affiliate-api) |
| `AWIN_TOKEN`, `AWIN_PUBLISHER_ID` | feed de produtos da **KaBuM!** pela Awin | [passo a passo](fontes-oficiais.md#kabum-feed-de-produtos-da-awin) |
| `LOMADEE_API_KEY` | produtos da **Terabyte** pela Lomadee | [passo a passo](fontes-oficiais.md#terabyte-busca-de-produtos-da-lomadee) |
| `AMAZON_CREATORS_CLIENT_ID`, `AMAZON_CREATORS_CLIENT_SECRET`, `AMAZON_PARTNER_TAG` | Creators API da **Amazon** (exige vendas como associado) | [passo a passo](fontes-oficiais.md#amazon-creators-api) |
| `KEEPA_API_KEY` | histórico de preços da Amazon pelo Keepa (pago, opcional) | [historico.md](historico.md) |
| `NUVEM_USUARIO`, `NUVEM_SENHA`, `NUVEM_PORTA`, `NUVEM_PASTA` | nuvem de arquivos (opcional) | [nuvem.md](nuvem.md) |

## 3. Por onde começar

Faça na ordem: cada passo já melhora o resultado, e os cadastros de afiliado podem demorar dias para serem aprovados.

1. **`SENHA`**: protege o site.
2. **Telegram**: alertas de preço e o comando `/diagnostico`.
3. **Mercado Livre**: grátis e imediato. Traz todos os vendedores de cada produto, com reputação.
4. **Shopee** e **AliExpress**: dependem da aprovação no programa de afiliados.
5. **Lomadee** (Terabyte) e **Awin** (KaBuM!): peça a entrada no programa da loja e espere a aprovação.
6. **Amazon Creators API**: só se você já tiver vendas como associado. Sem ela, a Amazon continua pela página.

Se um cadastro for recusado, a loja continua pela página, pela [extensão](extensao.md) ou pelo favorito "Enviar para o SetupSniper".

## 4. Reinicie e confira

1. **Reinicie o SetupSniper** para ele ler o `.env` de novo:
   - PC: pare com **CTRL+C** e rode `npm start` outra vez;
   - Linux com systemd: `sudo systemctl restart setupsniper`;
   - Docker: `docker compose up -d --force-recreate`;
   - celular (Termux): `tmux kill-session -t sniper && sh scripts/iniciar.sh --tmux`.
2. Abra a aba **Lojas** e toque em **Testar as lojas agora**.
3. Cada fonte oficial aparece como **✓ configurada** ou com **falta no .env: NOME_DA_VARIÁVEL**. O diagnóstico mostra só o nome das variáveis, nunca o valor.
4. Se uma loja continuar falhando, toque em **Copiar relatório**: ele não tem senhas, tokens, CEP nem chat id, e pode ser enviado para quem estiver ajudando.

## 5. Segurança

- **Nunca cole credenciais** em issues, pull requests, commits, prints ou no chat de suporte. O relatório do diagnóstico já foi feito para não ter nenhuma.
- **Vazou?** Gere uma credencial nova no site do provedor (Mercado Livre, Shopee, Awin…), apague a antiga lá e troque no `.env`.
- **Um `.env` por servidor.** Se trocar de máquina, copie o `.env` e a pasta `data/` por um meio seguro (pendrive, `scp`), nunca pelo GitHub.
- **Antes de publicar qualquer mudança no projeto**, rode `npm run check`: ele procura segredos e arquivos pessoais.
