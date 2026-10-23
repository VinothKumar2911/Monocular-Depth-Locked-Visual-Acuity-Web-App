/**
 * csvExport.ts
 * -----------------------------------------------------------------------
 * Generic CSV/JSON export + browser download helpers.
 */

export function toCSV<T extends object>(
  rows: T[],
  columns?: (keyof T)[],
  metadata?: Record<string, string | number | boolean>
): string {
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
  const csvBody = [header, ...lines].join("\n");
  if (metadata && Object.keys(metadata).length > 0) {
    const metaLines = Object.entries(metadata)
      .map(([k, v]) => `# ${k}: ${v}`)
      .join("\n");
    return `${metaLines}\n${csvBody}`;
  }
  return csvBody;
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

export function downloadCSV<T extends object>(
  filename: string,
  rows: T[],
  columns?: (keyof T)[],
  metadata?: Record<string, string | number | boolean>
): void {
  downloadText(filename, toCSV(rows, columns, metadata), "text/csv;charset=utf-8;");
}

export function downloadJSON(
  filename: string,
  data: unknown,
  metadata?: Record<string, string | number | boolean>
): void {
  const payload = metadata
    ? {
        metadata: {
          exportTimestamp: new Date().toISOString(),
          ...metadata,
        },
        data,
      }
    : data;
  downloadText(filename, JSON.stringify(payload, null, 2), "application/json;charset=utf-8;");
}

