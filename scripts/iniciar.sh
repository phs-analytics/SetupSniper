#!/usr/bin/env sh
# Inicia o SetupSniper e o reinicia sozinho se cair (ou depois do /atualizar).
# Uso: ./scripts/iniciar.sh           (em primeiro plano)
#      ./scripts/iniciar.sh --tmux    (em segundo plano, numa sessão tmux chamada "sniper")
cd "$(dirname "$0")/.." || exit 1

if [ "$1" = "--tmux" ]; then
  tmux has-session -t sniper 2>/dev/null && { echo "Já está rodando. Veja com: tmux attach -t sniper"; exit 0; }
  tmux new -d -s sniper "$(pwd)/scripts/iniciar.sh" && echo "Rodando em segundo plano. Ver: tmux attach -t sniper (sair: CTRL+B, depois D)"
  exit 0
fi

command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock
mkdir -p logs
while true; do
  echo "[$(date '+%d/%m %H:%M:%S')] iniciando SetupSniper" | tee -a logs/server.log
  node server.js 2>&1 | tee -a logs/server.log
  # mantém o log com no máximo ~2000 linhas
  tail -n 2000 logs/server.log > logs/.tmp && mv logs/.tmp logs/server.log
  echo "[$(date '+%d/%m %H:%M:%S')] servidor parou, reiniciando em 5 s (CTRL+C para sair)" | tee -a logs/server.log
  sleep 5
done
