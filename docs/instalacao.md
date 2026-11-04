# Instalação no computador

Funciona no Windows, macOS e Linux. Não há dependências para instalar: só o Node.js.

## 1. Instale o Node.js

Baixe a versão **LTS** em [nodejs.org](https://nodejs.org) (precisa ser 18.18 ou mais nova). Para conferir:

```bash
node -v
```

## 2. Baixe o projeto

Com Git:

```bash
git clone https://github.com/phs-analytics/SetupSniper.git
cd SetupSniper
```

Sem Git: na página do repositório, clique em **Code → Download ZIP** e extraia.

## 3. Configure

```bash
cp .env.example .env        # no Windows (PowerShell): copy .env.example .env
```

Abra o `.env` num editor de texto e preencha pelo menos `SENHA=`. Todas as opções estão comentadas no próprio arquivo.

## 4. Rode

```bash
npm start
```

Abra **http://localhost:3000**. Para só conhecer a interface, com preços simulados, use `npm run demo`.

## Opcional: Docker

```bash
cp .env.example .env        # e preencha
docker compose up -d
```

Os seus dados ficam na pasta `data/`, montada como volume. Veja [`docker-compose.yml`](../docker-compose.yml).

## Deixar ligado no computador

- **Linux (systemd):** veja o exemplo em [servidor-proprio.md](servidor-proprio.md#linux-mini-pc-ou-raspberry-pi).
- **Windows:** use o Agendador de Tarefas com o gatilho "Ao fazer logon" executando `node server.js` na pasta do projeto.

Para rodar 24 h sem deixar o PC ligado, veja as outras opções de [servidor próprio](servidor-proprio.md): mini PC, Raspberry Pi, Docker, VPS ou um celular Android antigo. As credenciais vão no `.env`: [credenciais.md](credenciais.md).
