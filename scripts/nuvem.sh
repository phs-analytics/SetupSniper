#!/usr/bin/env sh
# Nuvem de arquivos pessoal: página web para enviar/baixar arquivos + WebDAV, com login.
# Usa o dufs (pkg install dufs). Se não houver, usa o rclone (só WebDAV).
# Uso: ./scripts/nuvem.sh           (primeiro plano)
#      ./scripts/nuvem.sh --tmux    (segundo plano, sessão tmux "nuvem")
cd "$(dirname "$0")/.." || exit 1

# lê o .env (só linhas CHAVE=valor)
if [ -f .env ]; then
  while IFS='=' read -r k v; do
    case "$k" in NUVEM_*) eval "export $k=\"\$v\"" ;; esac
  done <<EOF2
$(grep -E '^NUVEM_[A-Z_]+=' .env)
EOF2
fi
USUARIO="${NUVEM_USUARIO:-eu}"
PORTA="${NUVEM_PORTA:-8090}"
PASTA="$(eval echo "${NUVEM_PASTA:-$HOME/Nuvem}")"

if [ -z "$NUVEM_SENHA" ]; then
  echo "Defina NUVEM_SENHA no arquivo .env antes de ligar a nuvem (nano .env)."; exit 1
fi
case "$NUVEM_SENHA" in *:*|*@*) echo "A NUVEM_SENHA não pode ter ':' nem '@'."; exit 1 ;; esac

if [ "$1" = "--tmux" ]; then
  tmux has-session -t nuvem 2>/dev/null && { echo "A nuvem já está rodando. Ver: tmux attach -t nuvem"; exit 0; }
  tmux new -d -s nuvem "sh $(pwd)/scripts/nuvem.sh" && echo "Nuvem ligada na porta $PORTA (pasta: $PASTA)."
  exit 0
fi

mkdir -p "$PASTA" logs
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock
while true; do
  echo "[$(date '+%d/%m %H:%M:%S')] nuvem: $PASTA na porta $PORTA" | tee -a logs/nuvem.log
  if command -v dufs >/dev/null 2>&1; then
    # -A: permite enviar, apagar, buscar e baixar pastas em .zip; só com login (rw)
    dufs "$PASTA" --bind 0.0.0.0 --port "$PORTA" -A --auth "$USUARIO:$NUVEM_SENHA@/:rw" 2>&1 | tee -a logs/nuvem.log
  elif command -v rclone >/dev/null 2>&1; then
    rclone serve webdav "$PASTA" --addr ":$PORTA" --user "$USUARIO" --pass "$NUVEM_SENHA" 2>&1 | tee -a logs/nuvem.log
  else
    echo "Instale o dufs: pkg install dufs"; exit 1
  fi
  tail -n 1000 logs/nuvem.log > logs/.tmpn && mv logs/.tmpn logs/nuvem.log
  echo "[$(date '+%d/%m %H:%M:%S')] nuvem parou, reiniciando em 5 s (CTRL+C para sair)"
  sleep 5
done
