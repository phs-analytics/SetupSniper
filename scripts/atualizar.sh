#!/usr/bin/env sh
# Baixa a versão mais nova do GitHub e reinicia o servidor (o iniciar.sh sobe de novo sozinho).
cd "$(dirname "$0")/.." || exit 1
before=$(git rev-parse --short HEAD)
git pull --ff-only || { echo "Falhou. Se você mudou arquivos aqui, veja: git status"; exit 1; }
after=$(git rev-parse --short HEAD)
if [ "$before" = "$after" ]; then echo "Já está na versão mais nova ($after)."; exit 0; fi
echo "Atualizado $before -> $after:"; git log --oneline "$before..$after"
pkill -f "node server.js" && echo "Reiniciando…" || echo "Servidor não estava rodando. Inicie com ./scripts/iniciar.sh --tmux"
