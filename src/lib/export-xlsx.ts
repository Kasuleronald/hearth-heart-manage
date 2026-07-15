import * as XLSX from "xlsx";

export function downloadXlsx(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: string[][],
) {
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, filename);
}
