# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- Install deps: `pnpm install`
- Run survey fetch: `pnpm busca-pesquisas`
- Run downloads: `pnpm realizar-download` or `pnpm download-paralelo [N]`
- Inspect store: `cat data/backup.json | head`

No native modules. Pure JS — works on any Node 20+ without rebuild.

## Required env

`.env` (gitignored) must define:
- `QUALTRICS_API_TOKEN` — Qualtrics X-API-TOKEN
- `QUALTRICS_BASE_URL` (optional) — defaults to `https://yul1.qualtrics.com/API/v3`

## Architecture

ESM Node.js script project. Workflow: page through Qualtrics `/surveys` API, persist survey IDs/names to a local JSON file, then download per-survey exports and mark each one done.

Modules:

- `src/qualtrics.js` — `iterSurveys({token, baseUrl})` async generator + export helpers (`startExport`, `getExportProgress`, `downloadExportFile`). Throws on non-200 `meta.httpStatus` or HTTP errors.
- `src/store.js` — JSON-file persistence at `data/backup.json`. Exports `loadStore`, `saveStore`, `upsertPesquisa`, `listPending`, `markDone`, `makeSerialSaver`. Atomic writes via tmp+rename.
- `src/busca-pesquisas.js` — entrypoint. Loads dotenv, validates token, consumes the generator, upserts each survey, saves once at end.
- `src/realizar-download.js` — sequential download of pending surveys; calls `markDone` after each success.
- `src/realizar-download-paralelo.js` — concurrent worker pool (default 5); uses `makeSerialSaver` to serialize writes to `data/backup.json` across workers.

Store shape:

```json
{ "pesquisas": { "<id>": { "id": "...", "name": "...", "backup_realizado": 0 } } }
```

Key invariants:
- `upsertPesquisa` only inserts when `id` is absent — preserves `backup_realizado` across re-runs.
- `backup_realizado` is `0` or `1`.
- `data/` directory is created at runtime by `store.js`; do not commit it (already in `.gitignore`).
- Parallel downloader MUST go through `makeSerialSaver` to avoid concurrent writes corrupting the JSON.
