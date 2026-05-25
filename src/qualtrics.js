const DEFAULT_BASE_URL = 'https://yul1.qualtrics.com/API/v3';

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
