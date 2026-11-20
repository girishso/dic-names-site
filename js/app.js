// Wires the page together: mic, row list, editing, Claude key and download.

import {
  createRow,
  applyCleanup,
  markCleanupFailed,
  applyEdit,
  settleInterruptedRows,
  warningsFor,
} from './rows.js';
import { cleanUpEntry, describeCleanupError } from './claude-cleanup.js';
import { downloadExcel } from './excel.js';
import { isSpeechSupported, listenOnce } from './speech.js';
import {
  loadRows,
  saveRows,
  loadApiKey,
  saveApiKey,
  removeApiKey,
  loadLanguage,
  saveLanguage,
} from './storage.js';

const KEY_TEST_HEARING = 'रमेश पाटील 9822012345';

const elements = {
  rowCount: document.getElementById('row-count'),
  languageButtons: Array.from(document.querySelectorAll('.language-switch button')),
  micButton: document.getElementById('mic-button'),
  micLabel: document.getElementById('mic-label'),
  status: document.getElementById('status'),
  rows: document.getElementById('rows'),
  emptyHint: document.getElementById('empty-hint'),
  downloadButton: document.getElementById('download-button'),
  clearButton: document.getElementById('clear-button'),
  typedEntryForm: document.getElementById('typed-entry-form'),
  typedEntryInput: document.getElementById('typed-entry-input'),
  keyState: document.getElementById('key-state'),
  keyForm: document.getElementById('key-form'),
  keyInput: document.getElementById('key-input'),
  keyStatus: document.getElementById('key-status'),
  testKeyButton: document.getElementById('test-key-button'),
  removeKeyButton: document.getElementById('remove-key-button'),
};

// Rows are kept oldest first; the list shows them newest first.
let rows = settleInterruptedRows(loadRows());
let language = loadLanguage();
let activeListening = null;
let editingRowId = null;

function setStatus(message) {
  elements.status.textContent = message;
}

function persistRows() {
  if (!saveRows(rows)) {
    setStatus('Could not save on this phone. Download the Excel file now.');
  }
}

function newRowId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function replaceRow(updatedRow) {
  rows = rows.map((row) => (row.id === updatedRow.id ? updatedRow : row));
}

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function joinNames(firstName, lastName) {
  return [firstName, lastName].filter(Boolean).join(' ');
}

// ---------- Row list ----------

function renderRowSummary(row, serialNumber, warnings) {
  const summary = createElement('button', 'row-summary');
  summary.type = 'button';
  summary.setAttribute('aria-label', `Edit row ${serialNumber}`);

  const englishName = joinNames(row.firstNameEnglish, row.lastNameEnglish);
  const marathiName = joinNames(row.firstNameMarathi, row.lastNameMarathi);

  summary.append(
    createElement('span', 'row-number', String(serialNumber)),
    createElement('span', 'row-name', englishName || marathiName || '(no name)'),
  );

  const details = createElement('span', 'row-details');
  if (englishName && marathiName) details.append(`${marathiName}  `);
  details.append(createElement('span', 'row-phone', row.phone || '(no number)'));
  summary.append(details);

  if (row.cleanupState === 'pending') {
    summary.append(createElement('span', 'row-details', 'Cleaning up…'));
  }
  if (warnings.length > 0) {
    summary.append(createElement('span', 'row-warnings', `⚠ ${warnings.join(' · ')}`));
  }

  summary.addEventListener('click', () => {
    editingRowId = row.id;
    renderRows();
  });
  return summary;
}

function labelledInput({ labelText, name, value, type = 'text', fullWidth = false }) {
  const wrapper = createElement('div', fullWidth ? 'full-width' : '');
  const input = document.createElement('input');
  input.type = type;
  input.name = name;
  input.value = value;
  input.autocomplete = 'off';
  input.id = `edit-${name}`;
  if (type === 'tel') input.inputMode = 'numeric';
  const label = createElement('label', '', labelText);
  label.htmlFor = input.id;
  wrapper.append(label, input);
  return wrapper;
}

function renderRowForm(row, serialNumber) {
  const form = createElement('form', 'row-form');
  form.setAttribute('aria-label', `Edit row ${serialNumber}`);

  form.append(
    labelledInput({ labelText: 'First name (English)', name: 'firstNameEnglish', value: row.firstNameEnglish }),
    labelledInput({ labelText: 'Last name (English)', name: 'lastNameEnglish', value: row.lastNameEnglish }),
    labelledInput({ labelText: 'First name (Marathi)', name: 'firstNameMarathi', value: row.firstNameMarathi }),
    labelledInput({ labelText: 'Last name (Marathi)', name: 'lastNameMarathi', value: row.lastNameMarathi }),
    labelledInput({ labelText: 'Phone number', name: 'phone', value: row.phone, type: 'tel', fullWidth: true }),
  );

  const heardText = createElement('p', 'heard-text full-width', `Heard: ${row.heardText}`);

  const actions = createElement('div', 'form-actions full-width');
  const saveButton = createElement('button', 'primary-button', 'Save');
  saveButton.type = 'submit';
  const cancelButton = createElement('button', 'quiet-button', 'Cancel');
  cancelButton.type = 'button';
  const deleteButton = createElement('button', 'danger-button', 'Delete row');
  deleteButton.type = 'button';
  actions.append(saveButton, cancelButton, deleteButton);
  form.append(heardText, actions);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    replaceRow(applyEdit(row, Object.fromEntries(formData.entries())));
    editingRowId = null;
    persistRows();
    renderRows();
  });
  cancelButton.addEventListener('click', () => {
    editingRowId = null;
    renderRows();
  });
  deleteButton.addEventListener('click', () => {
    rows = rows.filter((otherRow) => otherRow.id !== row.id);
    editingRowId = null;
    persistRows();
    renderRows();
    setStatus(`Row ${serialNumber} deleted.`);
  });
  return form;
}

function renderRows() {
  const listItems = rows.map((row, index) => {
    const serialNumber = index + 1;
    const warnings = warningsFor(row, rows);
    const listItem = createElement('li', warnings.length > 0 ? 'row needs-checking' : 'row');
    listItem.append(
      row.id === editingRowId
        ? renderRowForm(row, serialNumber)
        : renderRowSummary(row, serialNumber, warnings),
    );
    return listItem;
  });
  elements.rows.replaceChildren(...listItems.reverse());

  const rowsNeedingChecking = rows.filter((row) => warningsFor(row, rows).length > 0).length;
  const rowWord = rows.length === 1 ? 'row' : 'rows';
  elements.rowCount.textContent =
    rowsNeedingChecking > 0
      ? `${rows.length} ${rowWord}, ${rowsNeedingChecking} to check`
      : `${rows.length} ${rowWord}`;
  elements.emptyHint.hidden = rows.length > 0;
}

// ---------- Adding entries ----------

async function addEntry(alternatives) {
  const pendingRow = createRow({ id: newRowId(), heardText: alternatives[0] });
  rows = [...rows, pendingRow];
  persistRows();
  renderRows();
  setStatus(`Heard: ${alternatives[0]}`);

  const apiKey = loadApiKey();
  let finishedRow;
  let failureMessage = '';
  if (!apiKey) {
    finishedRow = markCleanupFailed(pendingRow);
    failureMessage = 'No Claude key saved, so this row was not cleaned up.';
  } else {
    try {
      finishedRow = applyCleanup(pendingRow, await cleanUpEntry({ apiKey, alternatives }));
    } catch (error) {
      finishedRow = markCleanupFailed(pendingRow);
      failureMessage = `${describeCleanupError(error)}. The row was kept as heard.`;
    }
  }

  // The doctor may have edited or deleted the row while Claude was working.
  const currentRow = rows.find((row) => row.id === pendingRow.id);
  if (!currentRow || currentRow.cleanupState !== 'pending') return;

  replaceRow(finishedRow);
  persistRows();
  renderRows();
  if (failureMessage) setStatus(failureMessage);
}

function setListeningAppearance(isListening) {
  elements.micButton.setAttribute('aria-pressed', String(isListening));
  elements.micLabel.textContent = isListening
    ? 'Listening… tap to stop'
    : 'Tap and say name, then number';
}

async function toggleListening() {
  if (activeListening) {
    activeListening.stop();
    return;
  }
  try {
    activeListening = listenOnce({
      language,
      onInterimText: (interimText) => setStatus(`Hearing: ${interimText}`),
    });
    setListeningAppearance(true);
    setStatus('Listening…');
    const alternatives = await activeListening.finished;
    if (alternatives.length === 0) {
      setStatus(
        language === 'mr-IN'
          ? 'Nothing was heard in Marathi. Tap and try again. If this keeps happening, this phone may not support Marathi speech: switch to English.'
          : 'Nothing was heard in English. Tap and try again, speaking close to the phone.',
      );
    } else {
      addEntry(alternatives);
    }
  } catch (error) {
    setStatus(error.message);
  } finally {
    activeListening = null;
    setListeningAppearance(false);
  }
}

// ---------- Language ----------

function renderLanguage() {
  for (const button of elements.languageButtons) {
    button.setAttribute('aria-checked', String(button.dataset.language === language));
  }
}

// ---------- Claude key ----------

function renderKeyState() {
  const apiKey = loadApiKey();
  elements.keyState.textContent = apiKey
    ? `A key is saved on this phone (ending ${apiKey.slice(-4)}).`
    : 'No key saved yet. Entries will not be cleaned up until one is saved.';
  elements.testKeyButton.disabled = !apiKey;
  elements.removeKeyButton.disabled = !apiKey;
}

async function testSavedKey() {
  elements.keyStatus.textContent = 'Testing…';
  try {
    const cleaned = await cleanUpEntry({ apiKey: loadApiKey(), alternatives: [KEY_TEST_HEARING] });
    const cleanedName = joinNames(cleaned.firstNameEnglish, cleaned.lastNameEnglish);
    elements.keyStatus.textContent = `Key works. Sample came back as: ${cleanedName}, ${cleaned.phone}`;
  } catch (error) {
    elements.keyStatus.textContent = describeCleanupError(error);
  }
}

// ---------- Wiring ----------

elements.micButton.addEventListener('click', toggleListening);

for (const button of elements.languageButtons) {
  button.addEventListener('click', () => {
    language = button.dataset.language;
    saveLanguage(language);
    renderLanguage();
  });
}

elements.typedEntryForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const typedText = elements.typedEntryInput.value.trim();
  if (!typedText) return;
  elements.typedEntryInput.value = '';
  addEntry([typedText]);
});

elements.downloadButton.addEventListener('click', () => {
  if (rows.length === 0) {
    setStatus('There are no rows to download yet.');
    return;
  }
  downloadExcel(rows);
  setStatus(`Excel file with ${rows.length} ${rows.length === 1 ? 'row' : 'rows'} downloaded.`);
});

elements.clearButton.addEventListener('click', () => {
  if (rows.length === 0) return;
  const confirmed = window.confirm(
    `Delete all ${rows.length} rows from this phone? Download the Excel file first if you need them.`,
  );
  if (!confirmed) return;
  rows = [];
  editingRowId = null;
  persistRows();
  renderRows();
  setStatus('List cleared.');
});

elements.keyForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const pastedKey = elements.keyInput.value.trim();
  if (!pastedKey) return;
  const wasSaved = saveApiKey(pastedKey);
  elements.keyInput.value = '';
  elements.keyStatus.textContent = wasSaved
    ? 'Key saved. Tap "Test key" to check it.'
    : 'This browser refused to save the key.';
  renderKeyState();
});

elements.testKeyButton.addEventListener('click', testSavedKey);

elements.removeKeyButton.addEventListener('click', () => {
  removeApiKey();
  elements.keyStatus.textContent = 'Key removed from this phone.';
  renderKeyState();
});

if (!isSpeechSupported()) {
  elements.micButton.disabled = true;
  setStatus('This browser has no speech recognition. Use Chrome on Android, or type entries below.');
}

persistRows();
renderLanguage();
renderKeyState();
renderRows();
