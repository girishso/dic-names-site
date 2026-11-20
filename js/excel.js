// Builds the Excel file in the browser and hands it to the phone as a download.

import { utils, writeFile } from '../vendor/xlsx.js?v=ccdeced';
import { toSheetData } from './rows.js?v=ccdeced';

const COLUMN_WIDTHS_IN_CHARACTERS = [8, 22, 20, 22, 20, 14, 44];

function todayAsIsoDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function downloadExcel(rows) {
  // Every cell is a string, so phone numbers are stored as text.
  const sheet = utils.aoa_to_sheet(toSheetData(rows));
  sheet['!cols'] = COLUMN_WIDTHS_IN_CHARACTERS.map((width) => ({ wch: width }));
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, sheet, 'Patients');
  writeFile(workbook, `patients-${todayAsIsoDate()}.xlsx`);
}
