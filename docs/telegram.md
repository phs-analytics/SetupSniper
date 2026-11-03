# Alertas no Telegram

## Conectar

1. No Telegram, abra o [@BotFather](https://t.me/BotFather), envie `/newbot`, escolha um nome e copie o **token**.
2. No SetupSniper, abra a aba **Alertas**, cole o token e clique em **Salvar**. Outra opção é colocar o token em `TELEGRAM_TOKEN=` no `.env`.
3. Abra o seu bot no Telegram e envie `/start`. O primeiro chat que fizer isso vira o dono, e só ele recebe alertas e usa os comandos.
4. Clique em **Enviar mensagem de teste**.

## Quando o bot avisa

- Quando um produto **fixado** atinge a **meta de preço**.
- Quando cai pelo menos **X% abaixo da média de 30 dias**. O padrão é 10%, e o aviso só vale depois de existir histórico.

Os avisos só consideram lojas com score de confiabilidade acima do mínimo, que por padrão é 60. Preços **suspeitos** (muito abaixo da mediana) são ignorados, a menos que você ative essa opção. Cada produto gera **uma mensagem só**, com a melhor oferta e as outras abaixo da meta. A mesma oferta não é repetida por 24h, a não ser que caia mais 1%.

Cada produto fixado tem um sininho 🔔 para ligar ou desligar os alertas só dele.

## Comandos

| Comando | O que faz |
|---|---|
| `/fixados` | Lista os fixados com o melhor preço atual |
| `/fixar ryzen 5 7600 meta 1200` | Fixa um produto. A meta é opcional e também aceita `R$ 1200` ou `até 1200`. |
| `/desafixar 2` | Remove o fixado nº 2 da lista |
| `/buscar rtx 4060` | Busca rápida nas lojas |
| `/status` | Versão, tempo ligado e memória do servidor |
| `/atualizar` | Baixa a versão nova do GitHub e reinicia (precisa ter sido instalado com `git clone`) |

## Segurança

- O token fica em `data/settings.json` ou no `.env`, ambos fora do git.
- Se o token vazar, envie `/revoke` ao @BotFather, gere outro e cole no site.
- Para trocar o chat dono, clique em **Desconectar bot** na aba Alertas e conecte de novo.
