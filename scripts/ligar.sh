#!/usr/bin/env sh
# Liga tudo (SetupSniper, nuvem e SSH) e mostra o que está funcionando.
# Uso: ./scripts/ligar.sh            liga o que estiver desligado e mostra o status
#      ./scripts/ligar.sh --status   só mostra o status, sem ligar nada
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR" || exit 1
ok() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
no() { printf '  \033[31m✗\033[0m %s\n' "$1"; }

if [ "$1" != "--status" ]; then
  command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock
  tmux has-session -t sniper 2>/dev/null || sh scripts/iniciar.sh --tmux >/dev/null
  if grep -qE '^NUVEM_SENHA=.+' .env 2>/dev/null; then tmux has-session -t nuvem 2>/dev/null || sh scripts/nuvem.sh --tmux >/dev/null; fi
  command -v sshd >/dev/null 2>&1 && ! pgrep -x sshd >/dev/null 2>&1 && sshd 2>/dev/null
  sleep 4
fi

PORTA=$(grep -E '^PORT=' .env 2>/dev/null | cut -d= -f2); PORTA=${PORTA:-3000}
NPORTA=$(grep -E '^NUVEM_PORTA=' .env 2>/dev/null | cut -d= -f2); NPORTA=${NPORTA:-8090}
echo "SetupSniper — status"
if curl -fs -m 5 "http://127.0.0.1:$PORTA/api/health" >/dev/null 2>&1; then ok "SetupSniper respondendo (porta $PORTA)"
elif tmux has-session -t sniper 2>/dev/null; then no "SetupSniper iniciando ou com erro — veja: tmux attach -t sniper"
else no "SetupSniper desligado"; fi
if grep -qE '^NUVEM_SENHA=.+' .env 2>/dev/null; then
  tmux has-session -t nuvem 2>/dev/null && ok "Nuvem ligada (porta $NPORTA)" || no "Nuvem desligada — veja: tmux attach -t nuvem"
else echo "  – Nuvem não configurada (NUVEM_SENHA vazia no .env)"; fi
pgrep -x sshd >/dev/null 2>&1 && ok "SSH ligado (porta 8022)" || echo "  – SSH desligado (opcional)"
[ -x "$HOME/.termux/boot/setupsniper.sh" ] && ok "Início automático configurado (Termux:Boot)" || no "Início automático NÃO configurado — rode: sh scripts/instalar-termux.sh"
if command -v termux-job-scheduler >/dev/null 2>&1 && termux-job-scheduler --pending 2>/dev/null | grep -q 'vigia'; then ok "Vigia ativo (a cada 15 min)"
else no "Vigia não ativo — rode: sh scripts/vigia.sh --instalar (precisa do app Termux:API)"; fi
