# Backup Qualtrics

Command-line tool to back up every survey from a Qualtrics account to local disk. The workflow has two stages: first it inventories the surveys via the API and stores them in a local SQLite database; then it exports each pending survey as a `.zip` (CSV with labels) in parallel, marking finished ones in the database so reruns are idempotent.

## Goal

- Keep a local catalog (`data/backup.db`) with the `id` and `name` of every survey in the account.
- Download responses for each survey to `downloads/<name>.zip`.
- Support incremental runs: running again only downloads what hasn't been downloaded yet.

## Requirements

- Node.js 24+
- pnpm 10+
- Qualtrics API token with permission to list surveys and export responses

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

Paginates the `/surveys` endpoint and inserts new rows into `pesquisas` (id, name, backup_realizado=0). Uses `INSERT OR IGNORE`, so reruns do not overwrite the backup status of surveys already known.

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
5. Marks `backup_realizado = 1` in the database.

Individual failures do not halt the batch — they are counted and logged at the end.

### 3. Inspect the database

No `sqlite3` CLI is installed by default. Use `better-sqlite3` itself:

```bash
node -e "import('better-sqlite3').then(({default:D})=>{const db=new D('data/backup.db');console.log(db.prepare('SELECT COUNT(*) FROM pesquisas').get())})"
```

## Structure

```
src/
  qualtrics.js                  # HTTP client: iterSurveys, startExport, getExportProgress, downloadExportFile
  db.js                         # opens data/backup.db, creates schema, exports prepared statements
  busca-pesquisas.js            # stage 1 entrypoint (inventory)
  realizar-download-paralelo.js # stage 2 entrypoint (parallel download)
data/
  backup.db                     # SQLite (created at runtime, gitignored)
downloads/
  *.zip                         # generated exports (gitignored)
```

### Schema

```sql
CREATE TABLE pesquisas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  backup_realizado INTEGER NOT NULL DEFAULT 0
);
```

`backup_realizado` is a boolean stored as INTEGER 0/1.

## Notes

- WAL mode enabled to allow concurrent reads during writes.
- File names are sanitized (invalid characters become `_`, capped at 120 chars).
- Re-running `pnpm download-paralelo` is safe: only pending surveys are processed.
