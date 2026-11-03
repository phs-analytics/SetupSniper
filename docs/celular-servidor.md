# Celular Android antigo como servidor pessoal

O celular fica na tomada 24h rodando:

- **SetupSniper** (porta 3000): caça preços e avisa no Telegram.
- **Nuvem de arquivos** (porta 8090, opcional): seus arquivos acessíveis de qualquer lugar. Veja [nuvem.md](nuvem.md).

Você acessa de qualquer lugar pelo **Tailscale**, uma rede privada e criptografada entre os seus aparelhos.

**Requisitos:** Android 7 ou mais novo, Wi-Fi, carregador e uns 30 minutos.

## 1. Instale os apps

- Pelo [F-Droid](https://f-droid.org): **Termux**, **Termux:Boot** e **Termux:API**.
- Pela Play Store: **Tailscale**.

> **Não instale o Termux pela Play Store.** A versão de lá está desatualizada e falha ao instalar pacotes.

## 2. Impeça o Android de fechar o servidor

- **Configurações → Apps → Termux → Bateria → Sem restrições.** Faça o mesmo para Termux:Boot e Tailscale.
- Abra o **Termux:Boot** uma vez (só abrir e fechar). Isso ativa o início automático.
- Se existir "Proteger bateria" ou "Limitar carga a 85%", ative.

## 3. Baixe e instale

No Termux:

```bash
pkg update -y && pkg install -y git
git clone https://github.com/phs-analytics/SetupSniper.git
cd SetupSniper
./scripts/instalar-termux.sh
```

O instalador instala Node.js, git, tmux, SSH e a nuvem, cria o `.env` e configura o início automático. Quando o Android pedir acesso aos arquivos, toque em **Permitir**.

## 4. Defina as senhas

```bash
nano .env
```

Preencha `SENHA=` (do site) e, se for usar a nuvem, `NUVEM_SENHA=`. Use senhas diferentes. Para salvar no nano: **CTRL+O**, **Enter**, **CTRL+X**.

## 5. Ligue

```bash
./scripts/iniciar.sh --tmux     # SetupSniper
./scripts/nuvem.sh --tmux       # nuvem (opcional)
```

Os dois reiniciam sozinhos se caírem e ligam sozinhos quando o celular reinicia. Teste no navegador do próprio celular: `http://localhost:3000`.

## 6. Acesse de qualquer lugar (Tailscale)

1. Entre no app Tailscale, com a mesma conta, no celular servidor, no seu celular e no PC.
2. No app, veja o IP do celular servidor. Ele começa com `100.`
3. Abra `http://100.x.x.x:3000` (SetupSniper) ou `http://100.x.x.x:8090` (nuvem).

Dica: ative o **MagicDNS** no painel do Tailscale para usar um nome, como `http://celular-antigo:3000`.

## 7. Acompanhe o servidor

| Como | O quê |
|---|---|
| Telegram | O bot avisa "🟢 SetupSniper ligado" a cada início. `/status` mostra versão, tempo ligado e memória. |
| Navegador | `http://100.x.x.x:3000/api/health` |
| Terminal (SSH) | `ssh -p 8022 USUARIO@100.x.x.x`, depois `tail -f ~/SetupSniper/logs/server.log` |
| Tela do servidor | `tmux attach -t sniper` (sair: **CTRL+B**, depois **D**) |

Para o SSH, rode uma vez no Termux: `passwd` (cria a senha) e `whoami` (mostra o usuário).

## 8. Atualize

Mande `/atualizar` para o bot ou rode:

```bash
cd ~/SetupSniper && ./scripts/atualizar.sh
```

Seus fixados, histórico e token ficam em arquivos fora do git e não são afetados. Evite editar arquivos do projeto direto no celular. Se editar, use `git stash` antes de atualizar.

## Problemas comuns

| Sintoma | O que fazer |
|---|---|
| O site some depois de um tempo | Revise o passo 2. No Android 12+, ative em **Opções do desenvolvedor** "Desativar restrições de processos filhos", se existir. |
| "Já está rodando" | O servidor já está ligado: `tmux attach -t sniper`. |
| Não abre pelo Tailscale | Confira se o Tailscale está conectado nos dois aparelhos e se o endereço termina em `:3000`. |
| `/atualizar` falhou | Pelo SSH: `cd ~/SetupSniper && git status`. |

Mais respostas em [faq.md](faq.md).

## Outros servidores

Num Raspberry Pi ou PC Linux, use o systemd. Crie `/etc/systemd/system/setupsniper.service`:

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
