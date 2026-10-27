# Monitoramento de Fechamento

Acompanhamento das etapas de fechamento contábil por cliente, feito pela Controladoria.

**Situação: piloto.** O portal foi construído e validado com as coordenações em outubro de 2026. Esta pasta é a entrega ao TI para a versão definitiva. Funciona como está, mas as decisões da seção [O que falta para produção](#o-que-falta-para-produção) são do TI.

Piloto no ar: https://controladoria-mg.github.io/Monitoramento-de-Fechamento/

Contatos: Willian Arruda e Juan Rodrigues (Controladoria).

## O que o sistema faz

- **Placares** (página inicial):
  - percentual geral concluído;
  - clientes concluídos, em andamento e não iniciados;
  - progresso por coordenação, por tributação e por etapa.
- **Tabela de clientes** com abas por situação, filtros e ordenação, e exportação para Excel do que está na tela. Clicar numa linha dos placares filtra a tabela.
- **Checklist:**
  - busca o cliente pelo código ou pelo nome;
  - mostra as etapas com uma rosca de progresso e os outros clientes do mesmo grupo;
  - cada clique grava na hora, e todos que estão com o portal aberto veem a mudança em até 20 segundos.

### Etapas

| Código | Etapa | Regra |
|---|---|---|
| 10 | Empresa sem movimento | Conclui o cliente e trava as demais |
| 11 | Recebimento da documentação contábil 100% | Marca junto a 12 |
| 12 | Recebimento da documentação contábil 80% | Já é possível realizar o fechamento |
| 13 | Conciliação da folha | |
| 14 | Conciliação do resumo fiscal 100% | Marca junto a 15 |
| 15 | Conciliação do fiscal 60% (ICMS) | Falta PIS/Cofins |
| 16 | Conciliação financeira 100% | Marca junto a 17 |
| 17 | Conciliação financeira 85/90% | Já é possível enviar uma prévia |
| 18 | Fechamento liberado | |

### Regras de negócio

- **O progresso é do grupo de clientes.** Uma etapa marcada vale para todos os clientes do mesmo grupo. Um cliente sem grupo tem o próprio registro.
- **Progresso:** etapas 11 a 18 marcadas, divididas por 8.
  - Nenhuma etapa marcada: não iniciado.
  - As 8 etapas, ou "sem movimento": concluído.
  - O resto: em andamento.
- **Empresa sem movimento:** conta como todas as etapas feitas. O que já estava marcado fica guardado e volta a valer quando a opção é desmarcada.
- **Desmarcar uma etapa parcial** (12, 15 ou 17) desmarca também a de 100% correspondente.
- **O código da etapa é o que fica gravado.** Renomear ou reordenar etapas na tela não afeta as marcações. Uma etapa nova recebe um código novo; nunca reaproveite um código.

## Estrutura da pasta

```
index.html                  tela única (placares e checklist)
static/script.js            toda a lógica da tela (etapas: lista ETAPAS)
static/style.css            estilos (padrão visual MG)
static/logo.png
data/monitoramento_fechamento/
    resumo.xlsx             base de clientes que a tela lê (aba "Clientes")
    status.json             data da última atualização da base
servidor/
    app.py                  servidor: entrega a tela e guarda as marcações
    schema.sql              tabela do banco
    importar_piloto.py      traz as marcações do piloto para o banco novo
    requirements.txt
scripts/
    atualizar_base.py       copia a planilha de controle para data/ (uso no piloto)
    requirements.txt
CLAUDE.md                   notas técnicas detalhadas (regras, armadilhas)
```

**Tecnologia:**
- A tela é HTML, CSS e JavaScript puros, sem build.
- O servidor é Python 3 com FastAPI e PostgreSQL.
- Bibliotecas externas, carregadas do cdnjs:
  - SheetJS 0.18.5, que lê a planilha no navegador;
  - ExcelJS 4.4.0, que gera a exportação.

## Como rodar

```bash
pip install -r servidor/requirements.txt
export DATABASE_URL=postgresql://usuario:senha@servidor:5432/banco
uvicorn servidor.app:app --host 0.0.0.0 --port 8000
```

- Rodar a partir da **raiz da pasta**.
- Acesse `http://servidor:8000/`.
- A tabela é criada sozinha na primeira subida (`schema.sql`, idempotente).
- Tela e API ficam no mesmo endereço, então não é preciso CORS. Se a tela for servida de outro endereço, libere a origem em `CORS_ORIGENS` (lista separada por vírgula).
- A tela também funciona servida a partir de um subcaminho (por exemplo `/fechamento/`), porque usa caminhos relativos.

### API

| Método | Caminho | Corpo | Resposta |
|---|---|---|---|
| GET | `/api/fechamento/progresso` | | `{"grupos": {"g:<grupo>": {"etapas": {"<código>": "<data ISO>"}}}}` (com ETag; 304 se nada mudou) |
| PUT | `/api/fechamento/marcacao` | `{"grupo": "g:<grupo>", "etapa": 13, "feito": true}` | `{"grupo", "etapa", "feitoEm"}` |

- A chave do grupo é `g:` seguido do nome do grupo, ou `c:` seguido do código do cliente quando ele não tem grupo.
- Marcar de novo uma etapa já marcada mantém a data original.
- Grupo e etapa vão no corpo, e não no caminho, porque nomes de grupo podem ter `/`.

### Trazer as marcações do piloto

```bash
python servidor/importar_piloto.py
```

- Lê as marcações do servidor do piloto e grava no banco novo, mantendo as datas.
- Pode rodar mais de uma vez sem duplicar.
- Rode logo antes de trocar o endereço, para não perder o que for marcado no piloto até lá.

## Como o piloto funciona hoje (para referência)

- A tela fica no GitHub Pages (repositório público `Controladoria-MG/Monitoramento-de-Fechamento`).
- As marcações ficam no servidor do Quadro (`https://wj-quadro.onrender.com`, rotas `/api/radar-contabil/...`, tabela `radar_contabil_etapas`). O Quadro é outro sistema da Controladoria hospedado no Render, no plano gratuito.
- A base de clientes é a planilha "Resumo da utilização da Conciliação 2.xlsx". O `scripts/atualizar_base.py` copia essa planilha para `data/` e publica com git.
- A tela escolhe o servidor sozinha: no `github.io` usa o do piloto; em qualquer outro endereço usa o próprio (`api/fechamento`). Nada precisa ser alterado no código para a versão definitiva.

## O que falta para produção

Pontos que ficaram de fora por ser piloto. A ordem é a de importância.

1. **Login.** Hoje não há autenticação: qualquer pessoa com o endereço marca e desmarca, e não se sabe quem marcou.
   - O caminho natural é o login da empresa (MG Controle), como planejado para o Quadro.
   - Com login, vale guardar quem marcou: uma coluna `usuario` em `fechamento_etapas`, ou uma tabela de histórico.
2. **Base de clientes.** Hoje vem de uma planilha copiada à mão (`resumo.xlsx`, aba "Clientes"), lida no navegador.
   - O ideal é o servidor entregar a lista a partir do sistema de origem.
   - Colunas usadas: ID, CodMatriz, RazaoSocial, Grupo, Gerente, Master, Regime, Segmento, Responsável, Coordenação, Departamento. O mapa fica em `CAMPOS` no `static/script.js`.
   - Se trocar a planilha por uma API, só a função `carregarDados()` precisa mudar.
3. **Chave do grupo pelo nome.** Hoje as marcações são guardadas pelo nome do grupo, então renomear um grupo faz ele perder as marcações. Com a base vindo de um sistema, use o código do grupo (função `chaveGrupo()` no `script.js`).
4. **Competência (mês).** A pedido das coordenações, o piloto não separa por mês: as marcações valem até alguém desmarcar.
   - Para acompanhar fechamentos mensais, a tabela precisa de uma coluna de competência na chave.
   - A tela precisa de um seletor de mês.
   - É uma decisão de negócio a confirmar com a Controladoria.
5. **Bibliotecas do cdnjs.** Se o servidor ficar só na rede interna, sem internet, baixe `xlsx.full.min.js` e `exceljs.min.js` para `static/` e troque os dois `<script>` no fim do `index.html`.
6. **Dados expostos no piloto.** O repositório do piloto é público, e com ele a `resumo.xlsx`: a lista de clientes, grupos e responsáveis fica acessível pela internet. Depois da migração, o repositório deve ser tornado privado ou arquivado.

## Ao mudar o código

- **Não há build.** Ao mudar `script.js` ou `style.css`, atualize o `?v=` dos dois links no `index.html`, senão o navegador usa a versão antiga.
- Todo texto vindo da base entra na tela por `escapeHTML()`.
- Padrão visual MG:
  - cabeçalho vermelho `#C00000`;
  - status só na rampa de vermelhos, nunca verde ou âmbar;
  - interface toda em português.
