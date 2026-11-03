# Nuvem de arquivos pessoal

O `scripts/nuvem.sh` transforma o servidor numa nuvem particular usando o [dufs](https://github.com/sigoden/dufs). O dufs oferece:

- uma página web para **enviar, baixar, buscar e apagar** arquivos e baixar pastas em .zip;
- **WebDAV**, para abrir os arquivos como uma pasta no PC ou no celular;
- **login obrigatório**: sem `NUVEM_SENHA`, a nuvem não liga.

Se o dufs não estiver disponível, o script usa o `rclone serve webdav`, que oferece só o WebDAV.

## Ligar

```bash
nano .env              # preencha NUVEM_SENHA (sem ':' nem '@')
sh scripts/nuvem.sh --tmux
```

| Opção no `.env` | Padrão | Para quê |
|---|---|---|
| `NUVEM_USUARIO` | `eu` | usuário do login |
| `NUVEM_SENHA` | — | senha (obrigatória) |
| `NUVEM_PORTA` | `8090` | porta |
| `NUVEM_PASTA` | `~/storage/shared/Nuvem` | pasta compartilhada (no Android, o armazenamento interno) |

No computador, instale o dufs pelo [site do projeto](https://github.com/sigoden/dufs#install), com `cargo install dufs` ou `brew install dufs`.

## Acessar

> Na primeira vez, a página mostra **"Empty folder"** (pasta vazia). Está certo: use o botão de **enviar (↑)** no topo para mandar o primeiro arquivo. Se os botões de enviar e de nova pasta não aparecerem, o login não foi aplicado: confira a `NUVEM_SENHA` e ligue a nuvem de novo.

- **Navegador:** `http://IP-tailscale:8090`
- **Windows:** [RaiDrive](https://www.raidrive.com), com WebDAV, `http`, porta 8090 e o seu usuário e senha. O "Mapear unidade de rede" nativo do Windows exige HTTPS para WebDAV com senha.
- **Android:** Solid Explorer, CX File Explorer ou Material Files, adicionando um armazenamento WebDAV.
- **iPhone/Mac:** app Arquivos ou Finder, em **Conectar ao servidor**, com o endereço `http://IP-tailscale:8090`.
- **Linux/rclone:** `rclone mount`, com um remote WebDAV.

## Segurança

- **Use só pelo Tailscale.** O tráfego entre os seus aparelhos já é criptografado.
- **Nunca abra a porta 8090 no roteador.** Nesse caso o tráfego seria HTTP sem criptografia.
- **Use uma senha diferente da do site e de outros serviços.**
- **A nuvem não é backup.** Se o celular quebrar, os arquivos vão junto. Mantenha uma cópia do que for importante em outro lugar.
