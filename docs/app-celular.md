# SetupSniper no celular: link no navegador ou app?

**Resposta curta: use o link, instalado como app (PWA).** Não precisa de um app de loja.

| | Link no navegador | Link instalado como app (PWA) | App nativo (Play Store) |
|---|---|---|---|
| Ícone na tela inicial | só como favorito | **sim** | sim |
| Abre em tela cheia, sem barra do navegador | não | **sim** | sim |
| Aparece no **Compartilhar** do app da loja | não | **sim** (Android) | sim |
| Atualiza sozinho quando o servidor atualiza | sim | **sim** | não: precisa publicar cada versão |
| Custo e manutenção | nenhum | **nenhum** | conta de desenvolvedor, revisão da loja, um segundo código para manter |
| Precisa de HTTPS | não | **sim**, para instalar e receber o Compartilhar | não |

O PWA é o mesmo site, então tudo o que muda no servidor já aparece no app. Um app nativo só valeria a pena se o SetupSniper precisasse de algo que o navegador não faz, e hoje não precisa.

## Como ter HTTPS (o que libera o app)

### Servidor no PC, com Tailscale (grátis)

1. No painel do Tailscale (login.tailscale.com → **DNS**), ative o **MagicDNS** e os **HTTPS Certificates**.
2. No PC onde o SetupSniper roda, abra um terminal e rode:
   ```
   tailscale serve --bg 3000
   ```
3. O endereço passa a ser `https://<nome-do-pc>.<sua-rede>.ts.net`. Ele só funciona nos seus aparelhos com o Tailscale ligado.
4. No celular, abra esse endereço no Chrome → ⋮ → **Instalar app** (ou **Adicionar à tela inicial**).

Com HTTPS, o **login do Mercado Livre** também conclui sozinho. Na aba Lojas, ele mostra o endereço de retorno para cadastrar no app do Mercado Livre (`https://<...>.ts.net/auth/ml/callback`).

### Servidor próprio num celular Android (Termux)

O app do Tailscale para Android não tem o comando `serve`, então um servidor rodando no celular não ganha HTTPS do Tailscale. Você tem três saídas:

- usar o link normal (`http://100.x.x.x:3000`) e **Adicionar à tela inicial**: vira um atalho com ícone, mas sem tela cheia nem Compartilhar;
- rodar o SetupSniper num PC com `tailscale serve`;
- receber links pelo bot do Telegram, que funciona igual: no app da loja, **Compartilhar → Telegram → seu bot**.

### Servidor na nuvem (VPS)

1. Use um domínio seu e um proxy com HTTPS automático, por exemplo o Caddy:
   ```
   seudominio.com.br {
     reverse_proxy 127.0.0.1:3000
   }
   ```
2. **Defina uma `SENHA` forte no `.env`:** na nuvem o site fica na internet.
3. Lembre que servidores na nuvem são os **mais bloqueados** pelas lojas. Para a nuvem, use as APIs oficiais (`docs/fontes-oficiais.md`) e a extensão do navegador (`docs/extensao.md`), que envia os preços do seu celular ou PC para o servidor.

## Compartilhar do app da loja para o SetupSniper

Com o app instalado (HTTPS), no app da KaBuM!, da Amazon, do Mercado Livre etc.:

1. Toque em **Compartilhar → SetupSniper**.
2. O SetupSniper abre já calculando o Total Pix e o Total Crédito daquele link, com o botão **📌 Fixar**.
