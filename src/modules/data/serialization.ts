import type { ProjectInput } from "../../domain/project";
import { validateExtensions } from "../../domain/execution";
import { scheduleProject } from "../schedule/engine/schedulingEngine";
export type TransferRow = {
  record_type: string;
  id: string;
  part: string;
  payload: string;
};
const headers = ["record_type", "id", "part", "payload"] as const;
export function validateProject(value: unknown): ProjectInput {
  const raw = value as {
    project?: ProjectInput;
    baseline?: ProjectInput["baselines"] extends (infer B)[] | undefined
      ? B
      : never;
  };
  const project = structuredClone(raw?.project ?? value) as ProjectInput;
  if (!project || typeof project.name !== "string" || !project.name.trim())
    throw new Error("Tên dự án không hợp lệ");
  if (raw.baseline && !project.baselines) {
    project.baselines = [raw.baseline];
    project.activeBaselineId = raw.baseline.id;
  }
  scheduleProject(project);
  validateExtensions(project);
  return project;
}
export function toRows(project: ProjectInput): TransferRow[] {
  const rows: TransferRow[] = [];
  const push = (type: string, id: string, value: unknown) => {
    const payload = JSON.stringify(value);
    for (let i = 0; i < payload.length; i += 16000)
      rows.push({
        record_type: type,
        id,
        part: String(i / 16000),
        payload: payload.slice(i, i + 16000),
      });
  };
  const {
    tasks,
    resources,
    dependencies,
    baselines,
    progressHistory,
    ...metadata
  } = project;
  push("project", project.id, metadata);
  tasks.forEach((t) => push("task", t.id, t));
  resources.forEach((r) => push("resource", r.id, r));
  dependencies.forEach((d) => push("dependency", d.id, d));
  baselines?.forEach((b) => push("baseline", b.id, b));
  progressHistory?.forEach((h) => push("progress", h.date, h));
  return rows;
}
export function fromRows(rows: TransferRow[]): ProjectInput {
  const groups = new Map<
    string,
    { type: string; parts: Map<number, string> }
  >();
  for (const row of rows) {
    if (
      ![
        "project",
        "task",
        "resource",
        "dependency",
        "baseline",
        "progress",
      ].includes(row.record_type)
    )
      throw new Error("Loại bản ghi không hợp lệ");
    const key = `${row.record_type}/${row.id}`;
    const group = groups.get(key) ?? {
      type: row.record_type,
      parts: new Map<number, string>(),
    };
    const part = Number(row.part);
    if (!Number.isSafeInteger(part) || part < 0 || group.parts.has(part))
      throw new Error("Trùng hoặc sai số thứ tự phần dữ liệu");
    group.parts.set(part, row.payload);
    groups.set(key, group);
  }
  const objects = new Map<string, unknown[]>();
  for (const group of groups.values()) {
    let json = "";
    for (let i = 0; i < group.parts.size; i++) {
      if (!group.parts.has(i)) throw new Error("Thiếu phần dữ liệu");
      json += group.parts.get(i);
    }
    const list = objects.get(group.type) ?? [];
    list.push(JSON.parse(json));
    objects.set(group.type, list);
  }
  if (objects.get("project")?.length !== 1)
    throw new Error("Tệp phải chứa đúng một dự án");
  return validateProject({
    ...(objects.get("project")![0] as object),
    tasks: objects.get("task") ?? [],
    resources: objects.get("resource") ?? [],
    dependencies: objects.get("dependency") ?? [],
    baselines: objects.get("baseline") ?? [],
    progressHistory: objects.get("progress") ?? [],
  });
}
export function encodeCsv(rows: TransferRow[]): string {
  return (
    "\uFEFF" +
    [
      headers.join(","),
      ...rows.map((r) =>
        headers
          .map(
            (h) =>
              '"' +
              (/^[=+\-@\t\r']/.test(r[h]) ? "'" + r[h] : r[h]).replaceAll(
                '"',
                '""',
              ) +
              '"',
          )
          .join(","),
      ),
    ].join("\r\n")
  );
}
export function decodeCsv(text: string): TransferRow[] {
  text = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [],
    row: string[] = [];
  let value = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (!quoted && value.length)
        throw new Error("CSV sai dấu ngoặc kép");
      else quoted = !quoted;
    } else if (!quoted && (c === "," || c === "\n" || c === "\r")) {
      row.push(value);
      value = "";
      if (c !== ",") {
        rows.push([...row]);
        row.length = 0;
        if (c === "\r" && text[i + 1] === "\n") i++;
      }
    } else value += c;
  }
  if (quoted) throw new Error("CSV chưa đóng chuỗi");
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  if (rows.shift()?.join(",") !== headers.join(","))
    throw new Error(
      "CSV phải theo mẫu ForgePlan (record_type,id,part,payload)",
    );
  return rows
    .filter((r) => r.some(Boolean))
    .map((r) => {
      if (r.length !== 4) throw new Error("CSV sai số cột");
      return Object.fromEntries(
        headers.map((h, i) => [h, r[i].startsWith("'") ? r[i].slice(1) : r[i]]),
      ) as TransferRow;
    });
}
export async function exportExcel(project: ProjectInput) {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  workbook.creator = "ForgePlan";
  const sheet = workbook.addWorksheet("Project Data");
  sheet.columns = headers.map((h) => ({
    header: h,
    key: h,
    width: h === "payload" ? 100 : 22,
  }));
  sheet.addRows(toRows(project));
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = "A1:D1";
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4F46E5" },
  };
  const wbs = workbook.addWorksheet("WBS Report");
  wbs.columns = [
    { header: "WBS", key: "wbs", width: 12 },
    { header: "Công việc", key: "name", width: 55 },
    { header: "Bắt đầu", key: "startDate", width: 15 },
    { header: "Kết thúc", key: "endDate", width: 15 },
    { header: "Duration", key: "duration", width: 12 },
    { header: "Physical %", key: "physicalPct", width: 12 },
    { header: "Predecessors", key: "predecessors", width: 30 },
  ];
  const tasks = scheduleProject(project).tasks;
  wbs.addRows(
    tasks.map((t) => ({
      ...t,
      predecessors: project.dependencies
        .filter((l) => l.successorId === t.id)
        .map(
          (l) =>
            `${tasks.find((p) => p.id === l.predecessorId)?.wbs}${l.type}${l.lagDays >= 0 ? "+" : ""}${l.lagDays}`,
        )
        .join(", "),
    })),
  );
  wbs.views = [{ state: "frozen", ySplit: 1 }];
  return new Blob([(await workbook.xlsx.writeBuffer()) as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
export async function importFile(file: File): Promise<ProjectInput> {
  if (file.size > 50 * 1024 * 1024) throw new Error("Tệp vượt giới hạn 50 MB");
  if (/\.json$/i.test(file.name))
    return validateProject(JSON.parse(await file.text()));
  if (/\.csv$/i.test(file.name)) return fromRows(decodeCsv(await file.text()));
  if (/\.xlsx$/i.test(file.name)) {
    const { Workbook } = await import("exceljs");
    const workbook = new Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const sheet = workbook.getWorksheet("Project Data");
    if (!sheet) throw new Error("Thiếu sheet Project Data");
    const rows: TransferRow[] = [];
    sheet.eachRow((row, n) => {
      const values = headers.map((_, i) => {
        const value = row.getCell(i + 1).value;
        if (
          value !== null &&
          typeof value !== "string" &&
          typeof value !== "number"
        )
          throw new Error("Không chấp nhận công thức trong dữ liệu nhập");
        return String(value ?? "");
      });
      if (n === 1) {
        if (values.join(",") !== headers.join(","))
          throw new Error("Sai tiêu đề dữ liệu");
      } else
        rows.push(
          Object.fromEntries(
            headers.map((h, i) => [h, values[i]]),
          ) as TransferRow,
        );
    });
    return fromRows(rows);
  }
  throw new Error("Chỉ hỗ trợ JSON, CSV và XLSX");
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
