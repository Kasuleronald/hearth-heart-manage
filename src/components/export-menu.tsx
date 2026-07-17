import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { downloadCsv } from "@/lib/download";
import { downloadXlsx } from "@/lib/export-xlsx";
import { downloadPdf } from "@/lib/export-pdf";

// filename should be extension-less (e.g. "members") — each format appends its own.
export function ExportMenu({
  filename,
  title,
  subtitle,
  chartElement,
  headers,
  rows,
}: {
  filename: string;
  title: string;
  subtitle?: string;
  chartElement?: HTMLElement | null;
  headers: string[];
  rows: string[][];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" /> Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => downloadCsv(`${filename}.csv`, [headers, ...rows])}>
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => downloadXlsx(`${filename}.xlsx`, title, headers, rows)}>
          Export as Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            downloadPdf({
              filename: `${filename}.pdf`,
              title,
              subtitle,
              chartElement,
              headers,
              rows,
            })
          }
        >
          Export as PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
