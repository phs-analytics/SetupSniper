# Segurança

## Seus dados

O SetupSniper roda só na sua máquina. Estes arquivos contêm dados pessoais e **nunca** devem ir para o git (já estão no `.gitignore`, e o `npm run check` confere):

| Arquivo | Conteúdo |
|---|---|
| `.env` | senhas do site e da nuvem, token do Telegram |
| `data/settings.json` | token e chat do Telegram, regras de alerta |
| `data/watchlist.json` | seus produtos fixados |
| `data/history.json`, `data/alerts.json` | histórico de preços e alertas |
| `logs/` | registros do servidor |

## Recomendações

- Defina `SENHA` (site) e `NUVEM_SENHA` (nuvem), e use senhas diferentes.
- Acesse de fora de casa **só pelo Tailscale**. Não abra as portas 3000 e 8090 no roteador.
- Se o token do bot vazar, revogue no [@BotFather](https://t.me/BotFather) com `/revoke`.
- Mantenha o projeto atualizado (`/atualizar` no Telegram ou `./scripts/atualizar.sh`).

## Relatar uma vulnerabilidade

**Não abra uma issue pública.** Use o botão **Report a vulnerability**, na aba **Security** do repositório (GitHub Security Advisories). Descreva o problema e como reproduzir. Responderemos assim que possível.
