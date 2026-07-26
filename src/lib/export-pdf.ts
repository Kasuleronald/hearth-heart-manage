import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import html2canvas from "html2canvas";
import { listSettingsFn } from "@/server/settings";

function logoImageFormat(dataUrl: string): "PNG" | "JPEG" | undefined {
  if (dataUrl.startsWith("data:image/png")) return "PNG";
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) return "JPEG";
  return undefined;
}

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
  const leftMargin = 14;

  // Best-effort — a report should still export even if branding can't be
  // fetched for some reason.
  let churchName = "My Church";
  let logoDataUrl: string | undefined;
  try {
    const settings = await listSettingsFn();
    churchName = settings.churchName || churchName;
    logoDataUrl = settings.churchLogo || undefined;
  } catch {
    // fall back to the defaults above
  }

  let textX = leftMargin;
  const logoFormat = logoDataUrl ? logoImageFormat(logoDataUrl) : undefined;
  if (logoDataUrl && logoFormat) {
    try {
      const logoSize = 12;
      doc.addImage(logoDataUrl, logoFormat, leftMargin, 6, logoSize, logoSize);
      textX = leftMargin + logoSize + 4;
    } catch {
      // skip the logo if it can't be embedded (corrupt/unsupported data)
    }
  }
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(churchName, textX, 14);
  doc.setFont("helvetica", "normal");

  doc.setFontSize(16);
  doc.text(title, leftMargin, 26);
  let cursorY = 32;
  if (subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(subtitle, leftMargin, 32);
    doc.setTextColor(0);
    cursorY = 38;
  }

  if (chartElement) {
    try {
      const canvas = await html2canvas(chartElement, { backgroundColor: "#ffffff", scale: 2 });
      const imgWidth = pageWidth - 28;
      const imgHeight = (canvas.height / canvas.width) * imgWidth;
      doc.addImage(canvas.toDataURL("image/png"), "PNG", leftMargin, cursorY, imgWidth, imgHeight);
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
