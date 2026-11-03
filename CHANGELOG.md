# Changelog

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
