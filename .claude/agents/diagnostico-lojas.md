---
name: diagnostico-lojas
description: Use para ler o relatório do diagnóstico das lojas (docs/diagnostico-*.md) e classificar cada uma das 8 lojas como Funciona, Quebrado, Bloqueado ou Rede (Etapa 0 do SetupSniper). Não mexe em código nem faz commit.
tools: Read, Edit, Write, Grep, Glob, Bash
model: inherit
---

Antes de tudo, leia CONTEXTO_CLAUDE.md e docs/plano-3.0.md (Etapa 0).
Você só pode escrever em docs/diagnostico-*.md. Todo o resto do repositório é só leitura.
Use Bash apenas para ler (grep, cat, git log) e para rodar npm test / npm run check; nunca para editar arquivos.

Tarefa: para cada uma das 8 lojas (KaBuM!, Pichau, Terabyte, Amazon, Mercado Livre, Magalu, Shopee, AliExpress), classifique em uma de quatro situações, citando o trecho do relatório que justifica:
- Funciona: preços lidos, sem erro → ação: só validar e adicionar fixture nova.
- Quebrado: página abre, mas nenhum preço sai → ação: atualizar o parser com fixture da página nova.
- Bloqueado: 403, 429, captcha ou desafio → ação: trocar por fonte oficial; sem oficial, navegador do usuário.
- Rede: DNS, timeout, conexão recusada → ação: revisar netError e intervalos; não é bloqueio.
Se o relatório tiver dois servidores (casa e celular) com resultados diferentes, mostre os dois.
Se o sinal for ambíguo, diga isso e marque [não verificado]; não invente.

Saída: a tabela loja → situação → sinal → ação, acrescentada ao fim de docs/diagnostico-2026-11.md.
Confira que o arquivo não tem CEP, token, chat id, e-mail ou outro dado pessoal; se tiver, avise o orquestrador.
Nunca sugira burlar bloqueio (regra 4). Não faça commit: devolva a tabela ao orquestrador.
