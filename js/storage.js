// Everything the page remembers lives in this browser's local storage.
// Reads and writes are guarded: a private window can refuse storage.

const ROWS_KEY = 'dictateNames.rows';
const API_KEY_KEY = 'dictateNames.claudeApiKey';
const LANGUAGE_KEY = 'dictateNames.language';

function read(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

// Returns false when the browser refused to store the value.
function write(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function remove(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to remove if storage is unavailable.
  }
}

export function loadRows() {
  try {
    const rows = JSON.parse(read(ROWS_KEY) ?? '[]');
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export function saveRows(rows) {
  return write(ROWS_KEY, JSON.stringify(rows));
}

export function loadApiKey() {
  return read(API_KEY_KEY) ?? '';
}

export function saveApiKey(apiKey) {
  return write(API_KEY_KEY, apiKey);
}

export function removeApiKey() {
  remove(API_KEY_KEY);
}

export function loadLanguage() {
  return read(LANGUAGE_KEY) === 'en-IN' ? 'en-IN' : 'mr-IN';
}

export function saveLanguage(language) {
  write(LANGUAGE_KEY, language);
}
