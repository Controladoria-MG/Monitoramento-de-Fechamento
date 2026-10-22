# CLAUDE.md — Radar Contábil

Checklist das etapas de fechamento contábil por cliente, com placares por coordenação, tributação e etapa. Publicado no GitHub Pages (`Controladoria-MG/Radar-Contabil`) e listado na Central de Relatórios.

## Estrutura de Diretórios

```
Raiz/
├── index.html
├── .gitignore
├── CLAUDE.md
├── documentacao.txt
├── requirements.txt
├── static/
│   ├── script.js
│   ├── style.css
│   └── logo.png
├── data/
│   └── radar_contabil/
│       ├── resumo.xlsx   (a base que o portal lê)
│       └── status.json   (data da última atualização)
└── backend/
    └── atualizar_base.py (só local, fora do repositório)
```

## Regras — OBRIGATÓRIO SEGUIR

### HTML
- O único `.html` é `index.html`, sempre na raiz.
- **NUNCA** escreva CSS ou JS inline no HTML. Use `static/`.

### CSS e JS
- Todo `.css` e `.js` fica em `static/`, sem subpastas.
- Padrão visual MG: cabeçalho `--mg-vermelho` (`#C00000`) com o logo, fundo claro, tema escuro opcional (`:root[data-tema="escuro"]`), fonte Segoe UI.
- **Nunca verde ou âmbar para status.** Só a rampa de vermelho MG (`--vermelho-claro/medio/profundo`), igual aos outros dashboards.
- Texto vindo da planilha só entra em `innerHTML` passando por `escapeHTML()`.

### Dados (`data/`)
- Tudo dentro de `data/radar_contabil/`, nunca na raiz de `data/`.
- `resumo.xlsx` é cópia da planilha de controle "Resumo da utilização da Conciliação 2.xlsx" (pasta `python/`, acima deste projeto). Só a aba `Clientes` é usada: ID, CodMatriz, RazaoSocial, Grupo, Gerente, Master, Regime, Segmento, Responsável, Coordenação, Departamento. Colunas a mais são ignoradas; o mapa fica em `CAMPOS` no `script.js`.
- A aba `etapas` da planilha **não é mais usada**: as etapas ficam fixas em `ETAPAS` no `script.js` (ver "Etapas do checklist").
- O portal lê com `fetch` + SheetJS (`carregarDados()`). Por isso precisa de servidor: `file://` bloqueia o fetch.

### Backend (`backend/`)
- `atualizar_base.py`: copia a planilha para `data/radar_contabil/resumo.xlsx`, confere a aba `Clientes` e grava `status.json`. Com `--publicar`, faz commit e push só desses dois arquivos.
- Funciona com a planilha aberta no Excel: o Python não abre o arquivo travado, então a cópia é feita pelo `Copy-Item` do PowerShell.

### Marcações (compartilhadas)
- As etapas marcadas ficam no **servidor do Quadro** (WJ-Quadro, Render), tabela `radar_contabil_etapas` (grupo, etapa, feito_em), para todos verem o mesmo progresso.
- API (`API_PADRAO` no `script.js`): `GET https://wj-quadro.onrender.com/api/radar-contabil/progresso` devolve `{grupos: {"g:<grupo>": {etapas: {"0": iso, ...}}}}`; `PUT .../marcacao` com `{grupo, etapa, feito}` marca ou desmarca. O código das rotas está no `backend/main.py` do repositório WJ-Quadro, seção "ROTAS — RADAR CONTÁBIL".
- O clique muda a tela na hora e grava em seguida; se o servidor recusar, a marcação volta e aparece um aviso. A cada 20 s a tela busca o que os outros marcaram (`atualizarEmSegundoPlano`).
- Não há login: qualquer pessoa com o endereço marca e desmarca. Por isso não existe "limpar todas as marcações".
- No navegador (`localStorage`, chave `radar-contabil:preferencias`) fica só o tema.
- Para testar com um Quadro local: `http://localhost:8794/?api=http://127.0.0.1:8000/api/radar-contabil` (o parâmetro `api` só vale em localhost).

## Etapas do checklist

Definidas em `ETAPAS` no `script.js` (pedido da coordenação, 2026-10-22), nesta ordem:

| Código | Etapa | Regra |
|---|---|---|
| 10 | Empresa sem movimento | Conclui o cliente e trava as demais |
| 11 | Recebimento da documentação contábil 100% | Leva junto a 12 |
| 12 | Recebimento da documentação contábil 80% | "Já é possível realizar o fechamento" |
| 13 | Conciliação da folha | |
| 14 | Conciliação do resumo fiscal 100% | Leva junto a 15 |
| 15 | Conciliação do fiscal 60% (ICMS) | "Falta PIS/Cofins" |
| 16 | Conciliação financeira 100% | Leva junto a 17 |
| 17 | Conciliação financeira 85/90% | "Já é possível enviar uma prévia" |
| 18 | Fechamento liberado | |

- **O código é o que vai para o servidor.** Nunca mude nem reaproveite um código. Os códigos 0 a 5 foram da primeira lista (Cobrança, Recebimento, Conciliação Financeira, Folha, Fiscal, Importar Fechamento) e ficam ignorados.
- Renomear uma etapa ou mudar a ordem na tela é seguro (a marcação segue o código). Etapa nova ganha código novo (19, 20...). O servidor aceita códigos de 0 a 49.
- **Empresa sem movimento** (`semMovimento`): marcada, o cliente conta como concluído, as demais etapas ficam travadas (`.etapa.fechada`) e contam como feitas nos placares. As marcações delas ficam guardadas e voltam a valer ao desmarcar.
- **Parciais** (`parcial`): marcar a de 100% marca a parcial junto; desmarcar a parcial desmarca a de 100% (`etapasAfetadas()`). Cada uma é uma gravação separada no servidor.
- O progresso conta as 8 etapas de trabalho (`TOTAL_ETAPAS`), sem a "sem movimento".

## Regras de negócio

- **O progresso é do grupo, não do cliente.** Uma etapa marcada vale para todos os clientes do mesmo `Grupo` (`chaveGrupo()`). Cliente sem grupo tem o próprio registro.
- Situação do cliente: nenhuma etapa = Não iniciado; as 8 de trabalho ou "sem movimento" = Concluído; o resto = Em andamento. As abas da tabela e os placares usam a mesma `statusDe()`.
- "Etapa atual" na tabela é a primeira etapa de trabalho ainda não marcada, na ordem da tela ("Sem movimento" quando for o caso).
- Não existe competência (mês). As marcações valem até alguém desmarcar.

## Armadilhas

- **O Render gratuito dorme sem uso.** O primeiro acesso do dia pode levar até um minuto; a tela mostra "Conectando ao servidor..." depois de 4 s.
- O `github.io` é o mesmo endereço para todos os portais da Controladoria-MG, então o `localStorage` é compartilhado entre eles: a chave precisa continuar única.
- A chave do grupo é `"g:" + Grupo` da planilha. **Renomear um grupo na planilha faz ele perder as marcações** (passa a ser outra chave).

## Como rodar

```
cd Radar-Contabil
python backend/atualizar_base.py
python -m http.server 8794
```
Acessar `http://localhost:8794`.

Publicar a base nova: `python backend/atualizar_base.py --publicar`.
