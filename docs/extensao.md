# Extensão do navegador: preços enviados sozinhos (PC e celular)

A extensão faz o mesmo que o favorito "Enviar para o SetupSniper", mas **sem você tocar em nada**. Sempre que você abrir a página de um produto ou de uma busca numa das 8 lojas, ela manda os preços para o **seu** servidor.

O que acontece com cada página enviada:

- os preços entram no **comparativo** da busca, marcados "do seu navegador", por 24 h;
- se o produto estiver fixado com aquele link, os **Fixados** são atualizados na hora, com histórico e alertas;
- quando a loja recusa o servidor, o preço enviado pelo navegador continua valendo nos Fixados por até 12 h.

**O que ela não faz:**

- não abre páginas, não clica e não navega sozinha: só lê as páginas que você abriu;
- não envia carrinho, pagamento, login, conta, pedidos, endereço nem favoritos (esses endereços são ignorados);
- só fala com o endereço do servidor que você digitar, e a permissão para isso é pedida na hora.

O código está na pasta `extensao/` do projeto. São quatro arquivos curtos, sem bibliotecas.

## PC: Chrome, Edge, Brave ou Opera

1. Baixe o projeto (ou use a pasta que já está no seu PC).
2. Abra `chrome://extensions` (no Edge, `edge://extensions`) e ligue o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e escolha a pasta `extensao`.
4. Clique no ícone da extensão (peça de quebra-cabeça → SetupSniper):
   - em **Endereço do seu SetupSniper**, digite o endereço do seu servidor, por exemplo `http://100.101.102.103:3000`;
   - em **Senha do site**, digite a senha, se o site tiver uma;
   - clique em **Salvar e testar** e aceite a permissão.
5. Pronto. Navegue nas lojas normalmente. O número no ícone mostra quantas ofertas foram enviadas da última página.

Para atualizar a extensão depois de um `git pull`, clique em ⟳ no card dela em `chrome://extensions`.

## PC: Firefox

Firefox 121 ou mais novo.

- **Para testar:** abra `about:debugging#/runtime/this-firefox` → **Carregar extensão temporária** → escolha `extensao/manifest.json`. Ela some quando o Firefox fecha.
- **Para ficar instalada:** use a versão assinada (veja "Celular" abaixo; o mesmo arquivo `.xpi` serve no PC).

## Celular (Android): Firefox

O Chrome do Android não aceita extensões. O **Firefox para Android** aceita, desde que a extensão seja **assinada** pela Mozilla. A assinatura é grátis e não publica nada: a extensão fica "não listada", só para você.

1. **Compacte a pasta** `extensao` num `.zip`, com os arquivos na raiz do zip, não dentro de uma subpasta.
2. **Envie para assinar.** Entre em https://addons.mozilla.org/developers/ (conta grátis) → **Enviar um novo complemento** → **Por conta própria** (sem publicar) → envie o `.zip`.
3. **Baixe o `.xpi` assinado** quando ficar pronto. Costuma levar poucos minutos.
4. **Instale no celular.** Abra o Firefox para Android e use **Configurações → Sobre o Firefox → toque 5× no logotipo** para ativar o menu de depuração. Depois, **Configurações → Instalar extensão a partir de arquivo** e escolha o `.xpi`.
   - O nome dessa opção pode mudar entre versões do Firefox.
   - Em versões em que ela não existir, use o Firefox Nightly, que tem a mesma opção.
5. **Configure.** Toque em ⋮ → Extensões → SetupSniper, digite o endereço do servidor e toque em **Salvar e testar**.

A partir daí, toda página de produto ou de busca que você abrir no Firefox do celular é enviada sozinha.

> **Testes.** Testado no Chromium (envio automático na página de produto e nada enviado no carrinho). O Firefox, no PC e no Android, segue o mesmo padrão de extensão (Manifest V3), mas **não foi testado** num aparelho de verdade.

## Sem extensão no celular

- **Favorito "Enviar para o SetupSniper"** (aba Lojas): funciona no Chrome do Android, com um toque por página.
- **App instalado + Compartilhar:** no app da loja, toque em **Compartilhar → SetupSniper** (veja `docs/app-celular.md`).
