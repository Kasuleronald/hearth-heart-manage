import * as XLSX from "xlsx";

export interface MemberImportColumn {
  key: string;
  header: string;
  required?: boolean;
  hint?: string;
}

// The template's column order/labels — kept in one place so the download
// (build the workbook) and the upload (map headers back to field keys) can
// never drift apart. Cell/Class labels are passed in since both are
// renameable per-org terms (see src/lib/terminology.ts).
export function getMemberImportColumns(
  cellLabel: string,
  classLabel: string,
): MemberImportColumn[] {
  return [
    { key: "firstName", header: "First Name", required: true },
    { key: "lastName", header: "Last Name", required: true },
    { key: "address", header: "Address", required: true },
    { key: "phone", header: "Phone" },
    { key: "email", header: "Email" },
    { key: "gender", header: "Gender", hint: "Male, Female, or Other" },
    { key: "birthMonth", header: "Birth Month", hint: "1-12" },
    { key: "birthDay", header: "Birth Day", hint: "1-31" },
    { key: "birthYear", header: "Birth Year", hint: "e.g. 1990" },
    { key: "status", header: "Status" },
    { key: "category", header: "Category" },
    { key: "joinDate", header: "Join Date", hint: "YYYY-MM-DD" },
    {
      key: "household",
      header: "Household",
      hint: "Exact existing household name — or leave blank",
    },
    {
      key: "cell",
      header: cellLabel,
      hint: `Exact existing ${cellLabel.toLowerCase()} name — or leave blank`,
    },
    {
      key: "class",
      header: classLabel,
      hint: `Exact existing ${classLabel.toLowerCase()} name — or leave blank`,
    },
    { key: "branch", header: "Branch", hint: "Exact existing branch name — or leave blank" },
    { key: "notes", header: "Notes" },
    { key: "number", header: "Number", hint: "Leave blank to add as unnumbered" },
  ];
}

function columnLabel(c: MemberImportColumn) {
  return c.required ? `${c.header} *` : c.header;
}

function normalizeHeader(h: string) {
  return h.replace(/\*/g, "").trim().toLowerCase();
}

export function downloadMemberImportTemplate(
  cellLabel: string,
  classLabel: string,
  statusOptions: string[],
  categoryOptions: string[],
) {
  const columns = getMemberImportColumns(cellLabel, classLabel);
  const headers = columns.map(columnLabel);
  const example = [
    "Jane",
    "Doe",
    "123 Main St, Kampala",
    "+256700000000",
    "jane@example.com",
    "Female",
    "5",
    "14",
    "1990",
    statusOptions[0] ?? "",
    categoryOptions[0] ?? "",
    "2024-01-15",
    "",
    "",
    "",
    "",
    "First-time visitor at Easter service",
    "",
  ];

  const sheet = XLSX.utils.aoa_to_sheet([headers, example]);
  sheet["!cols"] = headers.map(() => ({ wch: 24 }));

  const instructionRows: string[][] = [
    ["Field", "Notes"],
    ...columns.map((c) => [columnLabel(c), c.hint ?? ""]),
    ["", ""],
    ["Status options", statusOptions.join(", ")],
    ["Category options", categoryOptions.join(", ")],
    ["", ""],
    ["Fields marked * are required — every other column can be left blank."],
  ];
  const instructions = XLSX.utils.aoa_to_sheet(instructionRows);
  instructions["!cols"] = [{ wch: 22 }, { wch: 60 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Members");
  XLSX.utils.book_append_sheet(workbook, instructions, "Instructions");
  XLSX.writeFile(workbook, "member-import-template.xlsx");
}

// Reads the uploaded workbook's "Members" sheet (or its first sheet, in case
// someone renames it) and maps each row's headers back to the canonical
// field keys — tolerant of the "*" required-marker and of stray whitespace,
// since these are hand-typed spreadsheets, not machine-generated ones.
export async function parseMemberImportFile(
  file: File,
  cellLabel: string,
  classLabel: string,
): Promise<Record<string, string>[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName =
    workbook.SheetNames.find((n) => n.toLowerCase() === "members") ?? workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];

  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  const columns = getMemberImportColumns(cellLabel, classLabel);
  const headerToKey = new Map(columns.map((c) => [normalizeHeader(c.header), c.key]));

  return raw
    .map((rowObj) => {
      const row: Record<string, string> = {};
      for (const [header, value] of Object.entries(rowObj)) {
        const key = headerToKey.get(normalizeHeader(header));
        if (key) row[key] = String(value ?? "").trim();
      }
      return row;
    })
    .filter((row) => Object.values(row).some((v) => v !== ""));
}
