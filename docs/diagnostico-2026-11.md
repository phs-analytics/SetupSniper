# Diagnóstico das lojas · 04/11/2026

Relatório copiado da aba Lojas no celular (Android/Termux), SetupSniper 2.11.0 (f565e63), Node v24.22.2, android/arm64.
Navegador headless: não · plano B pelo navegador: ligado · APIs oficiais: ML não, Shopee não, AliExpress não.
Busca de teste: "ssd 1tb".

## Relatório bruto

```
✓ KaBuM!: 40 itens via api (1298 ms)
    - API pública: 40 itens
⛔ Pichau: HTTP 403 (bloqueio anti-bot) (226 ms)
    - página da loja: HTTP 403 (bloqueio anti-bot)
    - navegador: Playwright não instalado neste aparelho
⛔ Terabyte Shop: HTTP 403 (bloqueio anti-bot) (194 ms)
    - página da loja: HTTP 403 (bloqueio anti-bot)
    - navegador: Playwright não instalado neste aparelho
✓ Amazon.com.br: 47 itens via html (1305 ms)
    - página da loja: 47 itens, 1322 KB
✕ Mercado Livre: API: HTTP 403 (bloqueio anti-bot) (1102 ms)
    - API pública: HTTP 403 (bloqueio anti-bot)
    - página da loja: 0 itens, 41 KB
⛔ Magazine Luiza: HTTP 403 (bloqueio anti-bot) (619 ms)
    - página da loja: HTTP 403 (bloqueio anti-bot)
    - navegador: Playwright não instalado neste aparelho
✓ AliExpress: 7 itens via html (1928 ms)
    - página da loja: 7 itens, 742 KB
✕ Shopee: API: HTTP 403 (bloqueio anti-bot) (1555 ms)
    - API pública: HTTP 403 (bloqueio anti-bot)
    - página da loja: 0 itens, 152 KB
```

## Classificação (Etapa 0)

| Loja | Situação | Sinal no relatório | Ação na Etapa 1 |
| --- | --- | --- | --- |
| KaBuM! | Funciona | API pública, 40 itens | só validar e adicionar fixture nova; a fonte oficial (Awin) entra como reforço |
| Amazon.com.br | Funciona | HTML, 47 itens | só validar e adicionar fixture; sem PA-API, o caminho é a Creators API quando houver acesso |
| AliExpress | Funciona | HTML, 7 itens | validar e adicionar fixture; poucos itens, então avaliar a API de afiliados |
| Pichau | Bloqueado | HTTP 403 na página; Playwright ausente | fonte oficial não encontrada [não verificado]; sem oficial, navegador do usuário |
| Terabyte Shop | Bloqueado | HTTP 403 na página; Playwright ausente | Lomadee (aguarda cadastro); sem ela, navegador do usuário |
| Magazine Luiza | Bloqueado | HTTP 403 na página; Playwright ausente | programa Parceiro Magalu [não verificado]; sem ela, navegador do usuário |
| Mercado Livre | Bloqueado | HTTP 403 na API pública; página sem itens (41 KB) | ativar a API oficial com login OAuth (`ML_CLIENT_ID`, `ML_CLIENT_SECRET`) |
| Shopee | Bloqueado | HTTP 403 na API pública; página sem itens (152 KB) | ativar a API de afiliados (`SHOPEE_AFFILIATE_APP_ID`, `SHOPEE_AFFILIATE_SECRET`) |

## Observações

- Nenhuma loja caiu em "Rede" (DNS, timeout ou conexão recusada). Todas os erros são HTTP 403.
- As páginas da Mercado Livre e da Shopee voltaram com 0 itens, mas o tamanho da resposta (41 KB e 152 KB) sugere página de verificação, não de produto. Isso fica como [não verificado] até conferir o HTML.
- As APIs oficiais de ML, Shopee e AliExpress não estão configuradas neste aparelho. Parte do bloqueio pode ser resolvida só com as credenciais, sem código novo.
- Sem Playwright no celular, o plano B pelo navegador não roda aqui. O caminho disponível é a extensão ou o favorito "Enviar para o SetupSniper".
