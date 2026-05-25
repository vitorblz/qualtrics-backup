import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';

const DB_PATH = resolve('data/backup.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS pesquisas (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    backup_realizado INTEGER NOT NULL DEFAULT 0
  );
`);

export const insertPesquisaStmt = db.prepare(
  'INSERT OR IGNORE INTO pesquisas (id, name) VALUES (?, ?)'
);
