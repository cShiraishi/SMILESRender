self.onmessage = async (e) => {
  const { smiles, type } = e.data;
  if (type !== 'FETCH_ADMETLAB') return;

  try {
    const b64 = btoa(smiles);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 90_000);
    const response = await fetch(`/predict/admetlab/base64/${encodeURIComponent(b64)}`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    const cleanHtml = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');

    const parser = new DOMParser();
    const doc = parser.parseFromString(cleanHtml, 'text/html');

    const subTitles = doc.querySelectorAll('.sub-title');
    let found = 0;

    subTitles.forEach((titleElem) => {
      let categoryName = titleElem.textContent?.trim() || 'Properties';
      if (categoryName === 'Absporption') categoryName = 'Absorption';
      if (categoryName === 'ABSPORPTION') categoryName = 'Absorption';
      if (categoryName === 'Structure' || categoryName === 'Physicochemical Property') return;

      // Strategy: walk forward through siblings and parent's children to find
      // the table that belongs to this sub-title section.
      const sectionProps: { name: string; value: string }[] = [];
      
      // Try 1: look in the sub-title's parent for a table (direct sibling)
      let parent = titleElem.parentElement;
      let table = parent?.querySelector('table');
      
      // Try 2: if no table in parent, walk nextElementSibling from the sub-title
      if (!table) {
        let sibling = titleElem.nextElementSibling;
        while (sibling) {
          if (sibling.tagName === 'TABLE') { table = sibling; break; }
          const nested = sibling.querySelector?.('table');
          if (nested) { table = nested; break; }
          // Stop if we hit the next sub-title
          if (sibling.classList?.contains('sub-title')) break;
          sibling = sibling.nextElementSibling;
        }
      }

      if (table) {
        table.querySelectorAll('tr').forEach((row) => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 2) {
            const name = cells[0].textContent?.trim() ?? '';
            const value = cells[1].textContent?.trim() ?? '';
            if (name && value && name !== 'Property' && name !== 'Model') {
              sectionProps.push({ name, value });
            }
          }
        });
      }

      if (sectionProps.length > 0) {
        found++;
        self.postMessage({ status: 'chunk', category: { name: categoryName, props: sectionProps } });
      }
    });

    if (found === 0) {
      // Fallback: parse all tables in order
      doc.querySelectorAll('table').forEach((table, idx) => {
        const props: { name: string; value: string }[] = [];
        table.querySelectorAll('tr').forEach((row) => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 2) {
            const name = cells[0].textContent?.trim() ?? '';
            const value = cells[1].textContent?.trim() ?? '';
            if (name && value) props.push({ name, value });
          }
        });
        if (props.length > 0) {
          self.postMessage({ status: 'chunk', category: { name: `Section ${idx + 1}`, props } });
        }
      });
    }

    self.postMessage({ status: 'done' });
  } catch (err: any) {
    self.postMessage({ status: 'error', error: err.message });
  }
};
