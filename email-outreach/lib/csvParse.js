const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseCsv(text) {
  const lines = text.split(/\r\n|\r|\n/).filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { rows: [], errors: [], validCount: 0, totalCount: 0 };
  }

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const emailIdx = header.indexOf('email');

  if (emailIdx === -1) {
    return {
      rows: [],
      errors: [{ line: 1, reason: 'No "email column" found in the CSV header row.' }],
      validCount: 0,
      totalCount: 0,
    };
  }

  const rows = [];
  const errors = [];
  const dataLines = lines.slice(1);

  dataLines.forEach((line, i) => {
    const cells = line.split(',').map((c) => c.trim());
    const email = (cells[emailIdx] || '').toLowerCase();

    if (!EMAIL_RE.test(email)) {
      errors.push({ line: i + 2, reason: `"${cells[emailIdx] || ''}" is not a valid email address.` });
      return;
    }

    const row = { email };
    header.forEach((col, colIdx) => {
      if (col === 'email') return;
      row[col] = cells[colIdx] !== undefined ? cells[colIdx] : '';
    });
    rows.push(row);
  });

  return { rows, errors, validCount: rows.length, totalCount: dataLines.length };
}
