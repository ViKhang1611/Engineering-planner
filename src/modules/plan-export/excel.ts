import { toRows } from "../data/serialization";
import type { PaperSize } from "exceljs";
import type { ExportJob, Progress } from "./model";
import { isWorkingDay } from "../schedule/engine/schedulingEngine";
import {
  headings,
  planRange,
  planRows,
  timelineColumns,
  timePosition,
  taskColor,
  yieldToBrowser,
} from "./model";
import { overallProgress } from "../../domain/execution";
function argb(hex: string) {
  return "FF" + hex.replace("#", "").toUpperCase();
}
function lighten(hex: string, amount = 0.8) {
  const h = hex.replace("#", "");
  return (
    "#" +
    [0, 2, 4]
      .map((i) =>
        Math.round(
          parseInt(h.slice(i, i + 2), 16) * (1 - amount) + 255 * amount,
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export async function exportPlanExcel(
  job: ExportJob,
  progress: Progress = () => {},
) {
  const { snapshot: s, options } = job,
    { Workbook } = await import("exceljs"),
    workbook = new Workbook();
  const range = planRange(s),
    columns = timelineColumns(range.start, range.end, options.scale),
    rows = planRows(s);
  if (columns.length + 10 > 16384)
    throw new Error(
      "Timeline vượt giới hạn cột Excel. Chọn đơn vị tuần hoặc tháng.",
    );
  if (columns.length * Math.max(rows.length, 1) > 1500000)
    throw new Error(
      "Kế hoạch quá lớn cho lưới ngày trong trình duyệt. Chọn tuần hoặc tháng để xuất đầy đủ dữ liệu.",
    );
  workbook.creator = "ForgePlan";
  workbook.created = new Date(s.exportedAt);
  workbook.title = `Kế hoạch ${s.project.name}`;
  const sheet = workbook.addWorksheet("Ke hoach Gantt", {
    properties: { defaultRowHeight: 24 },
    pageSetup: {
      orientation: "landscape",
      paperSize: (options.paper === "a3" ? 8 : 9) as PaperSize,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: "1:7",
      margins: {
        left: 0.25,
        right: 0.25,
        top: 0.4,
        bottom: 0.4,
        header: 0.2,
        footer: 0.2,
      },
    },
  });
  const endColumn = 10 + columns.length;
  sheet.mergeCells(1, 1, 1, endColumn);
  sheet.getCell(1, 1).value = s.project.name;
  sheet.getCell(1, 1).font = {
    name: "Calibri",
    size: 18,
    bold: true,
    color: { argb: argb(s.theme.dark ? "#0e7490" : s.theme.accent) },
  };
  sheet.getRow(1).height = 32;
  sheet.mergeCells(2, 1, 2, endColumn);
  sheet.getCell(2, 1).value =
    `Hợp đồng: ${s.project.contractCode || "—"} | Xuất: ${new Date(s.exportedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} | Physical: ${overallProgress(s.result.tasks).toFixed(1)}% | Baseline: ${s.baseline?.name ?? "Chưa chốt"}`;
  sheet.mergeCells(3, 1, 3, endColumn);
  sheet.getCell(3, 1).value =
    "Đậm: khối lượng đã đạt · Nhạt: phần còn lại · Đường găng: màu cảnh báo · Chủ Nhật: xám · ◆: FAT/SAT/mốc · Viền dưới xám: baseline";
  sheet.mergeCells(4, 1, 4, endColumn);
  sheet.getCell(4, 1).value =
    `Toàn bộ ${rows.length} dòng WBS | ${range.start} → ${range.end} | Đơn vị: ${options.scale === "day" ? "Ngày" : options.scale === "week" ? "Tuần" : "Tháng"} | Variance theo ngày làm việc`;
  sheet.getRow(3).font = { size: 10, color: { argb: "FF475569" } };
  sheet.getRow(4).font = { size: 10 };
  const widths = [11, 42, 11, 14, 14, 24, 13, 13, 14, 26];
  widths.forEach((width, i) => (sheet.getColumn(i + 1).width = width));
  headings.forEach((h, i) => {
    sheet.mergeCells(6, i + 1, 7, i + 1);
    sheet.getCell(6, i + 1).value = h;
  });
  let monthStart = 0;
  for (let i = 0; i <= columns.length; i++) {
    if (
      i === columns.length ||
      columns[i].start.slice(0, 7) !== columns[monthStart].start.slice(0, 7)
    ) {
      if (i - monthStart > 1) sheet.mergeCells(6, 11 + monthStart, 6, 10 + i);
      sheet.getCell(6, 11 + monthStart).value = columns[monthStart].start.slice(
        0,
        7,
      );
      monthStart = i;
    }
    if (i < columns.length) {
      const cell = sheet.getCell(7, 11 + i);
      cell.value =
        options.scale === "day"
          ? Number(columns[i].start.slice(8))
          : columns[i].label;
      sheet.getColumn(11 + i).width = options.scale === "day" ? 4.2 : 10;
    }
  }
  for (const rowNo of [6, 7]) {
    sheet.getRow(rowNo).height = 24;
    for (let c = 1; c <= endColumn; c++) {
      const cell = sheet.getCell(rowNo, c);
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: argb(s.theme.accent) },
      };
      cell.font = {
        bold: true,
        size: 10,
        color: { argb: argb(s.theme.onAccent) },
      };
      cell.alignment = {
        vertical: "middle",
        horizontal: "center",
        wrapText: true,
      };
    }
  }
  for (let index = 0; index < rows.length; index++) {
    const { task, base, values } = rows[index],
      row = sheet.getRow(index + 8);
    values.forEach((value, j) => {
      const cell = row.getCell(j + 1);
      cell.value = j === 3 || j === 4 ? new Date(`${value}T00:00:00Z`) : value;
      cell.font = {
        name: "Calibri",
        size: 11,
        bold: task.isSummary,
        color: { argb: "FF172033" },
      };
      cell.alignment = {
        vertical: "middle",
        wrapText: true,
        ...(j === 0 || j === 1
          ? { indent: Math.min(task.depth, 15) }
          : {
              horizontal:
                typeof value === "number"
                  ? ("right" as const)
                  : ("left" as const),
            }),
      };
      if (j === 3 || j === 4) cell.numFmt = "dd/mm/yyyy";
      if (j === 6 || j === 7) cell.numFmt = '0.0"%"';
      cell.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
      if (task.isSummary)
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE8EDF5" },
        };
    });
    row.height = Math.max(
      24,
      Math.min(
        90,
        Math.ceil(
          Math.max(
            task.name.length / 38,
            String(values[5]).length / 22,
            String(values[9]).length / 23,
          ),
        ) * 14,
      ),
    );
    const start = timePosition(task.startAt, range.start, s.project.calendar),
      finish =
        task.duration === 0
          ? start
          : timePosition(task.finishAt, range.start, s.project.calendar),
      physical = start + ((finish - start) * task.physicalPct) / 100,
      color = taskColor(task, s);
    for (let i = 0; i < columns.length; i++) {
      const c = columns[i],
        sunday =
          options.scale === "day" && !isWorkingDay(c.start, s.project.calendar);
      const active = finish > c.offset && start < c.endOffset,
        milestone =
          task.duration === 0 && start >= c.offset && start < c.endOffset;
      const baseActive =
        base &&
        timePosition(base.finishAt, range.start, s.project.calendar) >=
          c.offset &&
        timePosition(base.startAt, range.start, s.project.calendar) <
          c.endOffset;
      if (!sunday && !active && !milestone && !baseActive) continue;
      const cell = row.getCell(11 + i);
      if (sunday)
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE5E7EB" },
        };
      else if (active)
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: {
            argb: argb(
              task.isSummary ||
                (task.physicalPct > 0 && physical > Math.max(c.offset, start))
                ? color
                : lighten(color),
            ),
          },
        };
      if (milestone) {
        cell.value = "◆";
        cell.font = {
          color: { argb: argb(s.theme.milestone) },
          bold: true,
          size: 14,
        };
        cell.alignment = { horizontal: "center", vertical: "middle" };
      }
      if (baseActive)
        cell.border = {
          bottom: { style: "medium", color: { argb: argb(s.theme.baseline) } },
        };
    }
    if (index % 50 === 0) {
      progress("Đang dựng bảng Excel và timeline", index, rows.length);
      await yieldToBrowser();
    }
  }
  sheet.views = [{ state: "frozen", xSplit: 2, ySplit: 7, zoomScale: 80 }];
  sheet.autoFilter = {
    from: { row: 7, column: 1 },
    to: { row: rows.length + 7, column: 10 },
  };
  sheet.headerFooter.oddFooter =
    "&LNgười lập biểu                  Chỉ huy trưởng / PM                  Đại diện Chủ đầu tư&R&P / &N";
  sheet.pageSetup.printArea = `A1:${sheet.getColumn(endColumn).letter}${Math.max(8, rows.length + 7)}`;
  const links = workbook.addWorksheet("Lien ket");
  links.addRow(["WBS trước", "WBS sau", "Loại", "Lag/Lead (ngày)"]);
  const wbs = new Map(s.result.tasks.map((t) => [t.id, t.wbs]));
  s.project.dependencies.forEach((d) =>
    links.addRow([
      wbs.get(d.predecessorId),
      wbs.get(d.successorId),
      d.type,
      d.lagDays,
    ]),
  );
  links.columns.forEach((c) => (c.width = 22));
  links.getRow(1).font = { bold: true };
  links.views = [{ state: "frozen", ySplit: 1 }];
  const data = workbook.addWorksheet("Project Data");
  data.columns = ["record_type", "id", "part", "payload"].map((key) => ({
    header: key,
    key,
    width: key === "payload" ? 100 : 24,
  }));
  data.addRows(toRows(s.project));
  data.views = [{ state: "frozen", ySplit: 1 }];
  data.getRow(1).font = { bold: true };
  progress("Đang đóng gói tệp XLSX", rows.length, rows.length);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
