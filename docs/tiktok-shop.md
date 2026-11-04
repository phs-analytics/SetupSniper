# TikTok Shop Brasil: dá para ler ofertas de forma legítima?

Pesquisa feita em 03/11/2026 para decidir se o SetupSniper pode acompanhar ofertas da TikTok Shop Brasil.
É um estudo, não código. As regras valem para tudo o que está aqui: **sem login, sem burlar proteções**
(captcha, verificação anti-bot, assinaturas como X-Bogus/X-Gnarly/msToken, limite de requisições),
só páginas públicas abertas sem conta e respeitando os termos de uso.

> **Aviso sobre o método.** A rede deste ambiente bloqueia `tiktok.com`, `shop.tiktok.com`,
> `vm.tiktok.com` e `reclameaqui.com.br` (veja "Testes de rede" abaixo). Por isso nada aqui foi
> conferido abrindo as páginas: tudo vem de buscas na web, documentação oficial encontrada por busca
> e fontes de terceiros. Os pontos marcados **[não verificado]** precisam de um teste com a rede liberada.

---

## Resumo

- A TikTok Shop está no ar no Brasil desde **maio de 2025**. Eletrônicos estão entre as categorias
  principais e há campanhas grandes com cupons (11.11, Black Friday).
- Existe página web de **produto** (`shop.tiktok.com/view/product/<id>`), e parece que dá para abri-la
  sem login. Não achei uma página web pública de **busca** que funcione de forma estável e sem
  proteção. A busca da loja fica no app e em endpoints assinados (X-Bogus/msToken).
- Os **termos de uso do TikTok proíbem coleta automatizada** (scraping) sem autorização por escrito.
- As **APIs oficiais** (Partner Center / Open API, Affiliate API) exigem cadastro como empresa
  (certificado de empresa) ou como vendedor/criador. Não servem para uso pessoal anônimo.
- **Conclusão:** das três opções, só a **(c)** fica perto do aceitável, e mesmo ela tem um porém
  (os termos). As opções (a) e (b) **não são viáveis** dentro das regras. Detalhes na seção "Conclusão".

---

## 1. A TikTok Shop no Brasil (2025–2026)

- **Lançamento:** 08/05/2025. Dá para comprar direto dos vídeos, das lives e da aba Loja do app
  (Portal Tela; Mercado & Consumo, 08/05/2025).
- **Primeiro aniversário:** em maio de 2026 a plataforma completou 1 ano no Brasil e anunciou expansão
  (Money Times).
- **Quem pode vender:** só **pessoa jurídica com CNPJ**. CPF não é aceito. **MEI é aceito**, assim como
  EI, SLU, LTDA e S/A. Os documentos pedidos de costume são CNPJ ativo, documento do responsável,
  conta bancária no nome da empresa, endereço no Brasil para envio e devolução e uma conta TikTok ligada
  à loja. A inscrição estadual costuma ser exigida para quem vende produto físico. A comissão citada
  fica em torno de 6% por pedido **[não verificado na fonte oficial; o Seller Center é `seller-br.tiktok.com`]**
  (Tactus, Conta Ágil, UpSeller, Olhar Digital 02/01/2026).
- **Eletrônicos e hardware:** eletrônicos estavam entre as categorias do lançamento. O calendário de
  promoções do fim de ano traz um dia de "Tecnologia e Lar" (eletrônicos e celulares) e um dia de
  "Setup completo" (informática e eletrônicos) na Black Friday (Mercado & Consumo, 25/10/2026).
  Peças de PC (GPU, CPU etc.) aparecem mais em lojistas pequenos e importadores. Não encontrei
  KaBuM!, Pichau ou Terabyte como lojas oficiais **[não verificado]**.
- **Campanhas e cupons:** a TikTok Shop entrou no 11.11 de 2025 com descontos de até 30% (conforme o
  lojista) e cupons. A campanha de Black Friday fala em descontos de até 70% e R$ 100 milhões em cupons
  (Gazeta SP, Seu Dinheiro, Click Petróleo e Gás, Mercado & Consumo). Algumas fontes misturam as
  edições de 2025 e 2026. Os cupons costumam valer **só no app** e para a conta logada **[não verificado]**.

## 2. Existe página web pública de busca e de produto?

- **Página de produto: sim, existe.** O formato é
  `https://shop.tiktok.com/view/product/<ID_DO_PRODUTO>?region=BR&locale=pt-BR` (os parâmetros podem
  variar). Esse formato aparece em páginas de encurtadores de link para afiliados e em várias
  ferramentas de terceiros (flyn.to; anúncios de scrapers na Apify). Uma dessas ferramentas diz que o
  módulo de avaliações "funciona sem login", o que sugere que a página de produto abre sem conta.
  **[não verificado para a região BR]**: quase todas as ferramentas citam só a loja dos EUA.
- **Outros formatos citados:** `www.tiktok.com/shop/pdp/<slug>/<id>` e `www.tiktok.com/shop/s/<termo>`
  (busca/listagem). Uma ferramenta de terceiros diz que as páginas `www.tiktok.com/shop/s/...` são
  **protegidas**, e que a página de produto em `shop.tiktok.com/view/product/...` é a que costuma abrir.
- **Busca:** **não achei página de busca web pública e estável para o Brasil.** A busca da loja fica
  no app. Na web, a listagem carrega por JavaScript conforme a rolagem, chamando endpoints internos
  que exigem as assinaturas da seção 5. Textos de terceiros dizem que no PC dá para *ver* vitrines e
  produtos, mas não comprar nem usar cupons.

## 3. Como os links compartilhados se resolvem

- **Links de afiliado/criador:** segundo a central oficial para vendedores (Seller University, EUA),
  quem clica no link compartilhável de um criador é **redirecionado para a página de produto** da
  TikTok Shop. Se o link é do tipo "produto", a pessoa cai direto no produto. Se é de vitrine ou de
  campanha, aparece antes um cartão com os produtos.
- **Encurtadores:** os links curtos (`vm.tiktok.com/...`, `vt.tiktok.com/...` e encurtadores de
  terceiros) costumam responder com **redirecionamento HTTP 301/302** para a URL completa (vídeo ou
  `shop.tiktok.com/view/product/...`), mantendo os parâmetros de rastreio (flyn.to; racklify).
  **[não verificado: não foi possível seguir um link real daqui]**
- **No celular ou no PC:** segundo terceiros, o mesmo link pode tentar abrir o app (deep link) no
  celular, abrir a página web no PC, ou abrir uma página que só manda baixar o app. Isso muda conforme
  a região e o tipo de conta (racklify). Para o bot do Telegram, o que importa é se o
  **destino final** do redirecionamento devolve HTML com os dados do produto para um visitante
  anônimo. **[não verificado]**
- **Links de vídeo** (`www.tiktok.com/@usuario/video/<id>`) levam ao vídeo, não ao produto. Pegar o
  produto ligado ao vídeo pediria os dados internos do vídeo (seção 4), sem garantia nenhuma.

## 4. Dados embutidos no HTML

- **TikTok (vídeos e perfis):** o estado da página já ficou em `<script id="SIGI_STATE">` e hoje fica em
  `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">` (JSON). Segundo guias de terceiros, o sistema
  anti-bot da ByteDance **tira esse conteúdo quando acha o acesso suspeito** e devolve um HTML
  "esqueleto", sem números (HasData, 2026; Omniscrape).
- **TikTok Shop (produto):** ferramentas de terceiros dizem tirar da página de produto o preço, o preço
  original, as unidades vendidas, a nota, o número de avaliações, as avaliações em destaque e os dados
  da loja. Elas leem o HTML, o JSON embutido e o JSON que a página carrega depois. Uma delas cita
  **JSON-LD** como uma das fontes. Nenhuma fonte confirma que a página aberta sem login traz um bloco
  JSON-LD `Product`/`Offer` completo. **[não verificado]** Ninguém citou `__NEXT_DATA__` para a TikTok
  Shop.
- **Na prática:** mesmo quando há JSON embutido, ele **pode sumir para acessos sem navegador** (IP de
  datacenter, fingerprint de TLS etc.). Várias dessas ferramentas recomendam **proxies residenciais**,
  o que já é uma forma de contornar a proteção e fica fora das nossas regras.

## 5. Proteções anti-bot conhecidas

Fontes de terceiros (projetos de engenharia reversa e artigos técnicos, não documentação oficial):

- **X-Bogus:** assinatura que vai como parâmetro na URL das chamadas internas. **X-Gnarly:** uma
  segunda assinatura, mais recente. **msToken:** token de sessão gerado por um SDK em JavaScript no
  navegador, com fingerprinting.
- Pedidos com X-Bogus certo mas **sem um msToken válido criado pelo navegador** recebem resposta vazia.
  O bloqueio aparece como **HTTP 403/429** ou como **HTTP 200 com corpo vazio** (pkg.go.dev
  go-tiktok; DeepWiki tiktok-signature).
- **Fingerprint de TLS e de navegador:** o firewall (WAF) identifica bibliotecas HTTP comuns
  (dev.to). Há **captcha deslizante** e verificação de navegador. IPs de datacenter são bloqueados
  na loja (anúncios na Apify).
- **Para o projeto:** os endpoints de busca e de listagem dependem dessas assinaturas. Gerar ou imitar
  as assinaturas, ou usar proxy residencial para escapar do bloqueio, **é burlar proteção** e está
  fora de questão.

## 6. Afiliados e APIs oficiais

- **Programa de afiliados no Brasil:** é para **criadores**: conta TikTok, 18 anos ou mais e um mínimo
  de seguidores. O número mais citado é **1.000**, mas há fontes com 2.000 ou 5.000. Também existe o
  "Linkshare", para ganhar comissão antes de chegar ao mínimo. A comissão é definida pelo lojista
  (de 5% a 30% conforme a categoria, segundo terceiros) e é obrigatório avisar que o conteúdo é
  publicidade (blogs brasileiros de 2026; nada da fonte oficial). **Exige login e conta de criador**,
  então não serve para o SetupSniper.
- **TikTok Shop Partner Center / Open API:** para se cadastrar como desenvolvedor de app (ISV), o guia
  oficial pede o **certificado da empresa** e os dados de registro, e a região do cadastro tem que bater
  com o certificado. Existe também o "seller developer", que só acessa os dados da própria loja (e
  portanto exige ser lojista com CNPJ). O acesso aos dados vem de **escopos que um lojista autoriza**
  no seu app. **Não existe API pública de catálogo ou de busca de preços de qualquer loja** para quem
  não está cadastrado (Partner Center, guia de onboarding; truto.one; Apideck).
- **Affiliate API (lançada em 2024):** cria campanhas, busca criadores e gera links de afiliado. Foi
  lançada como beta para parceiros de apps (TikTok for Developers, blog). É uma ferramenta para
  **vendedores e agências**, não para comparar preços.
- **Custo:** não achei taxa para usar a API. O "custo" é o cadastro de empresa e a análise de
  diligência (due diligence).
- **Uso pessoal:** os termos e os requisitos foram pensados para empresas e apps que atendem lojistas.
  Uma pessoa física sem CNPJ, usando para si, **não se encaixa** no cadastro. Mesmo com um MEI, seria
  preciso justificar um app ISV, e um "monitor de preços pessoal" provavelmente não passa na análise
  **[não verificado]**.

## 7. Reclame Aqui

- **Página:** `https://www.reclameaqui.com.br/empresa/tiktok-shop/`, com o slug **`tiktok-shop`**.
  A empresa é **verificada** e concorre ao Prêmio RA 2026 (plataformas de e-commerce). Existe também
  a página geral do TikTok (`/empresa/tiktok/`), que recebe reclamações sobre a loja. Cuidado: a
  página "Tik Shop" (`/empresa/tik-shop/`) é **outra empresa**, sem nota e "Não recomendada".
- **Números (fotos de momentos diferentes, coletadas por busca e não confirmadas na página ao vivo):**
  nota entre **7,4 e 7,7**, reputação **"Boa"**, índice de solução entre **76,7% e 80,9%** (Exame cita
  80,9% no 1º semestre de 2026), "voltaria a fazer negócio" em **69,5%** (Exame), respondidas por volta
  de **99,5%** e mais de **36 mil** reclamações. Não tem selo RA1000.
- **Principais queixas:** produto não entregue, atraso na entrega, reembolso, produto com defeito. No
  lado de criadores e afiliados: punições e restrições na conta que eles consideram injustas e falta de
  atendimento humano. Em junho de 2025 a página ainda não era verificada e tinha menos de 50% das
  reclamações respondidas (Olhar Digital, 27/06/2025). A situação melhorou bastante desde então.

## 8. Termos de uso sobre coleta automatizada

- Os Termos de Serviço do TikTok **proíbem extrair, raspar (scraping) ou exportar dados da plataforma
  por meios automatizados sem autorização por escrito** do TikTok. Também proíbem contornar medidas de
  segurança ou de acesso (resumo de cláusulas do ConductAtlas; WebScraping.AI). Não consegui abrir o
  texto oficial em pt-BR (`https://www.tiktok.com/legal/page/row/terms-of-service/pt-BR`) porque o
  domínio está bloqueado aqui. **[a redação exata não foi verificada]**
- Não achei o `robots.txt` do `shop.tiktok.com` nem do `www.tiktok.com` por causa do bloqueio de rede.
  **[não verificado]**
- **Para o projeto:** um "adaptador de busca" que roda sozinho de tempos em tempos é coleta
  automatizada e **contraria os termos**, mesmo em páginas públicas. Abrir uma página **porque o
  usuário mandou aquele link**, uma vez, de forma parecida com quem abre no navegador, é uma zona
  cinzenta. É bem menos agressivo, mas os termos não trazem uma exceção explícita para isso.

---

## Conclusão

| Opção | Viável? | Legítima (regras + termos)? | Veredito |
|---|---|---|---|
| (a) Adaptador de busca web pública | Não: não há busca web pública estável; a listagem usa endpoints assinados (X-Bogus/msToken) | Não: seria coleta automatizada recorrente, proibida pelos termos, e exigiria burlar a proteção | **Descartada** |
| (b) Só busca profunda com navegador (Playwright), sem burlar proteção | Pouco: o navegador automatizado esbarra em captcha, verificação de navegador e bloqueio de IP de datacenter; "não burlar" quer dizer desistir quando a proteção aparece, ou seja, quase sempre | Não: continua sendo coleta automatizada, proibida pelos termos | **Descartada** |
| (c) Só links encaminhados ao bot do Telegram e links fixados, lendo a página do produto | Talvez: depende de a página `shop.tiktok.com/view/product/<id>` devolver os dados a um visitante anônimo sem cair na verificação **[não verificado]** | Parcialmente: é acesso pontual a uma página pública pedido pelo usuário, sem login e sem contornar nada, mas os termos não trazem exceção explícita | **A única que pode ser considerada, com ressalvas** |

**Recomendação:** não colocar a TikTok Shop na busca automática do SetupSniper. Se o usuário quiser,
dá para testar a opção **(c)** de forma **conservadora**, depois de confirmar com a rede liberada que
a página de produto abre sem login:

1. Só é acionada quando o usuário manda o link (Telegram) ou o fixa. Nunca procura produtos sozinho.
2. Segue os redirecionamentos HTTP normais do link curto e faz **um único GET** na página final, com
   um User-Agent honesto que identifique o SetupSniper. Nada de proxy residencial, rotação de IP,
   imitação de fingerprint de TLS ou geração de X-Bogus/msToken.
3. Lê só o que estiver no HTML entregue: JSON-LD, metatags `og:`/`product:` ou o JSON embutido de
   reidratação, se existir. **Se a página vier vazia, com captcha, 403/429 ou como "esqueleto", desiste
   e mostra "não foi possível ler; abra no app"**, sem tentar de novo de forma agressiva.
4. Para links fixados, atualiza com pouca frequência (por exemplo, no máximo algumas vezes por dia),
   respeitando um eventual `robots.txt`.
5. Mostra o preço como "**sem cupom/preço do app pode ser menor**", porque os cupons da TikTok Shop
   costumam valer só no app para a conta logada.

Se o teste mostrar que nem a página de produto abre sem a verificação anti-bot, a resposta é
**nenhuma das opções**: a TikTok Shop fica fora do SetupSniper e, no máximo, entra como "loja
manual" (o usuário cola o preço que viu no app).

---

## Indicadores iniciais para `data/stores.json` (ESTIMATIVA)

Valores **aproximados**, juntados de fotos de momentos diferentes da página do Reclame Aqui
encontradas por busca (de jul. a out. de 2026) e da Exame. **Não foram conferidos na página ao vivo.**
Use `"fonte": "estimativa inicial"` e confira em `https://www.reclameaqui.com.br/empresa/tiktok-shop/`.
Sugestão de entrada (desligada por padrão):

```json
{
  "id": "tiktokshop",
  "enabled": false,
  "name": "TikTok Shop",
  "color": "#fe2c55",
  "reclameAquiSlug": "tiktok-shop",
  "reclameAqui": {
    "nota": 7.5,
    "solucao": 78,
    "voltaria": 69,
    "respondidas": 99,
    "ra1000": false
  },
  "rating": null,
  "vendas": null,
  "reviewsPositivas": null,
  "atualizadoEm": "2026-11-03",
  "fonte": "estimativa inicial (Reclame Aqui via busca, nota 7,4–7,7; solução 76,7–80,9%; voltaria 69,5% segundo a Exame)"
}
```

- `rating`, `vendas` e `reviewsPositivas` ficam `null`: na TikTok Shop a nota e as vendas são **por
  produto e por lojista** (a plataforma é um marketplace), e não há número público e confiável da
  plataforma inteira.
- Lembrete: o vendedor de cada oferta é um lojista terceiro. A reputação da TikTok Shop no Reclame
  Aqui não diz nada sobre o lojista. Se a opção (c) for adiante, mostre o nome da loja vendedora e, se
  existirem, a nota e o número de vendas dela que aparecem na página.

---

## O que não foi possível verificar

- **Testes de rede (03/11/2026):** `WebFetch` e `curl` para `shop.tiktok.com/br`,
  `www.tiktok.com/robots.txt`, `shop.tiktok.com/robots.txt`, `vm.tiktok.com/...`,
  `www.tiktok.com/legal/...` e `www.reclameaqui.com.br/empresa/tiktok-shop/` falharam: "ENOTFOUND" no
  WebFetch e "CONNECT tunnel failed, response 403" do proxy no curl. Os domínios estão fora da lista
  liberada desta sessão.
- Se `shop.tiktok.com/view/product/<id>?region=BR` abre **sem login e sem verificação** para um GET
  simples, e quais dados vêm no HTML (JSON-LD, `og:`, JSON de reidratação).
- O destino real dos links curtos (`vm.tiktok.com`, `vt.tiktok.com`) e dos links de afiliado no Brasil.
- O texto exato, em pt-BR, da cláusula de scraping dos Termos de Serviço e o `robots.txt` dos domínios.
- Os números atuais do Reclame Aqui (nota, solução, voltaria, respondidas).
- Se existe uma página web de busca da TikTok Shop Brasil e se ela está protegida.
- Se o Partner Center do Brasil aceita MEI no cadastro de ISV e se um uso pessoal seria aprovado.

## Próximos passos

1. **Liberar a rede** para `shop.tiktok.com`, `www.tiktok.com`, `vm.tiktok.com`, `vt.tiktok.com` e
   `www.reclameaqui.com.br`, ou testar numa máquina comum.
2. Ler `https://www.tiktok.com/robots.txt`, `https://shop.tiktok.com/robots.txt` e os Termos em pt-BR.
   Anotar a cláusula exata aqui.
3. Pegar 2 ou 3 links reais de produto de eletrônicos compartilhados do app. Rodar `curl -sIL` para
   ver a cadeia de redirecionamentos e um `curl -s` simples na URL final (User-Agent honesto, sem
   cookies). Procurar `application/ld+json`, `og:price`, `__UNIVERSAL_DATA_FOR_REHYDRATION__`. Anotar
   se veio captcha, 403 ou HTML vazio.
4. Se os dados vierem limpos, decidir com o usuário se a opção (c) vale a ressalva dos termos. Se não
   vierem, registrar "TikTok Shop: não suportada" na FAQ.
5. Conferir a página do Reclame Aqui e atualizar a entrada do `stores.json`.

---

## Fontes

Todas acessadas em 03/11/2026 (por busca na web; os domínios do TikTok e do Reclame Aqui não abriram
diretamente desta sessão).

**Lançamento, requisitos e campanhas**
- https://www.portaltela.com/noticias/economia/2025/05/08/tiktok-shop-e-lancado-no-brasil-e-promete-revolucionar-o-comercio-eletronico-nacional/
- https://mercadoeconsumo.com.br/08/05/2025/noticias-varejo/tiktok-shop-estreia-no-brasil-confira-as-solucoes-que-a-plataforma-oferece/amp/
- https://www.moneytimes.com.br/tiktok-shop-completa-1-ano-no-brasil-e-prepara-expansao/
- https://tactus.com.br/tiktok-shop-precisa-de-cnpj/
- https://www.contaagil.com/contabilidade-digital/como-vender-no-tiktok-shop-guia-completo-para-comecar/
- https://upseller.com/pt/blog-article-208
- https://olhardigital.com.br/2026/01/02/dicas-e-tutoriais/como-vender-no-tiktok-shop-abra-sua-loja-na-rede-social-em-5-passos/
- https://mercadoeconsumo.com.br/25/10/2026/ecommerce/tiktok-shop-lanca-calendario-de-promocoes-para-impulsionar-vendas-ate-dezembro/
- https://www.gazetasp.com.br/economia/mercado-livre-shopee-travam-guerra-milhoes-estreia-tiktok-shop/
- https://www.seudinheiro.com/2025/empresas/shopee-mercado-livre-e-tiktok-shop-transformam-o-11-11-em-previa-da-black-friday-isbl/
- https://clickpetroleoegas.com.br/11-11-vira-nova-black-friday-no-brasil-tiktok-shopee-aliexpress-e-mercado-livre-disputam-consumidores-com-cupons-e-lives-btl96/
- https://olhardigital.com.br/2025/12/22/internet-e-redes-sociais/cartoes-presente-reforcam-ambicao-do-tiktok-shop-no-varejo-online/

**Páginas web, links e dados embutidos**
- https://seller-us.tiktok.com/university/essay?knowledge_id=4308436637255466&lang=en (links compartilháveis de afiliado)
- https://racklify.com/encyclopedia/what-is-a-tiktok-shop-product-link/
- https://www.flyn.to/tiktok-shop-link-shortener
- https://hasdata.com/blog/tiktok-scraping-python
- https://www.omniscrape.io/guides/tiktok-scraper
- https://apify.com/herus13/tiktok-shop-scraper (cita `www.tiktok.com/shop/s/...` protegida e `shop.tiktok.com/view/product/...`)
- https://apify.com/piotrv1001/tiktok-shop-product-scraper
- https://apify.com/bonpleincapital/tiktok-shop-playwright-scraper
- https://apify.com/reviewly/tiktiok-shop-product-reviews
- https://www.practicalecommerce.com/tiktok-replaces-storefront-with-shop

**Proteções anti-bot**
- https://pkg.go.dev/github.com/go-tiktok/tiktok
- https://deepwiki.com/carcabot/tiktok-signature/3.1-signature-generation-process
- https://github.com/DormancyWang/X-Bogus
- https://dev.to/mrzaizai2k/breaking-down-api-defenses-ua-cookies-signatures-browser-5f58

**Afiliados e APIs oficiais**
- https://partner.tiktokshop.com/docv2/page/developer-onboarding
- https://developers.tiktok.com/blog/2024-tiktok-shop-affiliate-apis-launch-developer-opportunity
- https://truto.one/integrations/detail/tiktokshoppartner/
- https://developers.apideck.com/apis/ecommerce/tiktok/configuration
- https://business-api.tiktok.com/portal/docs/register-as-a-developer/v1.3
- https://viniensina.com.br/tiktok-shop-afiliado/
- https://ghostshorts.com/pt-br/blog/tiktok-shop-brasil-guia-completo-para-criadores-2026

**Reclame Aqui**
- https://www.reclameaqui.com.br/empresa/tiktok-shop/
- https://www.reclameaqui.com.br/empresa/tiktok-shop/lista-reclamacoes/
- https://www.reclameaqui.com.br/empresa/tiktok-shop/sobre/
- https://www.reclameaqui.com.br/empresa/tik-shop/lista-reclamacoes/ (outra empresa, não confundir)
- https://exame.com/tecnologia/examelab/tiktok-shop-como-comprar-em-live-sem-cair-em-golpe-veja-dicas/
- https://olhardigital.com.br/2025/06/27/internet-e-redes-sociais/tiktok-shop-e-realmente-confiavel-saiba-tudo-sobre-o-e-commerce-da-rede-social/

**Termos de uso**
- https://www.tiktok.com/legal/page/row/terms-of-service/pt-BR (texto oficial; não abriu desta sessão)
- https://conductatlas.com/platform/tiktok/tiktok-terms-of-service/prohibition-on-scraping-and-data-extraction/
- https://conductatlas.com/platform/tiktok/tiktok-terms-of-service/provision/CA-P-018595/prohibition-on-automated-scraping-of-platform-data/
- https://webscraping.ai/faq/tiktok-scraping/what-measures-does-tiktok-have-in-place-to-prevent-scraping
