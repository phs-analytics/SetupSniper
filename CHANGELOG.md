# Changelog

## 2.12.0 — 2026-11-04

**Etapa 1 do plano 3.0: fontes oficiais no lugar das páginas bloqueadas**
Base: o diagnóstico real de 04/11/2026 (`docs/diagnostico-2026-11.md`). KaBuM!, Amazon e AliExpress funcionam. Pichau, Terabyte, Magalu, Mercado Livre e Shopee recusam o servidor com HTTP 403.
- **Lista de fontes por loja** (`sources` em `data/stores.json`): o servidor tenta da mais oficial para a menos oficial (API oficial → feed de afiliado → API pública → página → navegador) e o diagnóstico diz qual fonte respondeu.
- **Fontes novas** em `src/sources/`: Awin (feed e Offers API, para a KaBuM!), Lomadee (Terabyte) e Amazon Creators API (a PA-API foi desligada em 15/05/2026). Todas opcionais, com as credenciais do usuário no `.env`. Não verificadas ao vivo.
- **Limites de chamadas** por fonte em `data/source-limits.json`, com fonte e data, controlados por `src/rate-limit.js` (sem dependência).
- **Pausa após bloqueio:** quando a página de uma loja recusa o servidor, ela fica 6 h sem ser tentada de novo (valor no JSON). As fontes oficiais continuam. O teste manual da aba Lojas ignora a pausa.
- **Modo degradado honesto:** loja bloqueada mostra o último preço visto pelo seu navegador com a idade ("visto por você há 3 h") e o botão para abrir na loja. Nos Fixados, esse preço aparece por até 7 dias, sem disparar alerta.
- **Links de afiliado:** o link rastreado das APIs fica guardado à parte. "Ver na loja" continua abrindo a página limpa; uma opção na aba Lojas (desligada por padrão) troca pelo link de afiliado, com aviso visível.
- **Diagnóstico** (aba Lojas, relatório e `/diagnostico`): mostra cada fonte oficial, se está configurada e quais variáveis faltam no `.env` (só os nomes).
- `.env.example`: `AWIN_TOKEN`, `AWIN_PUBLISHER_ID`, `LOMADEE_API_KEY`, `AMAZON_CREATORS_CLIENT_ID`, `AMAZON_CREATORS_CLIENT_SECRET`, `AMAZON_PARTNER_TAG`.

## 2.11.0 — 2026-11-04

**Mais automático, no PC e no celular**
- **Extensão do navegador** (`extensao/`, guia em `docs/extensao.md`): envia sozinha ao seu servidor os preços de toda página de produto ou de busca que você abre nas 8 lojas. Funciona no Chrome, Edge e Firefox, e no Firefox para Android. Nunca envia carrinho, pagamento, login nem conta, e não abre páginas sozinha. Testada no Chromium.
- **Preços do navegador na busca e nos Fixados:** o que a extensão ou o favorito enviam fica 24 h no servidor e entra no comparativo, marcado. Quando a loja recusa o servidor, o preço enviado continua valendo nos Fixados por até 12 h.
- **App no celular (PWA):** o site pode ser instalado (ícone, tela cheia) e aparece no **Compartilhar** do Android. O link da loja abre já calculado, com 📌 Fixar. Guia e comparação "link × app" em `docs/app-celular.md`.
- **Login do Mercado Livre sem colar nada** quando o SetupSniper é aberto em HTTPS (`tailscale serve` ou nuvem): o Mercado Livre devolve direto para o servidor.
- `npm run navegador` instala o navegador automático (Playwright) no PC, sem virar dependência do projeto.


## 2.10.0 — 2026-11-04

**Três saídas legítimas para as lojas que bloqueiam o servidor**
- **Favorito "Enviar para o SetupSniper"** (aba Lojas): na página da loja aberta no seu navegador, ele manda o HTML da tela para o seu servidor (`/api/capture`, `public/receber.html`). As ofertas são lidas, entram com nota e totais e atualizam o produto fixado com aquele link. Nenhum acesso automático à loja.
- **Login oficial na sua conta do Mercado Livre** (OAuth, só leitura), na aba Lojas: as consultas da API usam a sua conta. O token fica em `data/ml-auth.json`, fora do git, e é renovado sozinho quando o app permite.
- **Compartilhar o link pelo app da loja** para o bot: se a loja não deixar ler o preço na hora, o bot fixa mesmo assim, pelo nome do produto no link.


## 2.9.0 — 2026-11-04

**Comparativo entre lojas e vendedores**
- A busca abre no modo **Comparativo** (`src/compare.js`): o mesmo produto, escrito de jeitos diferentes em cada loja, vira um grupo, com uma linha por loja e por **vendedor de marketplace**, com o nome do vendedor, a nota, o preço e a diferença para o menor.
- **Fixados:** a oferta principal mostra o vendedor, e os marketplaces mostram "Outros N vendedores" (até 8), na ordem preço + confiança.

**APIs oficiais (opcionais, com as credenciais do usuário)**
- `src/official-apis.js`: Mercado Livre (busca + catálogo com **todos os vendedores** e a reputação de cada um), Shopee Affiliate e AliExpress Affiliate. São usadas antes de ler o site, então não caem no bloqueio anti-bot. Guia: `docs/fontes-oficiais.md`. Não verificadas ao vivo.

**Diagnóstico das lojas**
- Aba Lojas → **Testar as lojas agora** (ou `/diagnostico` no bot): mostra o resultado de cada tentativa por loja e gera um relatório sem dados pessoais para copiar.
- Erros de rede explicados ("endereço não encontrado (DNS)", "conexão cortada", "tempo esgotado") em vez de "fetch failed".
- Arquivos do site com `Cache-Control: no-cache`: depois de atualizar o servidor, o navegador já pega a versão nova.


## 2.8.0 — 2026-11-04

**Mais produtos por loja e scroll infinito**
- `/api/search?page=N`: cada loja tem várias páginas. A interface pede a próxima sozinha ao chegar perto do fim da lista, sem repetir ofertas.
- **Correção:** o filtro de acessórios descartava produtos que só *mencionavam* "cooler", "cabo", "gabinete" etc. no título (ex.: "Ryzen 5 7600 com Cooler Wraith"). Agora só sai o título que é de acessório.
- Sem nenhum título com todos os termos, aparecem os "Parecidos", marcados.

**Ordem: menor preço dos vendedores mais confiáveis primeiro**
- Nova ordem padrão "Melhor escolha" (`src/ranking.js`): preço ajustado à nota de confiança. Alto risco e suspeitos vão para depois; sem preço e indisponíveis, para o fim. Vale na busca, nos Fixados, no bot e nos alertas.

**"Bloqueado" e "Nenhum resultado"**
- Página de verificação (captcha) é reconhecida como **bloqueado**, não como "nenhum resultado". Nada é burlado.
- Quando a loja recusa e o Playwright está instalado, a página pública é aberta no navegador (`browserFallback`).
- Cada loja diz o motivo: "bloqueado", "nada parecido" ou "sem resultados".
- KaBuM!: catálogo público em JSON como 1ª tentativa (não verificado ao vivo).

**Canais de promoção do Telegram**
- 26 canais sugeridos em `data/telegram-channels.json`, ativados com um toque.
- Nova aba **📣 Promoções**: feed com scroll infinito, filtro por loja e produto e situação de cada canal.
- Leitura a cada 30 min (era 6 h), até 40 canais, um de cada vez. Grupos sem prévia pública são identificados.
- Aviso no Telegram quando uma promoção bate com um produto fixado dentro da meta ("divulgado, não verificado").

**Celular**
- Fixados sem cortes, nota de confiança sem sobrepor o preço, cabeçalho compacto e totais legíveis de 320 a 768 px.


## 2.7.0 — 2026-11-04

**TikTok Shop (Fase 5)**
- Pesquisa em `docs/tiktok-shop.md`. Não há busca web pública estável, os endpoints são assinados e os termos do TikTok proíbem coleta automatizada. As APIs oficiais exigem cadastro de empresa.
- A loja entra em `data/stores.json` com `"enabled": false` e indicadores estimados (Reclame Aqui via busca), sem adaptador. Nenhuma busca nem monitoramento é feito na TikTok Shop.
- Posts com link da TikTok Shop encaminhados ao bot são recusados com uma explicação.
- `src/reliability.js` aceita lojas sem avaliação ou sem vendas informadas (`null`).

## 2.6.0 — 2026-11-04

**Nota por vendedor com sinais de risco (Fase 4)**
- `src/seller-score.js`: nota final por oferta em três camadas (plataforma 25%, vendedor 55% e oferta 20%), com travas, classe "Alto risco" (< 40), nível de confiança e motivos em português. Usa média bayesiana, limite de Wilson, rajadas de avaliações e textos repetidos (Jaccard de trigramas).
- `data/seller-score.json`: pesos, travas e limites configuráveis. O estudo está em `docs/score-vendedor.md`.
- O caso real do vendedor suspeito sai como **Alto risco** no AliExpress, na Shopee e no Mercado Livre, e um vendedor estabelecido sai bem avaliado (fixtures em `tests/fixtures/seller-*.json`).
- Cada oferta da busca, dos Fixados e do bot traz `trust` (nota, classe, motivos e confiança). O carimbo, a ordenação "Score" e "Custo × confiança", o score mínimo dos alertas e o bot usam essa nota.

## 2.5.0 — 2026-11-03

**Cupons (Fase 2)**
- Pesquisa de fontes de cupom por loja, com tabela de decisão: `docs/cupons.md`.
- `src/promo-parser.js`: lê posts de promoção. Testado com 24 posts de exemplo e o post real.
- `src/link-resolver.js`: resolve links encurtados de afiliado até a URL canônica, sem login.
- `src/discounts.js`: regras de cupom (percentual com teto, valor fixo com mínimo, frete, forma de pagamento, primeira compra, assinantes), inferência pelo preço anunciado, empilhamento configurável e oportunidade de carrinho.
- Bot do Telegram: posts encaminhados, botões "📌 Fixar", "✅ Funcionou" e "❌ Não funcionou", e o comando `/cupons`.
- Aba **🎟️ Cupons**: colar post, cupons salvos e cadastro manual.
- Leitura opt-in de canais públicos do Telegram (`t.me/s`), a cada 6 h.

**Total final (Fase 3)**
- `src/final-price.js`: Total Pix e Total Crédito com cupom, frete, imposto de importação e ICMS, além de parcelas e juros.
- `src/import-tax.js` e `data/taxes.json`: regras confirmadas e vigentes em 03/11/2026, para Amazon, AliExpress e Shopee: `docs/impostos-importacao.md`.
- `data/cep-uf.json`: UF pelo CEP, sem API externa. Cotação manual, com PTAX opcional.
- A ordenação, as metas e os alertas usam o total final (Pix por padrão).

## 2.4.0 — 2026-11-03

**Correção: lojas sem preço depois da primeira (Fase 1)**
- **Causa:** o extrator pegava o **menor** valor da página, muitas vezes uma parcela. Nos Fixados, esse valor caía fora da faixa de preço criada a partir da primeira loja e era descartado **sem nenhum estado**, e a loja ficava sem preço e sem mensagem.
- **Schema único de oferta** (`src/offer.js`): todos os adaptadores passam por `normalizeOffer()`, com Pix, cartão, parcelas, vendedor, frete e URL canônica.
- **Dinheiro em centavos** em todo o app. Os seus dados antigos (metas, faixas, histórico e alertas) são migrados sozinhos na primeira execução.
- **Preços classificados pelo nome do campo** (Pix, cartão, parcela, preço "de"), em vez de pegar o menor.
- **Estados explícitos por loja nos Fixados** (`src/monitor.js`): "Preço não encontrado nesta página", "Indisponível", "Fora da faixa", erro ou sem resultados.
- **Preço de referência** configurável: Pix (padrão) ou cartão.
- A interface mostra o Pix, o cartão e as parcelas de cada oferta.
- Relevância: "rtx 4060" agora encontra "RTX4060".
- Testes de regressão com páginas de exemplo das 8 lojas, do bug da parcela e da migração dos dados.

## 2.3.0 — 2026-11-03

**Escopo de lojas (Fase 0)**
- O SetupSniper passa a consultar só KaBuM!, Pichau, Terabyte, Amazon, Mercado Livre, Magalu, Shopee e AliExpress.
- O escopo vem de `"enabled"` em `data/stores.json` e pode ser sobrescrito por `"enabledStores"` em `data/settings.json`. A regra fica em `src/scope.js`.
- Buscapé e Zoom foram desativados por configuração; o código dos adaptadores continua no projeto.
- Novo `data/taxes.json`, com `importTaxStores` (Amazon, AliExpress e Shopee).
- `DATA_DIR` permite guardar os dados do usuário fora da pasta do projeto (usado nos testes).
- Teste de integração garante que o servidor só consulta as lojas do escopo, inclusive na busca profunda.

## 2.2.0 — 2026-11-03

- O carimbo da nota de confiança passa a dizer "confiável", "bom", "regular" ou "cautela", em vez de "certificado", para não sugerir certificação oficial. A classificação "Atenção" vira "Cautela".
- As notas estimadas aparecem como "(est.)", e a aba Lojas mostra um aviso de que as notas não são dados oficiais do Reclame Aqui nem das lojas.
- README, guias e CONTRIBUTING: avisos de uso pessoal e de respeito aos termos de uso das lojas.

## 2.1.1 — 2026-11-03

- `scripts/ligar.sh`: liga tudo com um comando e mostra o status (SetupSniper, nuvem, SSH, início automático e vigia).
- O boot agora usa o `ligar.sh` e grava `logs/boot.log`, para facilitar o diagnóstico.

## 2.1.0 — 2026-11-03

- **Vigia** (`scripts/vigia.sh`): a cada 15 min, pelo agendador do Android, religa o SetupSniper, a nuvem e o SSH se tiverem caído.
- Guia "Mantenha sempre ativo" em `docs/celular-servidor.md`, com ajustes por marca e o limite de processos do Android 12+.

## 2.0.0 — 2026-11-03

**Novidades**
- Busca livre em streaming: KaBuM!, Pichau, Terabyte, Amazon, Mercado Livre, Magalu, AliExpress e Shopee.
- Busca profunda: mais páginas, os comparadores Buscapé e Zoom e navegador headless opcional.
- Fixar produtos, com meta de preço, histórico e alertas por produto.
- Bot do Telegram: `/fixados`, `/fixar`, `/desafixar`, `/buscar`, `/status` e `/atualizar`.
- Botão "Ver na loja" com link direto para o produto.
- Nuvem de arquivos pessoal (`scripts/nuvem.sh`).
- Scripts para rodar 24h no Android (Termux), com reinício e boot automáticos.
- Visual novo, no estilo zine/colagem.
- Testes automáticos, `npm run check` e CI no GitHub.

**Correções**
- Preços como "R$ 1.234" (sem centavos) agora são lidos corretamente.
- Dados embutidos pequenos (poucos resultados) não são mais ignorados.

## 1.0.0

- Versão inicial: comparação de três produtos fixos e score de confiabilidade.
