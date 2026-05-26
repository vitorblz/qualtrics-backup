import 'dotenv/config';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { listPending, loadStore, makeSerialSaver } from './store.js';
import { downloadExportFile, getExportProgress, startExport } from './qualtrics.js';

const token = process.env.QUALTRICS_API_TOKEN;
if (!token) {
  console.error('Erro: QUALTRICS_API_TOKEN nao definido. Copie .env.example -> .env e preencha.');
  process.exit(1);
}
const baseUrl = process.env.QUALTRICS_BASE_URL;

const DEFAULT_CONCURRENCY = 5;
const arg = process.argv[2];
const parsed = arg === undefined ? DEFAULT_CONCURRENCY : Number(arg);
if (!Number.isInteger(parsed) || parsed < 1) {
  console.error(`Concorrencia invalida: ${arg}. Use inteiro >= 1.`);
  process.exit(1);
}
const concorrencia = parsed;

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

async function aguardarConclusao(surveyId, progressId, workerTag) {
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
    console.log(`${workerTag}   tentativa ${tentativa}/${MAX_TENTATIVAS} status=${status} ${percentComplete ?? '?'}%`);
  }
  throw new Error(`timeout apos ${MAX_TENTATIVAS} tentativas`);
}

async function baixarPesquisa({ id, name }, workerTag) {
  const progressId = await startExport({ token, baseUrl, surveyId: id });
  const fileId = await aguardarConclusao(id, progressId, workerTag);
  const res = await downloadExportFile({ token, baseUrl, surveyId: id, fileId });
  const buf = Buffer.from(await res.arrayBuffer());
  const path = destPath(name, id);
  writeFileSync(path, buf);
  await saveDone(state, id);
  return path;
}

const state = loadStore();
const saveDone = makeSerialSaver();
let ok = 0;
let falhas = 0;

try {
  const pendentes = listPending(state);
  console.log(`Pendentes: ${pendentes.length} concorrencia=${concorrencia}`);

  let i = 0;
  const workers = Math.min(concorrencia, pendentes.length);

  async function worker(n) {
    const tag = `[w${n}]`;
    while (true) {
      const idx = i++;
      if (idx >= pendentes.length) return;
      const pesquisa = pendentes[idx];
      console.log(`${tag} -> ${pesquisa.id} ${pesquisa.name}`);
      try {
        const path = await baixarPesquisa(pesquisa, tag);
        ok += 1;
        console.log(`${tag}    [ok] ${path}`);
      } catch (err) {
        falhas += 1;
        console.error(`${tag}    [falha] ${pesquisa.name}: ${err.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: workers }, (_, n) => worker(n + 1)));

  console.log(`Concluido. ok=${ok} falhas=${falhas} concorrencia=${concorrencia}`);
} catch (err) {
  console.error('Falha:', err.message);
  process.exitCode = 1;
}
