import 'dotenv/config';
import { db, insertPesquisaStmt } from './db.js';
import { iterSurveys } from './qualtrics.js';

const token = process.env.QUALTRICS_API_TOKEN;
if (!token) {
  console.error('Erro: QUALTRICS_API_TOKEN nao definido. Copie .env.example -> .env e preencha.');
  process.exit(1);
}

const baseUrl = process.env.QUALTRICS_BASE_URL;

let total = 0;
let inseridas = 0;
let paginaAtual = 0;

const insertMany = db.transaction((batch) => {
  for (const { id, name } of batch) {
    const info = insertPesquisaStmt.run(id, name ?? '');
    if (info.changes > 0) inseridas += 1;
  }
});

try {
  let buffer = [];
  for await (const survey of iterSurveys({ token, baseUrl })) {
    total += 1;
    buffer.push(survey);
    if (survey._page !== paginaAtual) {
      paginaAtual = survey._page;
      console.log(`Pagina ${paginaAtual} recebida (total acumulado: ${total})`);
    }
    if (buffer.length >= 500) {
      insertMany(buffer);
      buffer = [];
    }
  }
  if (buffer.length) insertMany(buffer);

  console.log(`Concluido. Pesquisas vistas: ${total}. Novas inseridas: ${inseridas}.`);
} catch (err) {
  console.error('Falha ao buscar pesquisas:', err.message);
  process.exitCode = 1;
} finally {
  db.close();
}
