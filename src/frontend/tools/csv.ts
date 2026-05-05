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
  
  // Remove BOM if present
  text = text.replace(/^\ufeff/, '');
  
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
  return headers.find(h => pattern.test(h.replace(/^\ufeff/, '').trim())) ?? '';
}

export function detectSmilesColumn(rows: string[][]): number {
  if (rows.length < 1) return -1;
  const headers = rows[0].map(h => h.replace(/^\ufeff/, '').trim().toLowerCase());
  
  // 1. Try headers first
  const pattern = /smiles|smi|canonical|structure/i;
  const hIndex = headers.findIndex(h => pattern.test(h));
  if (hIndex !== -1) return hIndex;
  
  // 2. Look at data (sample first 5 rows)
  const sampleRows = rows.slice(1, 6);
  if (sampleRows.length === 0) return 0; // Fallback to first col
  
  const colScores = new Array(rows[0].length).fill(0);
  const smilesPattern = /^([^J][0-9BCEFHIKNPRSUVWYZabcefhikmnprsuvwzy]*)((@|@@)?[0-9BCEFHIKNPRSUVWYZabcefhikmnprsuvwzy]*)*$/;
  // A very loose SMILES-like regex just to rank columns
  
  for (const row of sampleRows) {
    row.forEach((cell, i) => {
      const c = cell.trim();
      if (c.length > 3 && (c.includes('=') || c.includes('(') || c.includes(')') || c.includes('[') || c.includes('c1'))) {
         colScores[i]++;
      }
    });
  }
  
  let bestIdx = 0;
  let maxScore = -1;
  colScores.forEach((score, i) => {
    if (score > maxScore) {
      maxScore = score;
      bestIdx = i;
    }
  });
  
  return bestIdx;
}
