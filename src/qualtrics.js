const DEFAULT_BASE_URL = 'https://yul1.qualtrics.com/API/v3';

function authHeaders(token, extra = {}) {
  return {
    'X-API-TOKEN': token,
    Accept: 'application/json',
    ...extra,
  };
}

async function parseJsonOrThrow(res, url) {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Qualtrics HTTP ${res.status} em ${url}: ${body}`);
  }
  const json = await res.json();
  const status = json?.meta?.httpStatus;
  if (status && !status.startsWith('200')) {
    throw new Error(`Qualtrics meta status inesperado em ${url}: ${status}`);
  }
  return json;
}

export async function startExport({ token, baseUrl = DEFAULT_BASE_URL, surveyId } = {}) {
  if (!token) throw new Error('Qualtrics API token ausente');
  if (!surveyId) throw new Error('surveyId ausente');
  const url = `${baseUrl}/surveys/${surveyId}/export-responses`;
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ format: 'csv', compress: true, useLabels: true }),
  });
  const json = await parseJsonOrThrow(res, url);
  const progressId = json?.result?.progressId;
  if (!progressId) throw new Error(`Sem progressId na resposta: ${JSON.stringify(json)}`);
  return progressId;
}

export async function getExportProgress({ token, baseUrl = DEFAULT_BASE_URL, surveyId, progressId } = {}) {
  if (!token) throw new Error('Qualtrics API token ausente');
  const url = `${baseUrl}/surveys/${surveyId}/export-responses/${progressId}`;
  const res = await fetch(url, { method: 'GET', headers: authHeaders(token) });
  const json = await parseJsonOrThrow(res, url);
  const r = json?.result ?? {};
  return { status: r.status, percentComplete: r.percentComplete, fileId: r.fileId };
}

export async function downloadExportFile({ token, baseUrl = DEFAULT_BASE_URL, surveyId, fileId } = {}) {
  if (!token) throw new Error('Qualtrics API token ausente');
  const url = `${baseUrl}/surveys/${surveyId}/export-responses/${fileId}/file`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'X-API-TOKEN': token },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Qualtrics HTTP ${res.status} em ${url}: ${body}`);
  }
  return res;
}

export async function* iterSurveys({ token, baseUrl = DEFAULT_BASE_URL } = {}) {
  if (!token) throw new Error('Qualtrics API token ausente');

  let url = `${baseUrl}/surveys`;
  let page = 0;

  while (url) {
    page += 1;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-TOKEN': token,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Qualtrics HTTP ${res.status} em ${url}: ${body}`);
    }

    const json = await res.json();
    const status = json?.meta?.httpStatus;
    if (status && !status.startsWith('200')) {
      throw new Error(`Qualtrics meta status inesperado: ${status}`);
    }

    const elements = json?.result?.elements ?? [];
    for (const el of elements) {
      yield { ...el, _page: page };
    }

    url = json?.result?.nextPage ?? null;
  }
}
