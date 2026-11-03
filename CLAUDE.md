# Instruções para o Claude

## Verificação legal antes de publicar (obrigatória)

Antes de publicar qualquer coisa deste projeto, verifique se ela infringe alguma lei brasileira, consultando o acervo [ctresb/leis](https://github.com/ctresb/leis), que tem a legislação em Markdown com o texto compilado.

### Quando verificar

- **Antes de publicar:** antes de tornar público um repositório, de lançar uma versão nova (tag ou release) ou de qualquer postagem sobre o projeto (LinkedIn, vídeo, artigo, site).
- **Quando uma mudança tocar em temas sensíveis**, mesmo sem publicação imediata:
  - dados pessoais, de saúde ou financeiros;
  - coleta de dados de sites de terceiros (scraping, APIs);
  - nomes, marcas ou cores de empresas;
  - conteúdo de terceiros (imagens, textos, músicas, fontes, bases de dados);
  - avaliação, nota ou comparação de empresas;
  - recomendações de investimento ou de saúde.

Se encontrar **risco alto**, não publique: avise o usuário e proponha a correção primeiro.

### Como acessar o acervo

O repositório tem cerca de 7 GB, então **não clone inteiro**. Baixe só as leis necessárias, com clone parcial (leva cerca de 10 s):

```bash
rm -rf /tmp/leis && \
git clone -q --depth 1 --filter=blob:none --no-checkout https://github.com/ctresb/leis /tmp/leis && \
git -C /tmp/leis sparse-checkout set --no-cone \
  /federal/leis-ordinarias/2018/lei-13709-2018-08-14.md && \
git -C /tmp/leis checkout -q
```

Na linha do `sparse-checkout`, adicione os arquivos do mapa abaixo. Use sempre `git -C /tmp/leis` e encadeie os comandos com `&&`: se o clone falhar (por exemplo, por falta de disco), nenhum comando de Git pode rodar na pasta do projeto.

Para ler um artigo específico (exemplo: arts. 4 e 11 da LGPD):

```bash
python3 - lei.md 4 11 <<'EOF'
import sys, re
txt = open(sys.argv[1], encoding='utf-8').read()
for a in sys.argv[2:]:
    m = re.search(r'\*\*Art\. ' + re.escape(a) + r'(º|°|\.|-)?\*?\*?[ .]', txt)
    nxt = m and re.search(r'\n\*\*Art\. \d', txt[m.end():])
    print(txt[m.start(): m.end() + (nxt.start() if nxt else 3000)] if m else f'Art. {a} não encontrado', '\n')
EOF
```

Para achar uma norma que não está no mapa, use `git ls-tree -r --name-only HEAD | grep <número>` dentro de `/tmp/leis`.

### Mapa por tema

| Tema | Norma | Arquivo |
|---|---|---|
| Dados pessoais e dados sensíveis (saúde) | LGPD — Lei 13.709/2018 | `federal/leis-ordinarias/2018/lei-13709-2018-08-14.md` |
| Regulamentos da LGPD | Resoluções da ANPD | `reguladores/mj/resolucoes/<ano>/resolucao-cd-anpd-*` |
| Internet: serviços online, registros, privacidade | Marco Civil — Lei 12.965/2014 | `federal/leis-ordinarias/2014/lei-12965-2014-04-23.md` |
| Direitos autorais: textos, imagens, música, bases de dados | Lei 9.610/1998 | `federal/leis-ordinarias/1998/lei-9610-1998-02-19.md` |
| Software | Lei 9.609/1998 | `federal/leis-ordinarias/1998/lei-9609-1998-02-19.md` |
| Marcas e concorrência desleal | LPI — Lei 9.279/1996 | `federal/leis-ordinarias/1996/lei-9279-1996-05-14.md` |
| Publicidade e consumidor | CDC — Lei 8.078/1990 | `federal/leis-ordinarias/1990/lei-8078-1990-09-11.md` |
| Difamação e invasão de dispositivo (arts. 138–140 e 154-A) | Código Penal — DL 2.848/1940 | `federal/decretos-lei/1940/del-2848-1940-12-07.md` |
| Danos e direitos da personalidade, inclusive de empresas (arts. 52, 186, 187, 927) | Código Civil — Lei 10.406/2002 | `federal/leis-ordinarias/2002/lei-10406-2002-01-10.md` |
| Consultoria de investimentos | Lei 6.385/1976 (art. 27-E) e Resolução CVM 19/2021 | `federal/leis-ordinarias/1976/lei-6385-1976-12-07.md` · `reguladores/cvm/resolucoes/2021/resolucao-cvm-n-19-*` |
| Saúde: atos privativos | Ato Médico (Lei 12.842/2013) e Psicologia (Lei 4.119/1962) | `federal/leis-ordinarias/2013/lei-12842-2013-07-10.md` · `federal/leis-ordinarias/1962/lei-4119-1962-08-27.md` |
| Dados públicos | LAI — Lei 12.527/2011 | `federal/leis-ordinarias/2011/lei-12527-2011-11-18.md` |
| Crianças e adolescentes | ECA — Lei 8.069/1990 | `federal/leis-ordinarias/1990/lei-8069-1990-07-13.md` |

### Processo

1. **Liste o que vai ser publicado** (código, textos, imagens, vídeo, dados) e o que o projeto faz com dados de pessoas e de empresas.
2. **Mapeie os temas** usando a tabela acima e baixe as normas.
3. **Leia os artigos no acervo.** Cite o texto do arquivo, não de memória. Confira no cabeçalho YAML os campos `revogada` e `versao_texto`: "publicação original" pode estar desatualizada.
4. **Confira também o que não é lei:** os termos de uso dos sites e APIs usados e as licenças de tudo que é de terceiros (fontes, músicas, imagens, dados, bibliotecas).
5. **Escreva o relatório para o usuário**, com uma tabela: norma e artigo · onde aparece no projeto · risco (baixo, médio ou alto) · como reduzir o risco.
6. **Termine sempre com o aviso:** "Esta é uma triagem automatizada, não um parecer jurídico. Os textos do acervo são informativos e não substituem o Diário Oficial (veja o campo `fonte` do cabeçalho). Para uso comercial ou em caso de dúvida, consulte um advogado."

### Pontos já avaliados neste projeto

A avaliação de 03/11/2026 (SetupSniper v2.1) não encontrou infração, mas apontou cuidados:

- Os scores das lojas em `data/stores.json` são **estimativas**: mantenha esse aviso visível. Não use palavras que sugiram certificação oficial (CC art. 52 + art. 186; CP art. 139).
- Preços e lojas reais em material de divulgação (vídeo, post) devem vir com o aviso **"preços ilustrativos"** (CDC art. 37 e CC art. 186).
- A coleta de dados deve continuar respeitosa: uso pessoal, intervalos conservadores e sem contornar bloqueios de forma agressiva (termos de uso das lojas e CC art. 187).
- Os nomes das lojas são usados só para identificá-las, sem logotipos (LPI art. 132, IV).
