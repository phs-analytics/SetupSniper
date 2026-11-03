# Changelog

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
