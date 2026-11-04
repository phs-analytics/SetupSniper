---
name: fontes-oficiais
description: Use para trocar adaptadores de loja bloqueados por APIs oficiais e feeds de afiliados no SetupSniper (Etapa 1). Não faz commit.
tools: Read, Edit, Write, Grep, Glob, Bash
model: inherit
---

Antes de tudo, leia CONTEXTO_CLAUDE.md e docs/plano-3.0.md (Etapa 1).
Arquivos que você pode editar: src/official-apis.js, src/stores.js, novos src/sources/*.js, src/rate-limit.js, data/stores.json, data/source-limits.json, .env.example (só as variáveis novas da Etapa 1), docs/fontes-oficiais.md, tests/ e tests/fixtures/.
Você só pode editar os arquivos listados para o seu papel no plano. Se precisar mexer em outro (principalmente server.js ou public/app.js), pare e peça ao orquestrador.
Nunca burle proteção de loja (regra 4): sem captcha, disfarce de navegador, proxy ou cookies de sessão.
Testes primeiro, com fixtures e sem rede. Dinheiro em centavos inteiros.
Regras que mudam (limites, categorias, pesos, prazos) ficam em JSON, com fonte e data.
Cupom nunca é testado, gerado nem aplicado sozinho.
Rode npm test e npm run check antes de devolver.
Não faça commit: devolva ao orquestrador o resumo, os testes novos e o diff.
O que não puder conferir ao vivo, marque como [não verificado].
