#!/data/data/com.termux/files/usr/bin/sh
# Vigia: confere a cada 15 min se o SetupSniper e a nuvem estão no ar e religa o que tiver caído.
# Roda pelo agendador do Android (termux-job-scheduler), que funciona mesmo se o Termux for fechado
# e continua valendo depois de reiniciar o celular.
#
# Ativar:     ./scripts/vigia.sh --instalar
# Desativar:  ./scripts/vigia.sh --remover
# Rodar já:   ./scripts/vigia.sh
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR" || exit 1
mkdir -p logs
LOG="$DIR/logs/vigia.log"
agora() { date '+%d/%m %H:%M:%S'; }

case "$1" in
  --instalar)
    command -v termux-job-scheduler >/dev/null 2>&1 || { echo "Instale o app Termux:API (F-Droid) e rode: pkg install termux-api"; exit 1; }
    termux-job-scheduler --job-id 51 --script "$DIR/scripts/vigia.sh" --period-ms 900000 --persisted true --network any >/dev/null \
      && echo "Vigia ativado: confere o servidor a cada 15 min (inclusive depois de reiniciar)."
    exit 0 ;;
  --remover)
    termux-job-scheduler --cancel --job-id 51 >/dev/null 2>&1; echo "Vigia desativado."; exit 0 ;;
esac

command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock

# SetupSniper
if ! tmux has-session -t sniper 2>/dev/null; then
  echo "[$(agora)] SetupSniper estava parado — religando" >> "$LOG"
  sh "$DIR/scripts/iniciar.sh" --tmux >> "$LOG" 2>&1
else
  PORTA=$(grep -E '^PORT=' .env 2>/dev/null | cut -d= -f2); PORTA=${PORTA:-3000}
  # sessão existe mas o servidor não responde há tempo demais → reinicia o processo (o laço do iniciar.sh sobe de novo)
  if command -v curl >/dev/null 2>&1 && ! curl -fs -m 10 "http://127.0.0.1:$PORTA/api/health" >/dev/null 2>&1; then
    sleep 30
    if ! curl -fs -m 10 "http://127.0.0.1:$PORTA/api/health" >/dev/null 2>&1; then
      echo "[$(agora)] SetupSniper não respondia — reiniciando" >> "$LOG"
      pkill -f "node server.js"
    fi
  fi
fi

# Nuvem (só se houver senha configurada)
if grep -qE '^NUVEM_SENHA=.+' .env 2>/dev/null && ! tmux has-session -t nuvem 2>/dev/null; then
  echo "[$(agora)] nuvem estava parada — religando" >> "$LOG"
  sh "$DIR/scripts/nuvem.sh" --tmux >> "$LOG" 2>&1
fi

# SSH (se você configurou senha com passwd)
command -v sshd >/dev/null 2>&1 && ! pgrep -x sshd >/dev/null 2>&1 && [ -f "$PREFIX/etc/ssh/sshd_config" ] && sshd 2>/dev/null

tail -n 300 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"
exit 0
