/**
 * Prediction Web Worker
 * Manages concurrent tool fetches and HTML parsing outside the main thread.
 */

self.onmessage = async (e) => {
  const { smiles, type } = e.data;
  
  if (type === 'FETCH_PREDICTION') {
    try {
      const b64 = btoa(smiles);
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 90_000);
      const response = await fetch(`/predict/base64/${encodeURIComponent(b64)}`, { signal: ctrl.signal });
      clearTimeout(t);
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      
      const html = await response.text();
      
      // Sanitização básica no worker para evitar travamento do DOMParser na UI
      const cleanHtml = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      
      // O Worker não tem DOMParser nativo em alguns ambientes,
      // então retornamos o HTML limpo e o componente faz o parsing final
      // ou usamos uma lib de parsing leve.
      self.postMessage({ smiles, html: cleanHtml, status: 'success' });
    } catch (error: any) {
      self.postMessage({ smiles, error: error.message, status: 'error' });
    }
  }
};
