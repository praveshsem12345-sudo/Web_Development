const STORAGE_KEY = 'bulkEmailHistory';

export function loadHistory(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendHistory(storage, records) {
  const existing = loadHistory(storage);
  const combined = existing.concat(records);
  storage.setItem(STORAGE_KEY, JSON.stringify(combined));
}

const CSV_COLUMNS = ['email', 'name', 'subject', 'sentAt', 'status'];

function escapeCsvField(value) {
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function historyToCsv(records) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const record of records) {
    lines.push(CSV_COLUMNS.map((col) => escapeCsvField(record[col] ?? '')).join(','));
  }
  return lines.join('\n');
}
