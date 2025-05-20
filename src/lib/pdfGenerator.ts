
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import type { ColumnDefinition } from '@/types';

// Extend jsPDF type for autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

export const generatePdf = <T extends object>(
  title: string,
  columns: ColumnDefinition<T>[],
  data: T[],
  fileName: string = 'diet_insights_report.pdf'
) => {
  const doc = new jsPDF();

  doc.text(title, 14, 16);

  const tableColumnNames = columns.map(col => col.header);
  const tableRows = data.map(row =>
    columns.map(col => {
      if (col.cell) {
        const cellValue = col.cell(row);
        // Attempt to convert ReactNode to string. This works for simple text/numbers.
        return String(cellValue ?? '');
      }
      const rawValue = (row as any)[col.key as string];
      return String(rawValue ?? '');
    })
  );

  doc.autoTable({
    startY: 22,
    head: [tableColumnNames],
    body: tableRows,
    theme: 'striped',
    headStyles: { fillColor: [75, 85, 99] }, // Tailwind gray-600
    styles: { fontSize: 8 },
    columnStyles: {text: {cellWidth: 'auto'}}
  });

  doc.save(fileName);
};
