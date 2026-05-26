import 'dotenv/config';
import { loadStore, saveStore, upsertPesquisa } from './store.js';
import { iterSurveys } from './qualtrics.js';

const token = process.env.QUALTRICS_API_TOKEN;
if (!token) {
  console.error('Erro: QUALTRICS_API_TOKEN nao definido. Copie .env.example -> .env e preencha.');
  process.exit(1);
}

const baseUrl = process.env.QUALTRICS_BASE_URL;

const state = loadStore();

let total = 0;
let inseridas = 0;
let paginaAtual = 0;

try {
  for await (const survey of iterSurveys({ token, baseUrl })) {
    total += 1;
    if (upsertPesquisa(state, { id: survey.id, name: survey.name })) {
      inseridas += 1;
    }
    if (survey._page !== paginaAtual) {
      paginaAtual = survey._page;
      console.log(`Pagina ${paginaAtual} recebida (total acumulado: ${total})`);
    }
  }
  saveStore(state);
  console.log(`Concluido. Pesquisas vistas: ${total}. Novas inseridas: ${inseridas}.`);
} catch (err) {
  saveStore(state);
  console.error('Falha ao buscar pesquisas:', err.message);
  process.exitCode = 1;
}
