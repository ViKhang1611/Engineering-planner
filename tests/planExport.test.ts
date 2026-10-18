import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import ExcelJS from "exceljs";
const { Workbook } = ExcelJS;
import {
  createSeed,
  createLargeProject,
} from "../src/modules/schedule/data/seed";
import { scheduleProject } from "../src/modules/schedule/engine/schedulingEngine";
import { themes, findTheme, themeVariables } from "../src/theme/themes";
import { exportPlanExcel } from "../src/modules/plan-export/excel";
import { exportPlanPdf } from "../src/modules/plan-export/pdf";
import {
  timelineColumns,
  planRange,
  timePosition,
  type ExportJob,
} from "../src/modules/plan-export/model";
function job(): ExportJob {
  const project = createSeed(),
    result = scheduleProject(project);
  return {
    snapshot: {
      project,
      result,
      theme: themes[0],
      baseline: {
        id: "b0",
        name: "Baseline 0",
        createdAt: "2026-10-01",
        tasks: result.tasks.map((t) => ({ ...t })),
      },
      exportedAt: "2026-10-18T06:00:00Z",
    },
    options: { format: "xlsx", paper: "a4", scale: "day" },
  };
}
describe("plan exports and theme presets", () => {
  it("paginates both long timelines and task rows without clipping the schedule to a viewport", async () => {
    const j = job();
    j.snapshot.project.tasks = Array.from({ length: 40 }, (_, i) => ({
      id: `t${i}`,
      parentId: null,
      name: `Công việc kỹ thuật ${i}`,
      duration: 3,
      physicalPct: i,
      assignments: [],
    }));
    j.snapshot.project.dependencies = j.snapshot.project.tasks
      .slice(1)
      .map((t, i) => ({
        id: `d${i}`,
        predecessorId: `t${i}`,
        successorId: t.id,
        type: "FS" as const,
        lagDays: 0,
      }));
    j.snapshot.result = scheduleProject(j.snapshot.project);
    j.snapshot.baseline = null;
    j.options.format = "pdf";
    const fonts = {
      regular: new Uint8Array(await readFile("public/fonts/DejaVuSans.ttf")),
      bold: new Uint8Array(await readFile("public/fonts/DejaVuSans-Bold.ttf")),
    };
    const document = await PDFDocument.load(
      await exportPlanPdf(j, () => {}, fonts),
    );
    expect(document.getPageCount()).toBeGreaterThan(8);
    expect(document.getPages().every((p) => p.getWidth() > p.getHeight())).toBe(
      true,
    );
  }, 30000);

  it("provides safe theme lookup and complete semantic colors for all presets", () => {
    expect(findTheme("invalid").id).toBe("slate");
    for (const theme of themes) {
      const vars = themeVariables(theme);
      for (const key of [
        "--surface-base",
        "--planner-task",
        "--planner-critical",
        "--planner-summary",
        "--planner-baseline",
        "--planner-duration",
        "--color-slate-900",
      ])
        expect(vars[key]).toMatch(/^#[\da-f]{6}$/i);
    }
    expect(themeVariables(themes[2])["--surface-canvas"]).toBe("#0f172a");
  });
  it("includes baseline range and month-end timeline without dropped days", () => {
    expect(
      timelineColumns("2026-01-30", "2026-03-01", "month").map((c) => [
        c.start,
        c.end,
      ]),
    ).toEqual([
      ["2026-01-30", "2026-01-31"],
      ["2026-02-01", "2026-02-28"],
      ["2026-03-01", "2026-03-01"],
    ]);
    expect(timePosition("2026-10-05T17:00:00+07:00", "2026-10-05")).toBe(1);
    const j = job();
    expect(planRange(j.snapshot).end).toBe(j.snapshot.result.finishDate);
  });
  it("creates a real workbook with all rows, dates, predecessor data, colored cells and baseline borders", async () => {
    const j = job(),
      bytes = await exportPlanExcel(j),
      book = new Workbook();
    await book.xlsx.load(bytes.buffer as ArrayBuffer);
    const sheet = book.getWorksheet("Ke hoach Gantt")!;
    expect(sheet.rowCount).toBe(19);
    expect(sheet.getCell("B8").value).toBe(j.snapshot.result.tasks[0].name);
    expect(sheet.getCell("D9").value).toBeInstanceOf(Date);
    expect(sheet.getCell("F10").value).toContain("1.1FS");
    expect(sheet.getCell("A8").font.bold).toBe(true);
    const end = sheet.columnCount;
    let gray = 0,
      baseline = 0,
      red = 0;
    for (let row = 8; row <= 19; row++)
      for (let c = 11; c <= end; c++) {
        const cell = sheet.getCell(row, c),
          fill = cell.fill;
        if (fill?.type === "pattern") {
          if (fill.fgColor?.argb === "FFE5E7EB") gray++;
          if (fill.fgColor?.argb === "FFE11D48") red++;
        }
        if (cell.border?.bottom?.style === "medium") baseline++;
      }
    expect(gray).toBeGreaterThan(0);
    expect(red).toBeGreaterThan(0);
    expect(baseline).toBeGreaterThan(0);
    expect(book.getWorksheet("Lien ket")!.rowCount).toBe(13);
  });
  it("exports every row of a 5000-task plan using weekly columns", async () => {
    const j = job();
    j.snapshot.project = createLargeProject();
    j.snapshot.result = scheduleProject(j.snapshot.project);
    j.snapshot.baseline = null;
    j.options.scale = "week";
    const bytes = await exportPlanExcel(j),
      book = new Workbook();
    await book.xlsx.load(bytes.buffer as ArrayBuffer);
    expect(book.getWorksheet("Ke hoach Gantt")!.rowCount).toBe(5007);
  }, 30000);
  it("creates real landscape A4/A3 PDFs with embedded Vietnamese fonts and all pages", async () => {
    const fonts = {
      regular: new Uint8Array(await readFile("public/fonts/DejaVuSans.ttf")),
      bold: new Uint8Array(await readFile("public/fonts/DejaVuSans-Bold.ttf")),
    };
    for (const paper of ["a4", "a3"] as const) {
      const j = job();
      j.options = { format: "pdf", paper, scale: "day" };
      const bytes = await exportPlanPdf(j, () => {}, fonts),
        pdf = await PDFDocument.load(bytes);
      expect(pdf.getPageCount()).toBeGreaterThanOrEqual(2);
      expect(pdf.getPage(0).getWidth()).toBeGreaterThan(
        pdf.getPage(0).getHeight(),
      );
      expect(pdf.getTitle()).toContain("Kế hoạch tiến độ");
    }
  }, 30000);
});
