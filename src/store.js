import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const STORE_PATH = resolve('data/backup.json');

export function loadStore() {
  mkdirSync(dirname(STORE_PATH), { recursive: true });
  try {
    const raw = readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.pesquisas || typeof parsed.pesquisas !== 'object') {
      return { pesquisas: {} };
    }
    return parsed;
  } catch (err) {
    if (err.code === 'ENOENT') return { pesquisas: {} };
    throw err;
  }
}

export function saveStore(state) {
  const tmp = `${STORE_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, STORE_PATH);
}

export function upsertPesquisa(state, { id, name }) {
  if (!id) return false;
  if (state.pesquisas[id]) return false;
  state.pesquisas[id] = { id, name: name ?? '', backup_realizado: 0 };
  return true;
}

export function listPending(state) {
  return Object.values(state.pesquisas).filter((p) => p.backup_realizado === 0);
}

export function markDone(state, id) {
  const row = state.pesquisas[id];
  if (!row) return;
  row.backup_realizado = 1;
  saveStore(state);
}

export function makeSerialSaver() {
  let chain = Promise.resolve();
  return (state, id) => {
    chain = chain.then(() => markDone(state, id));
    return chain;
  };
}
