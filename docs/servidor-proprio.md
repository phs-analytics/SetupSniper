# Servidor próprio

O SetupSniper é feito para rodar num **servidor seu**: qualquer máquina com **Node.js 18.18 ou mais novo** que fique ligada enquanto você quiser acompanhar preços. Não existe um servidor central do projeto, e os seus dados (fixados, histórico, tokens) ficam só nessa máquina.

Escolha o que você já tem em casa. Dá para trocar depois: basta copiar a pasta `data/` e o `.env` para a máquina nova.

## Onde rodar

| Opção | Bom para | Guia |
|---|---|---|
| **PC ou notebook** | começar agora, sem nada extra | [Instalação no computador](instalacao.md) e [Deixar ligado](#pc-ou-notebook) |
| **Linux, mini PC ou Raspberry Pi** | ficar ligado 24 h gastando pouca energia | [Linux com systemd](#linux-mini-pc-ou-raspberry-pi) |
| **Docker** (PC, NAS, home server) | quem já usa contêineres | [Docker](#docker) |
| **Celular Android antigo** | reaproveitar um aparelho parado, 24 h na tomada | [Celular Android (Termux)](#celular-android-termux) |
| **Servidor na nuvem (VPS)** | quem não quer nada ligado em casa | funciona, mas as lojas bloqueiam mais IPs de nuvem: use as [fontes oficiais](fontes-oficiais.md) e a [extensão](extensao.md) |

Em todas as opções:

- **Credenciais e senhas** ficam no arquivo `.env`, que nunca vai para o GitHub. Passo a passo: [credenciais.md](credenciais.md).
- **Internet residencial** (Wi-Fi ou 4G) costuma ser bloqueada bem menos pelas lojas que servidores na nuvem.
- **Rode o diagnóstico** depois de instalar: aba **Lojas → Testar as lojas agora**. Ele mostra quais lojas respondem no **seu** servidor e quais credenciais faltam.

## Acesse de qualquer lugar (Tailscale)

O **Tailscale** cria uma rede privada e criptografada entre os seus aparelhos, sem abrir portas no roteador.

1. Instale o Tailscale, com a mesma conta, no servidor, no seu celular e no PC.
2. No app, veja o IP do servidor. Ele começa com `100.`
3. Abra `http://100.x.x.x:3000`.

Dica: ative o **MagicDNS** no painel do Tailscale para usar um nome, como `http://meu-servidor:3000`. Para HTTPS (app instalável e login do Mercado Livre sem colar nada), veja [app-celular.md](app-celular.md).

## Acompanhe e atualize

| Como | O quê |
|---|---|
| Telegram | O bot avisa "🟢 SetupSniper ligado" a cada início. `/status` mostra versão, tempo ligado e memória. |
| Navegador | `http://SEU_SERVIDOR:3000/api/health` |
| Atualizar | Mande `/atualizar` para o bot, ou rode `git pull` na pasta do projeto e reinicie. No celular: `sh scripts/atualizar.sh`. |

Seus fixados, histórico e tokens ficam em arquivos fora do git e não são afetados pela atualização.

## PC ou notebook

Instale como em [instalacao.md](instalacao.md) e rode `npm start`. Para ligar sozinho:

- **Windows:** no Agendador de Tarefas, crie uma tarefa com o gatilho "Ao fazer logon" executando `node server.js` na pasta do projeto.
- **macOS e Linux:** use o exemplo de systemd abaixo (Linux) ou um item de login (macOS).

## Linux, mini PC ou Raspberry Pi

Use o systemd. Crie `/etc/systemd/system/setupsniper.service`:

```ini
[Unit]
Description=SetupSniper
After=network-online.target

[Service]
WorkingDirectory=/home/SEU_USUARIO/SetupSniper
ExecStart=/usr/bin/node server.js
Restart=always
User=SEU_USUARIO

[Install]
WantedBy=multi-user.target
```

Depois: `sudo systemctl enable --now setupsniper`.

## Docker

```bash
cp .env.example .env        # e preencha
docker compose up -d
```

Os seus dados ficam na pasta `data/`, montada como volume. Veja [`docker-compose.yml`](../docker-compose.yml).

## Celular Android (Termux)

Um celular antigo na tomada vira um servidor 24 h. Ele também pode servir a sua **nuvem de arquivos** (porta 8090, opcional, veja [nuvem.md](nuvem.md)).

**Requisitos:** Android 7 ou mais novo, Wi-Fi, carregador e uns 30 minutos. Para as lojas que bloqueiam, use as [fontes oficiais](fontes-oficiais.md) e a [extensão](extensao.md).

### 1. Instale os apps

- Pelo [F-Droid](https://f-droid.org): **Termux**, **Termux:Boot** e **Termux:API**.
- Pela Play Store: **Tailscale**.

> **Não instale o Termux pela Play Store.** A versão de lá está desatualizada e falha ao instalar pacotes.

### 2. Impeça o Android de fechar o servidor

- **Configurações → Apps → Termux → Bateria → Sem restrições.** Faça o mesmo para Termux:Boot e Tailscale.
- Abra o **Termux:Boot** uma vez (só abrir e fechar). Isso ativa o início automático.
- Se existir "Proteger bateria" ou "Limitar carga a 85%", ative.

### 3. Baixe e instale

No Termux:

```bash
pkg update -y && pkg install -y git
git clone https://github.com/phs-analytics/SetupSniper.git
cd SetupSniper
sh scripts/instalar-termux.sh
```

O instalador instala Node.js, git, tmux, SSH e a nuvem, cria o `.env` e configura o início automático. Quando o Android pedir acesso aos arquivos, toque em **Permitir**.

### 4. Defina as senhas

```bash
nano .env
```

Preencha `SENHA=` (do site) e, se for usar a nuvem, `NUVEM_SENHA=`. Use senhas diferentes. Para salvar no nano: **CTRL+O**, **Enter**, **CTRL+X**.

### 5. Ligue

O jeito mais simples é `sh scripts/ligar.sh`: ele liga o que estiver desligado e mostra um status de tudo. Para só conferir, use `sh scripts/ligar.sh --status`. Também dá para ligar cada parte separadamente:

```bash
sh scripts/iniciar.sh --tmux     # SetupSniper
sh scripts/nuvem.sh --tmux       # nuvem (opcional)
```

Os dois reiniciam sozinhos se caírem e ligam sozinhos quando o celular reinicia. Teste no navegador do próprio celular: `http://localhost:3000`.

### 6. Mantenha sempre ativo

O Android é feito para economizar bateria e costuma fechar apps em segundo plano. Para um servidor 24h, cubra estas camadas:

| Camada | O que faz | Como |
|---|---|---|
| Reinício automático | Religa o servidor se o processo cair | Já vem nos scripts `iniciar.sh` e `nuvem.sh` |
| Wake lock | Impede o celular de "dormir" com o servidor ligado | Já vem nos scripts (notificação fixa do Termux) |
| Boot automático | Liga tudo quando o celular reinicia | Termux:Boot (passo 2) |
| **Vigia** | A cada 15 min, religa o que tiver caído, mesmo se o Android fechar o Termux | `sh scripts/vigia.sh --instalar` (já roda no instalador; precisa do Termux:API) |

#### Ajustes do Android

- **Bateria sem restrições** para Termux, Termux:Boot, Termux:API e Tailscale.
- **Pausar app se não usado:** em **Configurações → Apps → Termux**, desative "Pausar atividade do app se não usado" ou "Remover permissões".
- **Tailscale sempre ligado:** em **Configurações → Rede → VPN → Tailscale (⚙️)**, ative **VPN sempre ativa**. Não ative "Bloquear conexões sem VPN".
- **Wi-Fi:** desative "Alternar para dados móveis" ou "Wi-Fi adaptativo". Em Androids antigos, ative "Manter Wi-Fi ligado durante suspensão: Sempre".
- **Atualizações automáticas:** em **Opções do desenvolvedor**, desative "Atualizações automáticas do sistema", para o celular não reiniciar sozinho de madrugada.
- **Trave o Termux nos recentes:** abra a tela de apps recentes e toque no ícone do Termux para escolher **Bloquear** ou **Manter aberto**, ou arraste o card para baixo.

#### Por marca

| Marca | Ajuste extra |
|---|---|
| Samsung | **Bateria → Limites de uso em segundo plano → Apps que nunca suspendem**: adicione Termux, Termux:API e Tailscale. Desative "Colocar apps não usados para suspender". |
| Xiaomi / Redmi / POCO | **Apps → Permissões → Início automático**: ative Termux, Termux:Boot e Tailscale. Em **Economia de bateria** do app, escolha **Sem restrições**. |
| Motorola | **Bateria → Otimização** (ou "Uso em segundo plano"): **Sem restrições** para os apps. |
| Huawei / Honor | **Bateria → Inicialização de apps**: desative o gerenciamento automático e ative as três opções manuais. |

Mais detalhes por modelo em [dontkillmyapp.com](https://dontkillmyapp.com).

#### Android 12 ou mais novo: limite de processos

O Android 12+ encerra processos "filhos" em excesso (o erro aparece como `[Process completed (signal 9)]`).

- **Android 14 ou mais novo:** em **Opções do desenvolvedor**, ative **"Desativar restrições de processos filhos"**.
- **Android 12 e 13:** pelo PC, com a [depuração USB](https://developer.android.com/studio/debug/dev-options) ativada e o [ADB](https://developer.android.com/tools/releases/platform-tools) instalado:

```bash
adb shell "/system/bin/device_config set_sync_disabled_for_tests persistent"
adb shell "/system/bin/device_config put activity_manager max_phantom_processes 2147483647"
adb shell settings put global settings_enable_monitor_phantom_procs false
```

#### Falta de energia

Com a bateria, o celular aguenta horas sem tomada. Se ela acabar, ligue o celular de novo e **desbloqueie a tela uma vez**: o Termux:Boot e o vigia cuidam do resto. Alguns modelos têm "Ligar ao conectar o carregador" nas configurações ou no modo de recuperação.

#### Como saber se está tudo bem

- O bot avisa **"🟢 SetupSniper ligado"** a cada início. Se chegar sem você ter feito nada, houve uma queda e o servidor voltou sozinho.
- `/status` no bot mostra há quanto tempo o servidor está ligado.
- `cat ~/SetupSniper/logs/vigia.log` mostra quando o vigia precisou religar algo.

#### SSH e tela do servidor

| Como | O quê |
|---|---|
| Terminal (SSH) | `ssh -p 8022 USUARIO@100.x.x.x`, depois `tail -f ~/SetupSniper/logs/server.log` |
| Tela do servidor | `tmux attach -t sniper` (sair: **CTRL+B**, depois **D**) |

Para o SSH, rode uma vez no Termux: `passwd` (cria a senha) e `whoami` (mostra o usuário). Evite editar arquivos do projeto direto no celular; se editar, use `git stash` antes de atualizar.

### Problemas comuns no celular

| Sintoma | O que fazer |
|---|---|
| O site some depois de um tempo | Revise o passo 6, "Mantenha sempre ativo". |
| "Já está rodando" | O servidor já está ligado: `tmux attach -t sniper`. |
| Não abre pelo Tailscale | Confira se o Tailscale está conectado nos dois aparelhos e se o endereço termina em `:3000`. |
| Não ligou sozinho depois de reiniciar | Desbloqueie a tela uma vez e espere 30 s. Rode `sh scripts/ligar.sh` para religar e ver o que falta. Confira se o **Termux:Boot** foi aberto uma vez, se veio do **F-Droid** (igual ao Termux) e se tem bateria **Sem restrições**. O registro do boot fica em `logs/boot.log`. |
| `/atualizar` falhou | Pelo SSH: `cd ~/SetupSniper && git status`. |

Mais respostas em [faq.md](faq.md).

Mais respostas em [faq.md](faq.md).
