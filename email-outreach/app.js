// app.js
import { parseCsv } from './lib/csvParse.js';
import { renderTemplate } from './lib/mergeRender.js';
import { loadHistory, appendHistory, historyToCsv } from './lib/historyStore.js';

const rowsContainer = document.getElementById('recipient-rows');
const addBtn = document.getElementById('add-recipient');
const form = document.getElementById('send-form');
const errorEl = document.getElementById('form-error');
const noteEl = document.getElementById('form-note');
const sendBtn = document.getElementById('send-btn');
const csvInput = document.getElementById('csv-upload');
const csvStatus = document.getElementById('csv-status');
const progressTrack = document.getElementById('progress-track');
const progressFill = document.getElementById('progress-fill');
const statusList = document.getElementById('recipient-status-list');
const historyEmpty = document.getElementById('history-empty');
const historyList = document.getElementById('history-list');
const downloadBtn = document.getElementById('download-history');

let csvRecipients = [];

function addRecipientRow(email = '', name = '') {
  const row = document.createElement('div');
  row.className = 'manifest-row';
  row.innerHTML = `
    <input type="email" class="r-email" placeholder="recipient@example.com" value="${email}">
    <input type="text" class="r-name" placeholder="Name (optional)" value="${name}">
    <button type="button" class="remove-row" aria-label="Remove">&times;</button>
  `;
  row.querySelector('.remove-row').addEventListener('click', () => row.remove());
  rowsContainer.appendChild(row);
}

addBtn.addEventListener('click', () => addRecipientRow());
addRecipientRow();

// File-picker cancel handling: no 'change' event fires on cancel, so there is
// nothing to guard against directly — the important rule is that no loading
// state is entered until a change event with a real file arrives.
csvInput.addEventListener('change', () => {
  const file = csvInput.files && csvInput.files[0];
  if (!file) {
    // Defensive: some browsers fire change with an empty FileList in edge cases.
    csvRecipients = [];
    csvStatus.textContent = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const { rows, errors, validCount, totalCount } = parseCsv(String(reader.result));
    csvRecipients = rows;
    if (totalCount === 0) {
      csvStatus.textContent = 'That file had no data rows.';
    } else {
      csvStatus.textContent = `${validCount} of ${totalCount} rows valid` + (errors.length ? `, ${errors.length} skipped.` : '.');
    }
  };
  reader.onerror = () => {
    csvStatus.textContent = 'Could not read that file.';
  };
  reader.readAsText(file);
});

function collectManualRecipients() {
  return Array.from(rowsContainer.querySelectorAll('.manifest-row'))
    .map((row) => ({
      email: row.querySelector('.r-email').value.trim().toLowerCase(),
      name: row.querySelector('.r-name').value.trim(),
    }))
    .filter((r) => r.email.length > 0);
}

function allRecipients() {
  const manual = collectManualRecipients();
  const seen = new Set(manual.map((r) => r.email));
  const fromCsv = csvRecipients.filter((r) => !seen.has(r.email));
  return manual.concat(fromCsv);
}

async function sendOne(smtp, recipient, subjectTemplate, bodyTemplate) {
  const subject = renderTemplate(subjectTemplate, recipient);
  const text = renderTemplate(bodyTemplate, recipient);
  try {
    const res = await fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ smtp, to: recipient.email, subject, text }),
    });
    const data = await res.json();
    return { ...data, email: recipient.email, name: recipient.name || '', subject };
  } catch (err) {
    return { ok: false, error: 'Network error reaching /api/send', email: recipient.email, name: recipient.name || '', subject };
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.textContent = '';
  noteEl.textContent = '';

  const smtp = {
    host: document.getElementById('smtp_host').value.trim(),
    port: Number(document.getElementById('smtp_port').value),
    secure: Number(document.getElementById('smtp_port').value) === 465,
    user: document.getElementById('smtp_user').value.trim(),
    pass: document.getElementById('smtp_pass').value,
  };
  const subjectTemplate = document.getElementById('subject').value.trim();
  const bodyTemplate = document.getElementById('message_template').value;
  const recipients = allRecipients();

  if (!smtp.host || !smtp.user || !smtp.pass) {
    errorEl.textContent = 'Fill in SMTP host, your email address, and the app password.';
    return;
  }
  if (!bodyTemplate.trim()) {
    errorEl.textContent = 'Write a message before sending.';
    return;
  }
  if (recipients.length === 0) {
    errorEl.textContent = 'Add at least one recipient, by hand or via CSV.';
    return;
  }

  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending...';
  progressTrack.style.display = 'block';
  progressFill.style.width = '0%';
  statusList.innerHTML = '';

  const results = [];
  let stoppedEarly = false;

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    const result = await sendOne(smtp, recipient, subjectTemplate, bodyTemplate);
    results.push(result);

    const li = document.createElement('li');
    li.className = result.ok ? 'r-sent' : 'r-failed';
    li.textContent = `${recipient.email} — ${result.ok ? 'sent' : result.error || 'failed'}`;
    statusList.appendChild(li);

    progressFill.style.width = `${Math.round(((i + 1) / recipients.length) * 100)}%`;

    // If the very first send fails on what looks like an auth problem, stop
    // rather than repeating the same failure for every remaining recipient.
    if (i === 0 && !result.ok && /auth/i.test(result.error || '')) {
      stoppedEarly = true;
      errorEl.textContent = `Stopped after the first send failed: ${result.error}`;
      break;
    }
  }

  const sentRecords = results
    .filter((r) => r.ok)
    .map((r) => ({ email: r.email, name: r.name, subject: r.subject, sentAt: new Date().toISOString(), status: 'sent' }));
  const failedRecords = results
    .filter((r) => !r.ok)
    .map((r) => ({ email: r.email, name: r.name, subject: r.subject, sentAt: new Date().toISOString(), status: 'failed' }));

  appendHistory(window.localStorage, sentRecords.concat(failedRecords));
  renderHistory();

  if (!stoppedEarly) {
    const sentCount = sentRecords.length;
    const failedCount = failedRecords.length;
    noteEl.textContent = `Done: ${sentCount} sent, ${failedCount} failed.`;
  }

  document.getElementById('smtp_pass').value = '';
  sendBtn.disabled = false;
  sendBtn.textContent = 'Send';
});

function renderHistory() {
  const history = loadHistory(window.localStorage);
  historyList.innerHTML = '';
  if (history.length === 0) {
    historyEmpty.style.display = 'block';
    downloadBtn.style.display = 'none';
    return;
  }
  historyEmpty.style.display = 'none';
  downloadBtn.style.display = 'inline-block';
  history.slice().reverse().slice(0, 50).forEach((record) => {
    const row = document.createElement('div');
    row.className = 'history-row';
    row.innerHTML = `<span>${escapeHtml(record.email)}</span><span>${escapeHtml(record.status)}</span>`;
    historyList.appendChild(row);
  });
}

downloadBtn.addEventListener('click', () => {
  const csv = historyToCsv(loadHistory(window.localStorage));
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'send-history.csv';
  a.click();
  URL.revokeObjectURL(url);
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

renderHistory();
