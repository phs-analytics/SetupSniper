#!/data/data/com.termux/files/usr/bin/sh
# Instalação completa no Android (Termux). Rode de dentro da pasta do projeto.
set -e
cd "$(dirname "$0")/.."
pkg update -y && pkg upgrade -y
pkg install -y nodejs-lts git tmux openssh termux-api
pkg install -y dufs || pkg install -y rclone   # nuvem de arquivos
[ -d ~/storage ] || termux-setup-storage        # acesso ao armazenamento do Android (toque em Permitir)
[ -f .env ] || { cp .env.example .env; echo "Criei o arquivo .env — edite com: nano .env"; }
chmod +x scripts/*.sh

# Liga sozinho quando o celular reinicia (precisa do app Termux:Boot aberto uma vez)
mkdir -p ~/.termux/boot
cat > ~/.termux/boot/setupsniper.sh <<BOOT
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
sshd
$(pwd)/scripts/iniciar.sh --tmux
$(pwd)/scripts/nuvem.sh --tmux
BOOT
chmod +x ~/.termux/boot/setupsniper.sh

echo
echo "Pronto! Próximos passos:"
echo "  1. nano .env                      (defina SENHA e NUVEM_SENHA)"
echo "  2. ./scripts/iniciar.sh --tmux    (liga o SetupSniper na porta 3000)"
echo "  3. ./scripts/nuvem.sh --tmux      (liga a nuvem de arquivos na porta 8090)"
echo "  4. passwd && sshd                 (acesso SSH pela porta 8022, opcional)"
