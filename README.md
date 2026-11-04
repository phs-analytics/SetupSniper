<div align="center">

# 🎯 SetupSniper

**Caçador de preços de hardware.** Busca em várias lojas brasileiras ao mesmo tempo, mostra um **score de confiabilidade** de cada loja e avisa no **Telegram** quando o preço cai.

Roda no seu PC ou num **celular Android antigo** usado como servidor pessoal, que também pode virar a sua **nuvem de arquivos**.

[![CI](https://github.com/phs-analytics/SetupSniper/actions/workflows/ci.yml/badge.svg)](https://github.com/phs-analytics/SetupSniper/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-%E2%89%A518.18-339933)
![Dependências](https://img.shields.io/badge/depend%C3%AAncias-0-brightgreen)
![Licença](https://img.shields.io/badge/licen%C3%A7a-MIT-blue)

[Começar](#-começar-em-2-minutos) · [Celular como servidor](docs/celular-servidor.md) · [Telegram](docs/telegram.md) · [Nuvem](docs/nuvem.md) · [FAQ](docs/faq.md)

</div>

![Busca](docs/busca.png)

## ✨ O que ele faz

| | |
|---|---|
| 🔎 **Busca livre** | Digite qualquer produto e os resultados de cada loja aparecem conforme ela responde. O scroll infinito traz mais páginas de cada loja, com as ofertas mais baratas dos vendedores mais confiáveis primeiro. |
| ⚖️ **Comparativo** | O mesmo produto em todas as lojas e em **cada vendedor** dos marketplaces, lado a lado, do mais barato e confiável para o menos. |
| 🛒 **8 lojas** | KaBuM!, Pichau, Terabyte, Amazon, Mercado Livre, Magalu, Shopee e AliExpress. A **busca profunda** lê mais páginas de cada loja e, no PC, pode usar um navegador headless. O conjunto de lojas é configurável. |
| 🛡️ **Nota de confiança** | De 0 a 100 por oferta: junta a nota da loja (Reclame Aqui, avaliação, vendas, reviews), os **sinais de risco do vendedor** e os da própria oferta, com motivos e nível de confiança. É uma estimativa do projeto, não uma certificação. |
| 🧹 **Filtro de lixo** | Descarta acessórios e marca como **suspeito** o preço bom demais para ser verdade. |
| 💳 **Total Pix e Total Crédito** | Cada oferta mostra os dois totais finais, com cupom, frete e, nos importados de Amazon, AliExpress e Shopee, imposto de importação e ICMS da sua UF. |
| 📣 **Canais de promoção** | Lê os canais públicos de promoções e cupons do Telegram (26 sugeridos), mostra tudo num feed com scroll infinito e avisa quando um post bate com um produto fixado. |
| 🎟️ **Cupons** | Encaminhe ao bot um post de promoção: ele resolve o link, lê o preço na loja, salva o cupom e calcula os totais. |
| 📌 **Fixar produtos** | Fixe uma oferta com **meta de preço**. O servidor confere de tempos em tempos e guarda o histórico. |
| 🔔 **Alertas no Telegram** | Avisa quando o preço atinge a meta ou cai abaixo da média. Também dá para fixar produtos pelo próprio bot. |
| ↗️ **Link direto** | O botão "Ver na loja" leva direto à página do produto. |
| 📱 **Servidor no celular** | Scripts para Termux: liga sozinho, reinicia se cair, tem um vigia que religa tudo a cada 15 min e atualiza pelo Telegram. |
| ☁️ **Nuvem de arquivos** | Opcional: seus arquivos no celular servidor, acessíveis pelo navegador ou por WebDAV. |
| 🔒 **Privado** | Nenhum dado sai da sua máquina. Zero dependências e zero contas. |

![Fixados](docs/fixados.png)

## 🚀 Começar em 2 minutos

Precisa do **Node.js 18.18+**. Não tem `npm install`.

```bash
git clone https://github.com/phs-analytics/SetupSniper.git
cd SetupSniper
cp .env.example .env        # defina uma SENHA
npm start                   # abra http://localhost:3000
```

Quer só conhecer a interface? Rode `npm run demo` (preços simulados).

## 📚 Guias

| Guia | Para quê |
|---|---|
| [Instalação no computador](docs/instalacao.md) | Windows, macOS, Linux e Docker |
| [Celular como servidor](docs/celular-servidor.md) | Android antigo + Termux + Tailscale, rodando 24h |
| [Alertas no Telegram](docs/telegram.md) | Criar o bot, regras de alerta e comandos |
| [Nuvem de arquivos](docs/nuvem.md) | Seus arquivos no servidor, pelo navegador ou WebDAV |
| [Lojas bloqueadas e APIs oficiais](docs/fontes-oficiais.md) | Diagnóstico e como ligar as APIs do Mercado Livre, da Shopee e do AliExpress |
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

- **Os preços são lidos de páginas públicas.** Se uma loja mudar o layout ou bloquear o acesso, só aquela loja é afetada.
- **As notas de confiança são estimativas do SetupSniper, não certificações nem dados oficiais.** Os indicadores em `data/stores.json` são valores iniciais aproximados: ajuste conforme a sua pesquisa. A interface marca como "estimativa" toda nota que não veio do Reclame Aqui ao vivo.
- **Uso pessoal.** O SetupSniper foi feito para uso pessoal e não comercial. Respeite os termos de uso de cada loja, mantenha intervalos conservadores entre as consultas e use a busca profunda com navegador só quando precisar.
- **Nomes e marcas** das lojas pertencem aos seus donos e aparecem só para identificar a origem de cada oferta, sem logotipos.
- **Sinais de risco não são acusação.** "Alto risco" quer dizer que os dados públicos lidos pedem cautela, não que o vendedor cometeu fraude.
- **Cupons divulgados não são verificados.** Eles aparecem como "divulgado por X em data, não verificado" até você marcar "Funcionou". O SetupSniper nunca testa, gera ou aplica cupons na loja.
- **Projeto pessoal, sem vínculo com as lojas citadas.** Confira sempre preço, vendedor e frete na loja antes de comprar.

## 📄 Licença

[MIT](LICENSE)
