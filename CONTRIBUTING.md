# Como contribuir

Obrigado por querer ajudar! Toda ajuda conta: corrigir uma loja que quebrou, adicionar uma loja nova, melhorar a documentação ou só relatar um problema.

## Relatar problemas

Abra uma [issue](https://github.com/phs-analytics/SetupSniper/issues/new/choose) usando um dos modelos:

- **Loja quebrada:** uma loja parou de trazer preços ou traz preços errados.
- **Bug:** algo não funciona como deveria.
- **Ideia:** uma sugestão de melhoria.

> **Nunca cole na issue** o seu `.env`, `data/settings.json`, o token do Telegram, senhas ou IPs. Para falhas de segurança, siga o [SECURITY.md](SECURITY.md).

## Preparar o ambiente

```bash
git clone https://github.com/phs-analytics/SetupSniper.git
cd SetupSniper
npm run demo       # interface com dados simulados, sem acessar as lojas
npm test           # testes
npm run check      # sintaxe + garante que nenhum dado pessoal/segredo foi versionado
```

Não há dependências: só o Node.js 18.18 ou mais novo.

## Regras do projeto

- **Sem dependências.** O projeto precisa rodar no Termux de um celular antigo. Não adicione bibliotecas: nem navegadores automatizados para ler lojas.
- **Dados do usuário ficam fora do git.** Qualquer arquivo novo com dados pessoais vai para o `.gitignore` e para a lista em `scripts/check.js`.
- **Seja gentil com as lojas.** Nada de intervalos agressivos nem de contornar bloqueios de forma abusiva. Respeite os termos de uso de cada site.
- **Notas não são certificações.** Não use palavras como "certificado" ou "oficial" para as notas de confiança, e marque como estimativa todo valor que não vier de uma fonte verificável.
- **Interface em português do Brasil**, com textos curtos e diretos.
- **Teste o que mudar.** Ao mexer em um adaptador, inclua um trecho da página em `tests/extract.test.js`.

## Enviar um Pull Request

1. Faça um fork e crie um branch: `git checkout -b corrige-kabum`.
2. Faça as mudanças e rode `npm test` e `npm run check`.
3. Abra o PR preenchendo o modelo. Prints da interface ajudam muito.

Guias úteis: [como funciona](docs/como-funciona.md) · [adicionar uma loja](docs/adicionar-loja.md).
