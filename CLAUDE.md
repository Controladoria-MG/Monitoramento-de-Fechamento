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
- `resumo.xlsx` é cópia da planilha de controle "Resumo da utilização da Conciliação 2.xlsx" (pasta `python/`, acima deste projeto). Abas usadas:
  - `Clientes`: ID, CodMatriz, RazaoSocial, Grupo, Gerente, Master, Regime, Segmento, Responsável, Coordenação, Departamento. Colunas a mais são ignoradas; o mapa fica em `CAMPOS` no `script.js`.
  - `etapas`: primeira coluna, a partir da linha 2. A ordem das linhas é a ordem do checklist.
- O portal lê com `fetch` + SheetJS (`carregarDados()`). Por isso precisa de servidor: `file://` bloqueia o fetch.

### Backend (`backend/`)
- `atualizar_base.py`: copia a planilha para `data/radar_contabil/resumo.xlsx`, confere as abas e grava `status.json`. Com `--publicar`, faz commit e push só desses dois arquivos.
- Funciona com a planilha aberta no Excel: o Python não abre o arquivo travado, então a cópia é feita pelo `Copy-Item` do PowerShell.

## Regras de negócio

- **O progresso é do grupo, não do cliente.** Uma etapa marcada vale para todos os clientes do mesmo `Grupo` (`chaveGrupo()`). Cliente sem grupo tem o próprio registro.
- Situação do cliente: nenhuma etapa = Não iniciado; todas = Concluído; o resto = Em andamento. As abas da tabela e os placares usam a mesma `statusDe()`.
- "Etapa atual" na tabela é a primeira etapa ainda não marcada.
- Não existe competência (mês). As marcações valem até alguém desmarcar ou usar "Limpar todas as marcações".

## Armadilhas

- **As marcações ficam no `localStorage` do navegador**, na chave `radar-contabil:progresso`. Cada pessoa e cada computador tem o seu progresso; nada é compartilhado. Para a equipe ver o mesmo progresso é preciso um servidor com banco.
- O `github.io` é o mesmo endereço para todos os portais da Controladoria-MG, então o `localStorage` é compartilhado entre eles: a chave precisa continuar única.
- As marcações são guardadas pela **posição** da etapa, não pelo nome. Renomear uma etapa mantém a marcação; reordenar ou inserir etapas no meio faz as marcações existentes apontarem para outra etapa.

## Como rodar

```
cd Radar-Contabil
python backend/atualizar_base.py
python -m http.server 8794
```
Acessar `http://localhost:8794`.

Publicar a base nova: `python backend/atualizar_base.py --publicar`.
