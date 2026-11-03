#!/data/data/com.termux/files/usr/bin/sh
# Instalação completa no Android (Termux). Rode de dentro da pasta do projeto.
set -e
cd "$(dirname "$0")/.."
pkg update -y && pkg upgrade -y
pkg install -y nodejs-lts git tmux openssh termux-api
[ -f .env ] || { cp .env.example .env; echo "Criei o arquivo .env — edite com: nano .env"; }
chmod +x scripts/*.sh

# Liga sozinho quando o celular reinicia (precisa do app Termux:Boot aberto uma vez)
mkdir -p ~/.termux/boot
cat > ~/.termux/boot/setupsniper.sh <<BOOT
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
sshd
$(pwd)/scripts/iniciar.sh --tmux
BOOT
chmod +x ~/.termux/boot/setupsniper.sh

echo
echo "Pronto! Próximos passos:"
echo "  1. nano .env                      (defina SENHA)"
echo "  2. ./scripts/iniciar.sh --tmux    (liga o servidor)"
echo "  3. passwd && sshd                 (acesso SSH pela porta 8022, opcional)"
