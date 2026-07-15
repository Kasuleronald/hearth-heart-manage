import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import html2canvas from "html2canvas";

export async function downloadPdf(options: {
  filename: string;
  title: string;
  subtitle?: string;
  chartElement?: HTMLElement | null;
  headers: string[];
  rows: string[][];
}) {
  const { filename, title, subtitle, chartElement, headers, rows } = options;
  const doc = new jsPDF({ orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(16);
  doc.text(title, 14, 16);
  if (subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(subtitle, 14, 22);
    doc.setTextColor(0);
  }

  let cursorY = 28;

  if (chartElement) {
    try {
      const canvas = await html2canvas(chartElement, { backgroundColor: "#ffffff", scale: 2 });
      const imgWidth = pageWidth - 28;
      const imgHeight = (canvas.height / canvas.width) * imgWidth;
      doc.addImage(canvas.toDataURL("image/png"), "PNG", 14, cursorY, imgWidth, imgHeight);
      cursorY += imgHeight + 8;
    } catch {
      // If the chart can't be captured (e.g. no data rendered), just skip straight to the table.
    }
  }

  autoTable(doc, {
    startY: cursorY,
    head: [headers],
    body: rows,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [79, 70, 229] },
  });

  doc.save(filename);
}
