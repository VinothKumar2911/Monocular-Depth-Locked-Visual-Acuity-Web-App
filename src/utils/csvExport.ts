/**
 * csvExport.ts
 * -----------------------------------------------------------------------
 * Generic CSV/JSON export + browser download helpers.
 */

export function toCSV<T extends object>(rows: T[], columns?: (keyof T)[]): string {
  if (rows.length === 0) return "";
  const cols = columns ?? (Object.keys(rows[0]) as (keyof T)[]);
  const header = cols.join(",");
  const escapeCell = (val: unknown): string => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const lines = rows.map((row) => cols.map((c) => escapeCell(row[c])).join(","));
  return [header, ...lines].join("\n");
}

export function downloadText(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadCSV<T extends object>(filename: string, rows: T[], columns?: (keyof T)[]): void {
  downloadText(filename, toCSV(rows, columns), "text/csv;charset=utf-8;");
}

export function downloadJSON(filename: string, data: unknown): void {
  downloadText(filename, JSON.stringify(data, null, 2), "application/json;charset=utf-8;");
}
