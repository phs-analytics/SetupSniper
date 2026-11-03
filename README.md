# 🎯 SetupSniper

Busque peças de PC em várias lojas brasileiras ao mesmo tempo, veja um **score de confiabilidade (0–100)** de cada loja ao lado do preço e receba **alertas no Telegram** quando o preço cair.

Não precisa instalar nenhuma dependência: basta ter o Node.js. Roda no PC ou num **celular Android antigo** usado como servidor 24h.

![Busca](docs/busca.png)

## O que ele faz

- **Busca livre**: digite qualquer produto e os resultados de cada loja aparecem conforme ela responde.
- **Lojas**: KaBuM!, Pichau, Terabyte, Amazon, Mercado Livre, Magazine Luiza, AliExpress e Shopee.
- **Busca profunda**: consulta mais páginas, inclui os comparadores Buscapé e Zoom e, no PC, pode usar um navegador headless para lojas que bloqueiam robôs.
- **Filtro de lixo**: descarta acessórios ("suporte para…", "adesivo…") e marca como **suspeito** preço muito abaixo da mediana, que pode ser golpe ou outro produto.
- **📌 Fixar produtos**: fixe uma oferta direto da busca (ou pelo Telegram) com uma **meta de preço**. Os fixados aparecem no topo da busca. O servidor confere todos a cada 15 min e guarda o histórico.
- **🔔 Alertas no Telegram**: avisa quando um fixado atinge a meta ou cai X% abaixo da média de 30 dias. Dá para ligar ou desligar os alertas de cada produto.
- **Confiabilidade**: o score de cada loja combina Reclame Aqui (40%), avaliação da loja (25%), volume de vendas (20%) e reviews (15%).

![Fixados](docs/fixados.png)

## Começando

Requer **Node.js 18+**, sem `npm install`.

```bash
git clone https://github.com/SEU-USUARIO/SetupSniper.git
cd SetupSniper
cp .env.example .env      # defina uma SENHA
npm start                 # http://localhost:3000
```

Quer só ver a interface? Rode `npm run demo` (preços simulados).

### Busca profunda com navegador (opcional, só no PC)

Shopee e AliExpress costumam bloquear requisições simples. No PC, instale o Playwright para que a busca profunda use um navegador de verdade:

```bash
npm install playwright && npx playwright install chromium
```

## Celular Android como servidor

Use o [Termux](https://f-droid.org/packages/com.termux/) (pelo F-Droid, **não** pela Play Store) e o Termux:Boot.

```bash
pkg install -y git
git clone https://github.com/SEU-USUARIO/SetupSniper.git && cd SetupSniper
./scripts/instalar-termux.sh       # instala Node, git, tmux, ssh e configura o boot
nano .env                          # defina SENHA
./scripts/iniciar.sh --tmux        # liga em segundo plano e reinicia sozinho se cair
```

- **Acesso de qualquer lugar**: instale o [Tailscale](https://tailscale.com) no celular servidor e nos seus aparelhos e abra `http://IP-tailscale:3000`.
- **Ver o que está acontecendo**: `tmux attach -t sniper` (sair: CTRL+B, depois D), `tail -f logs/server.log` ou `/status` no Telegram.
- **Atualizar**: `./scripts/atualizar.sh` ou `/atualizar` no Telegram.
- **Acesso remoto ao terminal**: rode `passwd` e `sshd` no Termux; do PC, use `ssh -p 8022 usuario@IP-tailscale`.
- Em **Configurações → Apps → Termux → Bateria**, escolha **Sem restrições**.

## Telegram

1. No Telegram, fale com o [@BotFather](https://t.me/BotFather), envie `/newbot` e copie o token.
2. Abra o site, vá na aba **Alertas**, cole o token e salve.
3. Envie `/start` para o seu bot. O chat é conectado sozinho e só ele pode usar os comandos.

| Comando | O que faz |
|---|---|
| `/fixados` | Lista os produtos fixados com o melhor preço atual |
| `/fixar ryzen 5 7600 meta 1200` | Fixa um produto (a meta é opcional) |
| `/desafixar 2` | Remove o fixado nº 2 da lista |
| `/buscar rtx 4060` | Busca rápida nas lojas |
| `/status` | Mostra versão, tempo ligado e memória do servidor |
| `/atualizar` | Baixa a versão nova do GitHub e reinicia |

## Segurança e privacidade

- **Seus dados ficam só na sua máquina.** O token, os produtos fixados, o histórico e os alertas ficam em `data/settings.json`, `data/watchlist.json`, `data/history.json`, `data/alerts.json` e `.env`. Todos estão no `.gitignore` e **nunca** vão para o git.
- **Defina `SENHA` no `.env`**: quem abre o site pode alterar os produtos fixados e as configurações.
- **Não exponha a porta 3000 direto na internet.** Prefira o Tailscale, que é privado e criptografado.
- **Links fixos são restritos às lojas suportadas**, então o servidor não busca endereços arbitrários.
- **Se o token do bot vazar**, gere outro no @BotFather (`/revoke`).

## Avisos

- **A coleta de preços é por raspagem de páginas públicas.** Se uma loja mudar o layout ou bloquear o acesso, o site mostra o erro daquela loja e as outras continuam funcionando. Os intervalos padrão são conservadores; não os reduza muito.
- **Os valores de confiabilidade em `data/stores.json` são estimativas iniciais.** Confira no Reclame Aqui e ajuste. O servidor tenta atualizar esses dados sozinho (melhor esforço).
- **Projeto pessoal, sem vínculo com as lojas citadas.** Confira sempre o preço e o vendedor na página da loja antes de comprar.

## Estrutura

```
server.js              servidor HTTP, busca em streaming, fixados e alertas
src/stores.js          adaptadores de cada loja
src/extract.js         extrator genérico (JSON embutido / HTML) e filtros
src/reliability.js     cálculo do score de confiabilidade
src/telegram.js        bot do Telegram
src/browser.js         navegador headless opcional (Playwright)
src/update.js          versão e autoatualização via git
scripts/               iniciar, atualizar e instalar no Termux
data/stores.json       lojas e indicadores de confiabilidade
public/                interface
```

### Adicionar uma loja

1. Crie a entrada em `src/stores.js` (URL de busca e, se precisar, um `parse`). Na maioria das lojas o extrator genérico já funciona.
2. Crie a entrada em `data/stores.json` com cor e indicadores.

Contribuições são bem-vindas.

## Licença

MIT
