let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollCount = 0;
const MAX_POLLS = 100; // 500 s max (100 × 5 s)

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function fetchResults(resultUrl: string, smilesHash: string) {
  pollCount++;
  if (pollCount > MAX_POLLS) {
    stopPolling();
    self.postMessage({ status: 'timeout' });
    return;
  }

  try {
    const pollCtrl = new AbortController();
    const pollT = setTimeout(() => pollCtrl.abort(), 45_000);
    const response = await fetch('/predict/pkcsm/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: resultUrl, smiles_hash: smilesHash }),
      signal: pollCtrl.signal,
    });
    clearTimeout(pollT);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    if (!html || html.length < 100) {
      self.postMessage({ status: 'waiting', message: 'Receiving empty response from pkCSM...' });
      return;
    }

    const cleanHtml = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');

    const parser = new DOMParser();
    const doc = parser.parseFromString(cleanHtml, 'text/html');

    const tables = doc.querySelectorAll('.table.table-hover.table-striped');
    const targetTable = tables.length > 1 ? tables[1] : tables[0];

    if (!targetTable) {
      self.postMessage({ status: 'waiting', message: 'Waiting for results table...' });
      return;
    }

    const results: { property: string; model: string; value: string; unit: string }[] = [];
    let allReady = true;

    targetTable.querySelectorAll('tbody tr').forEach((row) => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 4) {
        const predValue = (cells[2].textContent || '').trim();
        if (predValue.toLowerCase().includes('running')) allReady = false;
        results.push({
          property: (cells[0].textContent || '').trim(),
          model:    (cells[1].textContent || '').trim(),
          value:    predValue,
          unit:     (cells[3].textContent || '').trim(),
        });
      }
    });

    if (results.length > 0) {
      if (allReady) {
        stopPolling();
        self.postMessage({ status: 'done', results });
      } else {
        self.postMessage({ status: 'partial', results, message: `Processing... (${results.length} properties found)` });
      }
    } else {
      self.postMessage({ status: 'waiting', message: 'Waiting for model calculations...' });
    }
  } catch (err: any) {
    self.postMessage({ status: 'waiting', message: `Retrying pkCSM fetch... (${err.message})` });
  }
}

self.onmessage = async (e) => {
  const { smiles, type } = e.data;
  if (type !== 'FETCH_PKCSM') return;

  pollCount = 0;
  stopPolling();

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const b64 = btoa(smiles);
      const initCtrl = new AbortController();
      const initT = setTimeout(() => initCtrl.abort(), 30_000);
      const initRes = await fetch(`/predict/pkcsm/base64/${encodeURIComponent(b64)}`, { signal: initCtrl.signal });
      clearTimeout(initT);
      if (!initRes.ok) throw new Error(`HTTP ${initRes.status}`);

      const data = await initRes.json();
      if (!data.result_url) throw new Error('No result URL returned');

      const { result_url, smiles_hash = '' } = data;
      self.postMessage({ status: 'started', message: 'Prediction started. Waiting for results...' });

      pollTimer = setInterval(() => fetchResults(result_url, smiles_hash), 5000);
      fetchResults(result_url, smiles_hash);
      return; // Success
    } catch (err: any) {
      if (attempt < 3) {
        self.postMessage({ status: 'waiting', message: `Initialization failed (Attempt ${attempt}/3). Retrying...` });
        await new Promise(r => setTimeout(r, 5000));
      } else {
        self.postMessage({ status: 'error', error: `Failed after 3 attempts: ${err.message}` });
      }
    }
  }
};
