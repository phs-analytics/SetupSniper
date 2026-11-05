# Extensão do navegador: preços enviados sozinhos, cupons e histórico da loja aberta (PC e celular)

A extensão envia ao seu servidor os preços das páginas que você abre, **sem você tocar em nada**. Sempre que você abrir a página de um produto ou de uma busca numa das 8 lojas, ela manda os preços para o **seu** servidor. Ela também mostra os **cupons ativos** e o **histórico de preço** da loja aberta (veja "Cupons e histórico da loja aberta").

O que acontece com cada página enviada:

- os preços entram no **comparativo** da busca, marcados "do seu navegador", por 24 h;
- se o produto estiver fixado com aquele link, os **Fixados** são atualizados na hora, com histórico e alertas;
- quando a loja recusa o servidor, o preço enviado pelo navegador continua valendo nos Fixados por até 12 h.

**O que ela não faz:**

- não abre páginas, não clica e não navega sozinha: só lê as páginas que você abriu;
- não envia carrinho, pagamento, login, conta, pedidos, endereço nem favoritos (esses endereços são ignorados);
- só fala com o endereço do servidor que você digitar, e a permissão para isso é pedida na hora.

O código está na pasta `extensao/` do projeto. São cinco arquivos curtos, sem bibliotecas (`loja.js` tem as regras puras, testadas em `tests/extensao-loja.test.js`).

## Cupons e histórico da loja aberta

Funciona como os avisos de cupom de outros comparadores, só que **informativo**: a extensão avisa e lista, e quem decide e digita o cupom é você.

- **Selo no ícone:** o número de cupons ativos para a loja da aba aberta, buscado no **seu** servidor. Conta só cupons com código, dentro da validade e que já começaram; promoção sem código aparece na lista, mas não conta. Sem cupom, o selo fica vazio; se o envio da página falhou e não há cupom, aparece `!`.
- **Janela da extensão** (clique no ícone): a lista dos cupons da loja, cada um com:
  - **origem:** `oficial` (enviado pela loja por uma rede de afiliados) ou `divulgado, não verificado` (lido de um canal ou cadastrado por você); quando você marcou ✅ no site, aparece "funcionou para você";
  - **validade:** "válido até 10/11", "começa em 20/11" ou "sem data de fim informada";
  - **regra:** por exemplo "10% até R$ 50, mínimo R$ 300";
  - botão **Copiar**, que copia o código para a área de transferência do seu aparelho. Depois, cole você mesmo no campo de cupom da loja.
- **Página de produto:** se o seu servidor já viu esse produto antes, a janela mostra "menor em 90 dias: R$ X" e, quando for o caso, o selo **provável preço inflado antes da promoção (estimativa)**. Esse selo é um critério próprio, calculado pelo histórico que o seu SetupSniper guardou (veja `docs/historico.md`); não é acusação contra a loja.

**O que ela nunca faz com cupons:**

- não preenche o campo de cupom, não clica em "Aplicar" e não clica em nada na loja;
- não testa códigos, não gera códigos e não aplica cupom sozinha;
- não escreve nem injeta nada na página da loja: tudo aparece só na janela da extensão.

**O que vai para o seu servidor nessa consulta** (`GET /api/extensao/loja`, com a senha do site, se houver):

- na página de um produto: o endereço da página **sem parâmetros** (sem códigos de rastreio), e, depois que o servidor leu a página, o título e o preço no Pix (em centavos) que ele mesmo devolveu;
- em qualquer outra página da loja, inclusive carrinho, pagamento e conta: **só o endereço da loja** (por exemplo `https://www.kabum.com.br/`), sem caminho, título nem preço;
- com **Enviar automaticamente** desligado, também vai só o endereço da loja: você vê os cupons, mas não o histórico.

A resposta traz só a loja, os cupons ativos e o histórico do produto; nenhum dado pessoal (CEP, perfil, token, chat id).

**Permissões:** nenhuma nova. A extensão continua usando só:

- `storage`: guardar o endereço do servidor, a senha e o último envio;
- `host_permissions` das 8 lojas: rodar o `content.js` nas páginas que você abre e ler o endereço da aba da loja na janela;
- `optional_host_permissions`: falar com o endereço do **seu** servidor, pedida no clique em **Salvar e testar**.

O selo por aba (`action.setBadgeText`), a lista de abas (`tabs.query`, que sem a permissão `tabs` só mostra o endereço das abas das 8 lojas) e o botão Copiar (área de transferência, no clique) não pedem permissão extra. [não verificado] o botão Copiar no Firefox para Android; se a cópia falhar, a janela pede para você selecionar e copiar o código.

## PC: Chrome, Edge, Brave ou Opera

1. Baixe o projeto (ou use a pasta que já está no seu PC).
2. Abra `chrome://extensions` (no Edge, `edge://extensions`) e ligue o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e escolha a pasta `extensao`.
4. Clique no ícone da extensão (peça de quebra-cabeça → SetupSniper):
   - em **Endereço do seu SetupSniper**, digite o endereço do seu servidor, por exemplo `http://100.101.102.103:3000`;
   - em **Senha do site**, digite a senha, se o site tiver uma;
   - clique em **Salvar e testar** e aceite a permissão.
5. Pronto. Navegue nas lojas normalmente. O número no ícone mostra quantos cupons ativos o seu SetupSniper conhece para a loja aberta; o resultado do último envio aparece na janela da extensão.

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

> **Testes.** Testado no Chromium (envio automático na página de produto e nada enviado no carrinho). O teste automático `tests/extensao-chromium.test.js` abre a extensão no Chromium com o Playwright, numa página de produto de fixture e com um servidor falso local, e confere o selo, a lista de cupons, o histórico, que o campo de cupom da página continua vazio e intocado e que o carrinho não é enviado. Sem o Playwright (`npm run navegador`), esse teste é pulado. O Firefox, no PC e no Android, segue o mesmo padrão de extensão (Manifest V3), mas **não foi testado** num aparelho de verdade [não verificado]. Também [não verificado]: a extensão contra lojas reais (os endereços de produto podem mudar) e a janela no Firefox para Android, que abre como uma aba (nesse caso a extensão usa a aba de loja aberta por último).

## Sem extensão no celular

- **App instalado + Compartilhar:** no app da loja, toque em **Compartilhar → SetupSniper** (veja `docs/app-celular.md`).
