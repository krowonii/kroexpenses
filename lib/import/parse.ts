import * as XLSX from "xlsx";
import type { ParsedFile } from "./types";

/**
 * Parse an uploaded statement (CSV or XLSX) into a grid of cell strings.
 * Server-side only — parsing is part of the import pipeline, never the
 * browser. XLSX sheets are concatenated in workbook order.
 */
export async function parseStatement(
  fileName: string,
  data: ArrayBuffer
): Promise<ParsedFile> {
  const kind = fileName.toLowerCase().endsWith(".xlsx") ? "xlsx" : "csv";

  if (kind === "xlsx") {
    const wb = XLSX.read(new Uint8Array(data), { type: "array" });
    const sheets: string[] = [];
    const rows: string[][] = [];
    for (const name of wb.SheetNames) {
      sheets.push(name);
      rows.push(...gridOf(wb.Sheets[name]));
    }
    return { fileName, kind, sheets, rows };
  }

  // CSV: TextDecoder strips a UTF-8 BOM; SheetJS handles quoting/delimiters.
  const text = new TextDecoder("utf-8").decode(data);
  const wb = XLSX.read(text, { type: "string", raw: false });
  const first = wb.SheetNames[0] ?? "csv";
  return { fileName, kind, sheets: [first], rows: gridOf(wb.Sheets[first]) };
}

function gridOf(sheet: XLSX.WorkSheet): string[][] {
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });
  return grid.map((row) => (row ?? []).map((cell) => String(cell ?? "").trim()));
}
