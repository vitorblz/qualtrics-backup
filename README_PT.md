# backup_qualtrics

Ferramenta de linha de comando para fazer backup local de todas as pesquisas (surveys) de uma conta Qualtrics. O fluxo é dividido em duas etapas: primeiro inventaria as pesquisas via API e grava num SQLite local; depois exporta cada pesquisa pendente como `.zip` (CSV com labels) em paralelo, marcando no banco as que já foram baixadas para permitir retomadas idempotentes.

## Objetivo

- Manter um catálogo local (`data/backup.db`) com `id` e `name` de cada pesquisa da conta.
- Baixar as respostas de cada pesquisa para `downloads/<nome>.zip`.
- Suportar execuções incrementais: rodar de novo só baixa o que ainda não foi baixado.

## Requisitos

- Node.js 24+
- pnpm 10+
- Token de API Qualtrics com permissão para listar surveys e exportar respostas

## Instalação

```bash
pnpm install
```

## Configuração

Crie um arquivo `.env` na raiz do projeto:

```dotenv
QUALTRICS_API_TOKEN=seu_token_aqui
QUALTRICS_BASE_URL=https://yul1.qualtrics.com/API/v3
```

- `QUALTRICS_API_TOKEN` — obrigatório. Header `X-API-TOKEN` enviado em todas as requisições.
- `QUALTRICS_BASE_URL` — opcional. Default: `https://yul1.qualtrics.com/API/v3`. Ajuste para o data center da sua conta (ex.: `iad1`, `fra1`, etc.).

## Uso

### 1. Inventariar pesquisas

```bash
pnpm busca-pesquisas
```

Pagina o endpoint `/surveys`, insere novos registros em `pesquisas` (id, name, backup_realizado=0). Usa `INSERT OR IGNORE`, então re-execuções não sobrescrevem o status de backup de pesquisas já conhecidas.

Saída esperada:

```
Pagina 1 recebida (total acumulado: 100)
Pagina 2 recebida (total acumulado: 200)
...
Concluido. Pesquisas vistas: 1234. Novas inseridas: 12.
```

### 2. Baixar pesquisas pendentes em paralelo

```bash
pnpm download-paralelo            # default: 5 workers
pnpm download-paralelo 10         # 10 workers
```

Para cada pesquisa com `backup_realizado = 0`:

1. `POST /surveys/{id}/export-responses` com `{ format: 'csv', compress: true, useLabels: true }`.
2. Faz polling de `/export-responses/{progressId}` a cada 2s (até 10 tentativas).
3. Quando o export fica `complete`, baixa o arquivo via `/export-responses/{fileId}/file`.
4. Salva em `downloads/<nome_sanitizado>.zip` (se já existir, anexa `_<surveyId>` ao nome).
5. Marca `backup_realizado = 1` no banco.

Falhas individuais não interrompem o lote — são contadas e logadas no fim.

### 3. Inspecionar o banco

Não há `sqlite3` CLI instalado por padrão. Use o próprio `better-sqlite3`:

```bash
node -e "import('better-sqlite3').then(({default:D})=>{const db=new D('data/backup.db');console.log(db.prepare('SELECT COUNT(*) FROM pesquisas').get())})"
```

## Estrutura

```
src/
  qualtrics.js                  # cliente HTTP: iterSurveys, startExport, getExportProgress, downloadExportFile
  db.js                         # abre data/backup.db, cria schema, exporta statements preparados
  busca-pesquisas.js            # entrypoint da etapa 1 (inventário)
  realizar-download-paralelo.js # entrypoint da etapa 2 (download em paralelo)
data/
  backup.db                     # SQLite (gerado em runtime, gitignored)
downloads/
  *.zip                         # exports gerados (gitignored)
```

### Schema

```sql
CREATE TABLE pesquisas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  backup_realizado INTEGER NOT NULL DEFAULT 0
);
```

`backup_realizado` é um boolean armazenado como INTEGER 0/1.

## Notas

- WAL mode habilitado para permitir leituras concorrentes durante a escrita.
- Nomes de arquivo são sanitizados (caracteres inválidos viram `_`, limitados a 120 chars).
- Re-rodar `pnpm download-paralelo` é seguro: só processa pendentes.
