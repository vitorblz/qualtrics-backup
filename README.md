# Backup Qualtrics

Command-line tool to back up every survey from a Qualtrics account to local disk. The workflow has two stages: first it inventories the surveys via the API and stores them in a local JSON file; then it exports each pending survey as a `.zip` (CSV with labels) in parallel, marking finished ones in the file so reruns are idempotent.

## Goal

- Keep a local catalog (`data/backup.json`) with the `id` and `name` of every survey in the account.
- Download responses for each survey to `downloads/<name>.zip`.
- Support incremental runs: running again only downloads what hasn't been downloaded yet.

## Requirements

- Node.js 20+
- pnpm 10+
- Qualtrics API token with permission to list surveys and export responses

No native modules, no build step.

## Installation

```bash
pnpm install
```

## Configuration

Create a `.env` file at the project root:

```dotenv
QUALTRICS_API_TOKEN=your_token_here
QUALTRICS_BASE_URL=https://yul1.qualtrics.com/API/v3
```

- `QUALTRICS_API_TOKEN` — required. Sent as the `X-API-TOKEN` header on every request.
- `QUALTRICS_BASE_URL` — optional. Default: `https://yul1.qualtrics.com/API/v3`. Adjust to match your account's data center (e.g. `iad1`, `fra1`, etc.).

## Usage

### 1. Inventory surveys

```bash
pnpm busca-pesquisas
```

Paginates the `/surveys` endpoint and adds new entries to `data/backup.json` (`id`, `name`, `backup_realizado=0`). Existing entries are preserved, so reruns do not overwrite the backup status of surveys already known.

Expected output:

```
Pagina 1 recebida (total acumulado: 100)
Pagina 2 recebida (total acumulado: 200)
...
Concluido. Pesquisas vistas: 1234. Novas inseridas: 12.
```

### 2. Download pending surveys in parallel

```bash
pnpm download-paralelo            # default: 5 workers
pnpm download-paralelo 10         # 10 workers
```

For each survey with `backup_realizado = 0`:

1. `POST /surveys/{id}/export-responses` with `{ format: 'csv', compress: true, useLabels: true }`.
2. Polls `/export-responses/{progressId}` every 2s (up to 10 attempts).
3. Once the export is `complete`, downloads the file via `/export-responses/{fileId}/file`.
4. Saves to `downloads/<sanitized_name>.zip` (if it already exists, appends `_<surveyId>` to the name).
5. Marks `backup_realizado = 1` in `data/backup.json`.

Individual failures do not halt the batch — they are counted and logged at the end.

Sequential variant available: `pnpm realizar-download`.

### 3. Inspect the store

It's plain JSON:

```bash
cat data/backup.json | head
```

Or query with `jq`:

```bash
jq '.pesquisas | length' data/backup.json
jq '[.pesquisas[] | select(.backup_realizado==0)] | length' data/backup.json
```

## Structure

```
src/
  qualtrics.js                  # HTTP client: iterSurveys, startExport, getExportProgress, downloadExportFile
  store.js                      # JSON persistence at data/backup.json (atomic writes)
  busca-pesquisas.js            # stage 1 entrypoint (inventory)
  realizar-download.js          # stage 2 entrypoint (sequential)
  realizar-download-paralelo.js # stage 2 entrypoint (parallel)
data/
  backup.json                   # JSON store (created at runtime, gitignored)
downloads/
  *.zip                         # generated exports (gitignored)
```

### Store shape

```json
{
  "pesquisas": {
    "<surveyId>": { "id": "<surveyId>", "name": "...", "backup_realizado": 0 }
  }
}
```

`backup_realizado` is `0` or `1`.

## Notes

- Writes are atomic (`tmp` file + `rename`).
- Parallel downloader serializes writes via a Promise chain to avoid corruption.
- File names are sanitized (invalid characters become `_`, capped at 120 chars).
- Re-running `pnpm download-paralelo` is safe: only pending surveys are processed.
