// A row is one patient: four name fields, a phone number, and how it got there.
// Warnings are always computed from the row, never stored.

import { toAsciiDigits, normalizePhone, isValidIndianMobile } from './phone.js?v=ccdeced';

const NAME_FIELDS = ['firstNameEnglish', 'lastNameEnglish', 'firstNameMarathi', 'lastNameMarathi'];

export const SHEET_HEADER = [
  'Sr. No.',
  'First name (English)',
  'Last name (English)',
  'First name (Marathi)',
  'Last name (Marathi)',
  'Phone number',
  'Needs checking',
];

function splitFirstAndLast(fullName) {
  const words = fullName.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { first: words.join(''), last: '' };
  return { first: words.slice(0, -1).join(' '), last: words[words.length - 1] };
}

function cleanText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

// A rough reading of heard text without Claude: digits are the number,
// everything else is the name. Used immediately, and kept if Claude fails.
export function readLocally(heardText) {
  const text = toAsciiDigits(heardText ?? '');
  const phone = normalizePhone(text);
  const nameText = text.replace(/[\d+\-.,;:()]/g, ' ');
  const { first, last } = splitFirstAndLast(nameText);
  const isDevanagari = /[ऀ-ॿ]/.test(nameText);
  return {
    firstNameEnglish: isDevanagari ? '' : first,
    lastNameEnglish: isDevanagari ? '' : last,
    firstNameMarathi: isDevanagari ? first : '',
    lastNameMarathi: isDevanagari ? last : '',
    phone,
  };
}

export function createRow({ id, heardText }) {
  return {
    id,
    heardText,
    ...readLocally(heardText),
    cleanupState: 'pending',
    doubtReason: '',
  };
}

function withNameAndPhone(row, nameAndPhone) {
  const updated = { ...row };
  for (const field of NAME_FIELDS) updated[field] = cleanText(nameAndPhone[field]);
  updated.phone = normalizePhone(nameAndPhone.phone);
  return updated;
}

export function applyCleanup(row, cleaned) {
  return {
    ...withNameAndPhone(row, cleaned),
    cleanupState: 'done',
    doubtReason: cleanText(cleaned.doubtReason),
  };
}

export function markCleanupFailed(row) {
  return { ...row, cleanupState: 'failed' };
}

// The doctor has checked this row by hand, so doubts about how it was heard
// no longer apply. Number, name and duplicate checks still do.
export function applyEdit(row, nameAndPhone) {
  return { ...withNameAndPhone(row, nameAndPhone), cleanupState: 'done', doubtReason: '' };
}

// After a reload, a row that was still waiting for Claude will never hear back.
export function settleInterruptedRows(rows) {
  return rows.map((row) => (row.cleanupState === 'pending' ? markCleanupFailed(row) : row));
}

export function warningsFor(row, allRows) {
  const warnings = [];
  if (!isValidIndianMobile(row.phone)) warnings.push('Number is not a 10-digit mobile number');
  if (NAME_FIELDS.every((field) => !row[field])) warnings.push('Name is missing');
  if (row.cleanupState === 'failed') warnings.push('Not cleaned up by Claude: check name and number');
  if (row.doubtReason) warnings.push(row.doubtReason);
  if (row.phone) {
    allRows.forEach((otherRow, index) => {
      if (otherRow.id !== row.id && otherRow.phone === row.phone) {
        warnings.push(`Same number as row ${index + 1}`);
      }
    });
  }
  return warnings;
}

// Rows for the Excel sheet. Every cell is a string so phone numbers stay text.
export function toSheetData(rows) {
  const dataRows = rows.map((row, index) => [
    String(index + 1),
    row.firstNameEnglish,
    row.lastNameEnglish,
    row.firstNameMarathi,
    row.lastNameMarathi,
    row.phone,
    warningsFor(row, rows).join('; '),
  ]);
  return [SHEET_HEADER, ...dataRows];
}
