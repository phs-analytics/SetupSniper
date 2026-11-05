<div align="center">

# 🎯 SetupSniper

**Caçador de preços de hardware.** Busca em várias lojas brasileiras ao mesmo tempo, mostra um **score de confiabilidade** de cada loja e avisa no **Telegram** quando o preço cai.

Roda num **servidor próprio**, do jeito que você preferir: o seu PC, um mini PC ou Raspberry Pi, um NAS com Docker, uma VPS ou até um celular Android antigo. Seus dados ficam só nele.

[![CI](https://github.com/phs-analytics/SetupSniper/actions/workflows/ci.yml/badge.svg)](https://github.com/phs-analytics/SetupSniper/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-%E2%89%A518.18-339933)
![Dependências](https://img.shields.io/badge/depend%C3%AAncias-0-brightgreen)
![Licença](https://img.shields.io/badge/licen%C3%A7a-MIT-blue)

[Começar](#-começar-em-2-minutos) · [Servidor próprio](docs/servidor-proprio.md) · [Credenciais](docs/credenciais.md) · [Telegram](docs/telegram.md) · [Nuvem](docs/nuvem.md) · [FAQ](docs/faq.md)

</div>

![Busca](docs/busca.png)

## ✨ O que ele faz

| | |
|---|---|
| 🔎 **Busca livre** | Digite qualquer produto e os resultados de cada loja aparecem conforme ela responde. O scroll infinito traz mais páginas de cada loja, com as ofertas mais baratas dos vendedores mais confiáveis primeiro. |
| ⇪ **Extensão do navegador** | Loja bloqueou o servidor? Com a extensão (PC e Firefox do Android), toda página de produto ou busca que você abre manda os preços sozinha para o comparativo e os Fixados. No celular sem extensão, use o **Compartilhar → SetupSniper** do app instalado. No ícone, ela mostra quantos cupons ativos a loja aberta tem e, na página do produto, o menor preço dos últimos 90 dias. Ela nunca preenche cupom nem clica em nada. |
| 📱 **App no celular** | Instale o site como app (PWA): ícone na tela inicial, tela cheia e **Compartilhar → SetupSniper** direto do app da loja. |
| ⚖️ **Comparativo** | O mesmo produto em todas as lojas e em **cada vendedor** dos marketplaces, lado a lado, do mais barato e confiável para o menos. |
| 🛒 **8 lojas** | KaBuM!, Pichau, Terabyte, Amazon, Mercado Livre, Magalu, Shopee e AliExpress. A **busca profunda** lê mais páginas de cada loja. O conjunto de lojas é configurável. |
| 🛡️ **Nota de confiança** | De 0 a 100 por oferta: junta a nota da loja (Reclame Aqui, avaliação, vendas, reviews), os **sinais de risco do vendedor** e os da própria oferta, com motivos e nível de confiança. É uma estimativa do projeto, não uma certificação. |
| 🧹 **Filtro de lixo** | Descarta acessórios e marca como **suspeito** o preço bom demais para ser verdade. |
| 💳 **Total Pix e Total Crédito** | Cada oferta mostra os dois totais finais, com cupom, frete e, nos importados de Amazon, AliExpress e Shopee, imposto de importação e ICMS da sua UF. |
| 🛒 **Ofertas de tecnologia** | Uma lista só com ofertas de tecnologia vindas dos canais e grupos do Telegram e das páginas que você abre, separada em **produtos com preço baixo**, **cupons de desconto** e **ofertas de desconto**, com o preço final estimado com cupom e o histórico de cada produto. |
| 📣 **Canais e grupos do Telegram** | Lê os canais públicos de promoções e cupons (26 sugeridos) e os grupos onde o bot está. Cada post vira uma oferta na aba Ofertas, com o nome e o preço do produto, e o bot avisa quando um post bate com um produto fixado. |
| 🎟️ **Cupons** | Encaminhe ao bot um post de promoção: ele resolve o link, lê o preço na loja, salva o cupom e calcula os totais. |
| 📌 **Fixar produtos** | Fixe uma oferta com **meta de preço**. O servidor confere de tempos em tempos e guarda o histórico. |
| 🔔 **Alertas no Telegram** | Avisa quando o preço atinge a meta ou cai abaixo da média. Também dá para fixar produtos pelo próprio bot. |
| ↗️ **Link direto** | O botão "Ver na loja" leva direto à página do produto. |
| 🖥️ **Servidor próprio** | Roda em qualquer máquina com Node.js: PC, Linux ou Raspberry Pi (systemd), Docker, VPS ou celular Android (Termux, com scripts que religam sozinhos). Atualiza pelo Telegram. |
| ☁️ **Nuvem de arquivos** | Opcional: seus arquivos no seu servidor, acessíveis pelo navegador ou por WebDAV. |
| 🔒 **Privado** | Nenhum dado sai da sua máquina. Zero dependências e zero contas. |

![Fixados](docs/fixados.png)

## 🚀 Começar em 2 minutos

Precisa do **Node.js 18.18+**. Não tem `npm install`.

```bash
git clone https://github.com/phs-analytics/SetupSniper.git
cd SetupSniper
cp .env.example .env        # defina uma SENHA (veja docs/credenciais.md)
npm start                   # abra http://localhost:3000
```

Quer só conhecer a interface? Rode `npm run demo` (preços simulados).

## 📚 Guias

| Guia | Para quê |
|---|---|
| [Instalação no computador](docs/instalacao.md) | Windows, macOS, Linux e Docker |
| [Servidor próprio](docs/servidor-proprio.md) | Onde rodar 24 h: PC, Linux/Raspberry Pi, Docker, VPS ou celular Android, e acesso pelo Tailscale |
| [Credenciais](docs/credenciais.md) | Passo a passo para pôr senha, Telegram e as APIs oficiais no `.env` do seu servidor |
| [Alertas no Telegram](docs/telegram.md) | Criar o bot, regras de alerta e comandos |
| [Nuvem de arquivos](docs/nuvem.md) | Seus arquivos no servidor, pelo navegador ou WebDAV |
| [Extensão do navegador](docs/extensao.md) | Envio automático dos preços das páginas que você abre (PC e Android) |
| [App no celular](docs/app-celular.md) | Link ou app? Como instalar, HTTPS e Compartilhar |
| [Lojas bloqueadas e APIs oficiais](docs/fontes-oficiais.md) | Diagnóstico, fontes por loja e as APIs do Mercado Livre, Shopee, AliExpress, Awin, Lomadee e Amazon |
| [Como funciona](docs/como-funciona.md) | Leitura de preços, totais, cupons, score, API e o que ainda não foi conferido |
| [Cupons](docs/cupons.md) | De onde vêm os cupons de cada loja e como são tratados |
| [Impostos de importação](docs/impostos-importacao.md) | Regras de II e ICMS, com fontes e vigência |
| [Score por vendedor](docs/score-vendedor.md) | Modelo de sinais de risco, travas e fontes |
| [TikTok Shop](docs/tiktok-shop.md) | Por que a loja está desligada |
| [Adicionar uma loja](docs/adicionar-loja.md) | Passo a passo para contribuir com uma loja nova |
| [Perguntas frequentes](docs/faq.md) | Lojas bloqueadas, preços diferentes e segurança |

## 🔒 Privacidade e segurança

- **Seus dados ficam só com você.** Token do Telegram, senhas, fixados e histórico ficam em arquivos que **nunca vão para o git**. O `npm run check` e o CI conferem isso.
- **Proteja o acesso.** Defina `SENHA` e acesse de fora de casa só pelo [Tailscale](https://tailscale.com). Não abra portas no roteador.
- **Detalhes:** veja o [SECURITY.md](SECURITY.md).

## 🤝 Contribuindo

Lojas mudam de layout o tempo todo, então correções de adaptadores são muito bem-vindas! Veja o [CONTRIBUTING.md](CONTRIBUTING.md). Para rodar os testes: `npm test` e `npm run check`.

## ⚠️ Avisos

- **Os preços vêm das APIs oficiais e de páginas públicas.** Nas consultas diretas, o servidor se identifica como SetupSniper, e não como um navegador; ele não tenta burlar bloqueios. Se uma loja mudar o layout ou recusar o acesso, só aquela loja é afetada.
- **As notas de confiança são estimativas do SetupSniper, não certificações nem dados oficiais.** Os indicadores em `data/stores.json` são valores iniciais aproximados: ajuste conforme a sua pesquisa. A interface marca como "estimativa" toda nota que não veio do Reclame Aqui ao vivo.
- **Uso pessoal.** O SetupSniper foi feito para uso pessoal e não comercial. Respeite os termos de uso de cada loja, mantenha intervalos conservadores entre as consultas e use a busca profunda só quando precisar.
- **Nomes e marcas** das lojas pertencem aos seus donos e aparecem só para identificar a origem de cada oferta, sem logotipos.
- **Sinais de risco não são acusação.** "Alto risco" quer dizer que os dados públicos lidos pedem cautela, não que o vendedor cometeu fraude.
- **Links de afiliado:** o "Ver na loja" abre sempre a página limpa do produto, nunca um link de afiliado.
- **Grupos do Telegram:** o bot só lê grupos e canais que você aprovar e nunca guarda nome ou id de quem postou, só o nome do grupo (LGPD).
- **Cupons divulgados não são verificados.** Eles aparecem como "divulgado por X em data, não verificado" até você marcar "Funcionou". O SetupSniper nunca testa, gera ou aplica cupons na loja.
- **Projeto pessoal, sem vínculo com as lojas citadas.** Confira sempre preço, vendedor e frete na loja antes de comprar.

## 📄 Licença

[MIT](LICENSE)
