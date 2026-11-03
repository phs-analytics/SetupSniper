#!/data/data/com.termux/files/usr/bin/sh
# Instalação completa no Android (Termux). Rode de dentro da pasta do projeto.
set -e
cd "$(dirname "$0")/.."
pkg update -y && pkg upgrade -y
pkg install -y nodejs-lts git tmux openssh termux-api curl
pkg install -y dufs || pkg install -y rclone   # nuvem de arquivos
[ -d ~/storage ] || termux-setup-storage        # acesso ao armazenamento do Android (toque em Permitir)
[ -f .env ] || { cp .env.example .env; echo "Criei o arquivo .env — edite com: nano .env"; }
chmod +x scripts/*.sh

# Liga sozinho quando o celular reinicia (precisa do app Termux:Boot aberto uma vez)
mkdir -p ~/.termux/boot logs
cat > ~/.termux/boot/setupsniper.sh <<BOOT
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
sh $(pwd)/scripts/ligar.sh > $(pwd)/logs/boot.log 2>&1
BOOT
chmod +x ~/.termux/boot/setupsniper.sh

# Vigia: religa o que cair, a cada 15 min (precisa do app Termux:API)
sh scripts/vigia.sh --instalar || echo "Vigia não ativado: instale o app Termux:API e rode: sh scripts/vigia.sh --instalar"

echo
echo "Pronto! Próximos passos:"
echo "  1. nano .env                      (defina SENHA e NUVEM_SENHA)"
echo "  2. passwd                         (senha do SSH, opcional)"
echo "  3. sh scripts/ligar.sh            (liga tudo e mostra o status)"
