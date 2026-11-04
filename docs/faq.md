# Perguntas frequentes

**Uma loja aparece como "bloqueado". É bug?**
Normalmente não. A loja barrou o acesso automático (anti-bot). As outras lojas continuam funcionando, e o servidor tenta de novo na próxima verificação. Shopee e AliExpress bloqueiam com mais frequência. Nesses casos, use a extensão ou o favorito "Enviar para o SetupSniper" ([fontes-oficiais.md](fontes-oficiais.md)).

**Uma loja aparece como "Nenhum resultado compatível".**
A loja respondeu, mas nenhum produto bateu com todos os termos da busca. Tente termos mais simples, como marca e modelo.

**O preço está diferente do site da loja.**
O SetupSniper mostra o menor preço da página, que costuma ser o preço à vista/PIX. Cupons, frete e preços para assinantes não entram. Confira sempre na loja antes de comprar.

**Por que alguns preços aparecem como "suspeito"?**
Ficaram muito abaixo da mediana das outras lojas, o que pode indicar golpe, produto usado ou outro produto. Eles ficam escondidos por padrão e não geram alerta.

**Os números de confiabilidade são oficiais?**
Não. A nota é calculada pelo SetupSniper e não é uma certificação. Os indicadores são estimativas iniciais em `data/stores.json`. Ao divulgar o projeto, deixe claro que preços e notas mostrados são ilustrativos. Ajuste conforme o Reclame Aqui e a sua experiência. Em marketplaces (Mercado Livre, Shopee, Magalu, AliExpress), o score vale para a plataforma, não para o vendedor.

**Posso deixar o site aberto na internet?**
Não é recomendado. Use o Tailscale. Se precisar mesmo, defina `SENHA` e use HTTPS (por exemplo, o Cloudflare Tunnel).

**Meus dados vão para algum lugar?**
Não. Tudo fica em `data/` e `.env` na sua máquina. O servidor só acessa as lojas, o Reclame Aqui e, se você configurar, a API do Telegram.

**Posso usar comercialmente ou revender?**
O código é MIT. Respeite os termos de uso de cada loja: o projeto foi pensado para uso pessoal e com intervalos conservadores entre as consultas.
