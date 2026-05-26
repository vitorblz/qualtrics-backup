# backup_qualtrics

Ferramenta de linha de comando para fazer backup local de todas as pesquisas (surveys) de uma conta Qualtrics. O fluxo é dividido em duas etapas: primeiro inventaria as pesquisas via API e grava num arquivo JSON local; depois exporta cada pesquisa pendente como `.zip` (CSV com labels) em paralelo, marcando no arquivo as que já foram baixadas para permitir retomadas idempotentes.

## Objetivo

- Manter um catálogo local (`data/backup.json`) com `id` e `name` de cada pesquisa da conta.
- Baixar as respostas de cada pesquisa para `downloads/<nome>.zip`.
- Suportar execuções incrementais: rodar de novo só baixa o que ainda não foi baixado.

## Requisitos

- Node.js 20+
- pnpm 10+
- Token de API Qualtrics com permissão para listar surveys e exportar respostas

Sem módulos nativos, sem build.

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

Pagina o endpoint `/surveys` e adiciona novas entradas em `data/backup.json` (`id`, `name`, `backup_realizado=0`). Entradas existentes são preservadas, então re-execuções não sobrescrevem o status de backup de pesquisas já conhecidas.

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
5. Marca `backup_realizado = 1` em `data/backup.json`.

Falhas individuais não interrompem o lote — são contadas e logadas no fim.

Variante sequencial disponível: `pnpm realizar-download`.

### 3. Inspecionar o arquivo

JSON puro:

```bash
cat data/backup.json | head
```

Ou consulte com `jq`:

```bash
jq '.pesquisas | length' data/backup.json
jq '[.pesquisas[] | select(.backup_realizado==0)] | length' data/backup.json
```

## Estrutura

```
src/
  qualtrics.js                  # cliente HTTP: iterSurveys, startExport, getExportProgress, downloadExportFile
  store.js                      # persistência JSON em data/backup.json (escrita atômica)
  busca-pesquisas.js            # entrypoint da etapa 1 (inventário)
  realizar-download.js          # entrypoint da etapa 2 (sequencial)
  realizar-download-paralelo.js # entrypoint da etapa 2 (paralelo)
data/
  backup.json                   # store JSON (gerado em runtime, gitignored)
downloads/
  *.zip                         # exports gerados (gitignored)
```

### Formato do store

```json
{
  "pesquisas": {
    "<surveyId>": { "id": "<surveyId>", "name": "...", "backup_realizado": 0 }
  }
}
```

`backup_realizado` é `0` ou `1`.

## Notas

- Escrita atômica (`tmp` + `rename`).
- Downloader paralelo serializa writes via Promise chain pra evitar corrupção.
- Nomes de arquivo são sanitizados (caracteres inválidos viram `_`, limitados a 120 chars).
- Re-rodar `pnpm download-paralelo` é seguro: só processa pendentes.
