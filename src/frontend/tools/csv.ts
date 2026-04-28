export function getDelimiter(text: string): string {
  text = text.trim();
  if (!text) return ',';
  const firstLine = text.split('\n')[0];
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let inQ = false;
  for (let i = 0; i < firstLine.length; i++) {
    if (firstLine[i] === '"') inQ = !inQ;
    if (!inQ && firstLine[i] in counts) counts[firstLine[i]]++;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

export function parseCSV(text: string, delimiter?: string): string[][] {
  const delim = delimiter || getDelimiter(text);
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;
  
  // Normalize line endings
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    
    if (c === '"') {
      if (insideQuotes && text[i + 1] === '"') {
        currentField += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (c === delim && !insideQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if (c === '\n' && !insideQuotes) {
      currentRow.push(currentField.trim());
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += c;
    }
  }
  
  currentRow.push(currentField.trim());
  if (currentRow.length > 0 && currentRow.some(c => c !== '')) {
    rows.push(currentRow);
  }

  return rows;
}

export function getCSVColumn(csvData: string[][], name: string): string[] {
  const header = csvData[0];
  const colIndex = header.indexOf(name);
  if (colIndex === -1) return [];
  return csvData.slice(1).map((row) => row[colIndex] || '');
}

export function autoDetect(headers: string[], pattern: RegExp): string {
  return headers.find(h => pattern.test(h)) ?? '';
}
