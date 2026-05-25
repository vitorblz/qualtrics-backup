# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- Install deps: `pnpm install`
- Run survey fetch: `pnpm busca-pesquisas`
- Native module rebuild (after Node upgrade): `npx node-gyp rebuild --release` inside `node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3/` — `better-sqlite3` lacks prebuilt binaries for Node 24, so pnpm install will skip the build script and the module will fail to load until rebuilt.
- Inspect DB (no `sqlite3` CLI available): `node -e "import('better-sqlite3').then(({default:D})=>{const db=new D('data/backup.db');console.log(db.prepare('SELECT COUNT(*) FROM pesquisas').get())})"`

## Required env

`.env` (gitignored) must define:
- `QUALTRICS_API_TOKEN` — Qualtrics X-API-TOKEN
- `QUALTRICS_BASE_URL` (optional) — defaults to `https://yul1.qualtrics.com/API/v3`

## Architecture

ESM Node.js script project. Single workflow: page through Qualtrics `/surveys` API and persist survey IDs/names to a local SQLite DB for later per-survey backup steps to consume.

Three modules, each one responsibility:

- `src/qualtrics.js` — `iterSurveys({token, baseUrl})` async generator. GETs `${baseUrl}/surveys`, yields each `result.elements[i]` tagged with `_page`, follows `result.nextPage` until null. Throws on non-200 `meta.httpStatus` or HTTP errors.
- `src/db.js` — opens `data/backup.db` (creates dir), enables WAL, ensures table `pesquisas(id TEXT PK, name TEXT NOT NULL, backup_realizado INTEGER DEFAULT 0)`, exports `db` + prepared `INSERT OR IGNORE` stmt.
- `src/busca-pesquisas.js` — entrypoint. Loads dotenv, validates token, consumes the generator, buffers 500 rows per `db.transaction` batch, logs per-page progress, prints final `vistas` vs `inseridas`.

Key invariants:
- `INSERT OR IGNORE` keeps `backup_realizado` flag intact across re-runs — never switch to plain INSERT or REPLACE.
- Boolean stored as INTEGER 0/1 (sqlite convention).
- `data/` directory is created at runtime by `db.js`; do not commit it (already in `.gitignore`).

The DB schema is designed for future steps to update `backup_realizado=1` once a per-survey export succeeds.
