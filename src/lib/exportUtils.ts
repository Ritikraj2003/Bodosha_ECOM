/**
 * Export utilities for Admin tables (Payments, Audit Logs, etc.)
 * Supports CSV, Excel (.xlsx SpreadsheetML format), and PDF.
 */

export interface ExportColumn {
  header: string;
  key: string;
}

function sanitizeCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val);
}

function escapeCSV(val: unknown): string {
  const str = sanitizeCell(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export data to CSV file
 */
export function exportToCSV(
  filename: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
) {
  const csvLines: string[] = [];
  csvLines.push(headers.map(escapeCSV).join(','));

  for (const row of rows) {
    csvLines.push(row.map(escapeCSV).join(','));
  }

  const csvContent = '\uFEFF' + csvLines.join('\n'); // UTF-8 BOM for Excel compatibility
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const finalFilename = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  triggerDownload(blob, finalFilename);
}

/**
 * Export data to Excel (.xlsx / SpreadsheetML XML) format
 */
export function exportToExcel(
  filename: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
) {
  const escapeXML = (str: unknown) =>
    sanitizeCell(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

  const headerCells = headers
    .map((h) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXML(h)}</Data></Cell>`)
    .join('');

  const rowXML = rows
    .map((row) => {
      const cells = row
        .map((val) => {
          const isNum = typeof val === 'number' && !isNaN(val);
          const type = isNum ? 'Number' : 'String';
          return `<Cell><Data ss:Type="${type}">${escapeXML(val)}</Data></Cell>`;
        })
        .join('');
      return `<Row>${cells}</Row>`;
    })
    .join('');

  const excelXML = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Header">
   <Font ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#EF4444" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Export">
  <Table>
   <Row ss:StyleID="Header">
    ${headerCells}
   </Row>
   ${rowXML}
  </Table>
 </Worksheet>
</Workbook>`;

  const blob = new Blob([excelXML], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const finalFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  triggerDownload(blob, finalFilename);
}

/**
 * Export data to PDF format via styled print window / document
 */
export function exportToPDF(
  title: string,
  filename: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const headerHTML = headers
    .map((h) => `<th style="border: 1px solid #ddd; padding: 8px; background-color: #ef4444; color: white; font-size: 11px; text-align: left;">${h}</th>`)
    .join('');

  const rowsHTML = rows
    .map(
      (r, idx) => `
    <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f9fafb'};">
      ${r
        .map(
          (val) => `<td style="border: 1px solid #ddd; padding: 6px 8px; font-size: 10px; color: #1c1c1c;">${sanitizeCell(val)}</td>`
        )
        .join('')}
    </tr>
  `
    )
    .join('');

  const dateStr = new Date().toLocaleString();

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title} - ${filename}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 20px; color: #111; }
          h1 { font-size: 18px; margin-bottom: 4px; color: #111; }
          p { font-size: 11px; color: #666; margin-top: 0; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          @media print {
            body { margin: 10mm; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #ef4444; padding-bottom: 8px; margin-bottom: 12px;">
          <div>
            <h1>Dilip Da Admin Report: ${title}</h1>
            <p>Generated on ${dateStr} • Total Records: ${rows.length}</p>
          </div>
          <button onclick="window.print();" style="background: #ef4444; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer;">
            Print / Save as PDF
          </button>
        </div>
        <table>
          <thead>
            <tr>${headerHTML}</tr>
          </thead>
          <tbody>
            ${rowsHTML}
          </tbody>
        </table>
        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 400);
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}
