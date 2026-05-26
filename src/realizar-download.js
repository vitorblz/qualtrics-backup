import 'dotenv/config';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { db, listPendingStmt, markDoneStmt } from './db.js';
import { downloadExportFile, getExportProgress, startExport } from './qualtrics.js';

const token = process.env.QUALTRICS_API_TOKEN;
if (!token) {
  console.error('Erro: QUALTRICS_API_TOKEN nao definido. Copie .env.example -> .env e preencha.');
  process.exit(1);
}
const baseUrl = process.env.QUALTRICS_BASE_URL;

const DOWNLOADS_DIR = resolve('downloads');
mkdirSync(DOWNLOADS_DIR, { recursive: true });

const MAX_TENTATIVAS = 10;
const INTERVALO_MS = 2000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sanitize(name) {
  const clean = String(name ?? '')
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return clean || 'sem_nome';
}

function destPath(name, surveyId) {
  const base = sanitize(name);
  const primary = resolve(DOWNLOADS_DIR, `${base}.zip`);
  if (!existsSync(primary)) return primary;
  return resolve(DOWNLOADS_DIR, `${base}_${surveyId}.zip`);
}

async function aguardarConclusao(surveyId, progressId) {
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa += 1) {
    await sleep(INTERVALO_MS);
    const { status, percentComplete, fileId } = await getExportProgress({
      token,
      baseUrl,
      surveyId,
      progressId,
    });
    if (status === 'complete') {
      if (!fileId) throw new Error('status complete sem fileId');
      return fileId;
    }
    if (status === 'failed') {
      throw new Error('export reportou status failed');
    }
    console.log(`  tentativa ${tentativa}/${MAX_TENTATIVAS} status=${status} ${percentComplete ?? '?'}%`);
  }
  throw new Error(`timeout apos ${MAX_TENTATIVAS} tentativas`);
}

async function baixarPesquisa({ id, name }) {
  const progressId = await startExport({ token, baseUrl, surveyId: id });
  const fileId = await aguardarConclusao(id, progressId);
  const res = await downloadExportFile({ token, baseUrl, surveyId: id, fileId });
  const buf = Buffer.from(await res.arrayBuffer());
  const path = destPath(name, id);
  writeFileSync(path, buf);
  markDoneStmt.run(id);
  return path;
}

let ok = 0;
let falhas = 0;

try {
  const pendentes = listPendingStmt.all();
  console.log(`Pendentes: ${pendentes.length}`);
  for (const pesquisa of pendentes) {
    console.log(`-> ${pesquisa.id} ${pesquisa.name}`);
    try {
      const path = await baixarPesquisa(pesquisa);
      ok += 1;
      console.log(`   [ok] ${path}`);
    } catch (err) {
      falhas += 1;
      console.error(`   [falha] ${pesquisa.name}: ${err.message}`);
    }
  }
  console.log(`Concluido. ok=${ok} falhas=${falhas}`);
} finally {
  db.close();
}
