import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { ExportJob, Progress } from "./model";
import { isWorkingDay } from "../schedule/engine/schedulingEngine";
import {
  planRange,
  planRows,
  timelineColumns,
  timePosition,
  taskColor,
  yieldToBrowser,
} from "./model";
import { overallProgress } from "../../domain/execution";
interface Fonts {
  regular: Uint8Array;
  bold: Uint8Array;
}
const color = (hex: string) =>
  rgb(
    ...([0, 2, 4].map(
      (i) => parseInt(hex.replace("#", "").slice(i, i + 2), 16) / 255,
    ) as [number, number, number]),
  );
const ink = rgb(0.09, 0.13, 0.2),
  grid = rgb(0.79, 0.83, 0.88),
  muted = rgb(0.36, 0.41, 0.49);
function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if (font.widthOfTextAtSize(word, size) > width) {
        if (line) {
          lines.push(line);
          line = "";
        }
        for (const ch of word) {
          if (line && font.widthOfTextAtSize(line + ch, size) > width) {
            lines.push(line);
            line = ch;
          } else line += ch;
        }
      } else {
        const candidate = line ? line + " " + word : word;
        if (line && font.widthOfTextAtSize(candidate, size) > width) {
          lines.push(line);
          line = word;
        } else line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}
export async function exportPlanPdf(
  job: ExportJob,
  progress: Progress = () => {},
  fonts?: Fonts,
) {
  const { snapshot: s, options } = job,
    doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  if (!fonts) {
    const base = new URL(import.meta.env.BASE_URL, self.location.origin);
    const responses = await Promise.all(
      ["DejaVuSans.ttf", "DejaVuSans-Bold.ttf"].map((name) =>
        fetch(new URL(`fonts/${name}`, base)).then(async (r) => {
          if (!r.ok) throw new Error("Không tải được font PDF tiếng Việt");
          return new Uint8Array(await r.arrayBuffer());
        }),
      ),
    );
    fonts = { regular: responses[0], bold: responses[1] };
  }
  const normal = await doc.embedFont(fonts.regular, { subset: true }),
    bold = await doc.embedFont(fonts.bold, { subset: true });
  const [width, height] =
      options.paper === "a3" ? [1190.55, 841.89] : [841.89, 595.28],
    margin = 24,
    leftWidth = options.paper === "a3" ? 570 : 455,
    chartX = margin + leftWidth,
    chartWidth = width - margin - chartX,
    top = height - 108,
    bottom = 94,
    size = options.paper === "a3" ? 7.3 : 6.4;
  const proportions = [34, 120, 28, 42, 42, 44, 28, 28, 28, 61],
    colWidths = proportions.map((n) => (n * leftWidth) / 455),
    range = planRange(s),
    columns = timelineColumns(range.start, range.end, options.scale),
    rows = planRows(s),
    perTimeline = options.paper === "a3" ? 42 : 21;
  const windows = Array.from(
    { length: Math.ceil(columns.length / perTimeline) },
    (_, i) => columns.slice(i * perTimeline, (i + 1) * perTimeline),
  );
  const cellLines = rows.map(({ values, task }) =>
    values.map((v, i) =>
      wrap(
        v === null
          ? "—"
          : (i === 3 || i === 4) && typeof v === "string"
            ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(2, 4)}`
            : typeof v === "number"
              ? Number(v.toFixed(1)).toString()
              : String(v),
        task.isSummary ? bold : normal,
        size,
        colWidths[i] - 6 - (i === 1 ? Math.min(task.depth, 8) * 5 : 0),
      ),
    ),
  );
  const heights = cellLines.map((lines) =>
    Math.max(22, Math.max(...lines.map((l) => l.length)) * (size + 2) + 6),
  );
  const groups: { start: number; end: number }[] = [];
  let start = 0,
    used = 0;
  for (let i = 0; i < rows.length; i++) {
    if (used + heights[i] > top - bottom && i > start) {
      groups.push({ start, end: i });
      start = i;
      used = 0;
    }
    if (heights[i] > top - bottom)
      throw new Error(
        "Một dòng dữ liệu quá dài để vừa trang PDF. Rút gọn tên/nguồn lực hoặc chọn A3.",
      );
    used += heights[i];
  }
  groups.push({ start, end: rows.length });
  const appendixPerPage = Math.floor((top - bottom) / 20),
    appendixPages = Math.ceil(s.project.dependencies.length / appendixPerPage),
    total = groups.length * windows.length + appendixPages;
  if (total > 2000)
    throw new Error(
      `Kế hoạch cần ${total} trang PDF. Chọn đơn vị tuần/tháng để xuất đầy đủ với ít trang hơn.`,
    );
  const taskIndex = new Map(s.result.tasks.map((t, i) => [t.id, i])),
    taskById = new Map(s.result.tasks.map((t) => [t.id, t]));
  const rowGroup = new Map<number, number>();
  groups.forEach((g, i) => {
    for (let n = g.start; n < g.end; n++) rowGroup.set(n, i);
  });
  const pageFor = (index: number, position: number) => {
    const w = Math.max(
      0,
      windows.findIndex(
        (win) => position >= win[0].offset && position <= win.at(-1)!.endOffset,
      ),
    );
    return (rowGroup.get(index) ?? 0) * windows.length + w + 1;
  };
  const outgoing = new Map<string, typeof s.project.dependencies>();
  for (const d of s.project.dependencies) {
    for (const id of [d.predecessorId, d.successorId]) {
      const list = outgoing.get(id) ?? [];
      list.push(d);
      outgoing.set(id, list);
    }
  }
  let pageNumber = 0;
  function text(
    page: PDFPage,
    value: string,
    x: number,
    y: number,
    font = normal,
    fontSize = size,
    fill = ink,
  ) {
    page.drawText(value.normalize("NFC"), {
      x,
      y,
      font,
      size: fontSize,
      color: fill,
    });
  }
  function line(
    page: PDFPage,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    fill = grid,
    thickness = 0.4,
  ) {
    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      color: fill,
      thickness,
    });
  }
  function rect(
    page: PDFPage,
    x: number,
    y: number,
    w: number,
    h: number,
    fill = rgb(1, 1, 1),
    border = grid,
  ) {
    if (w > 0 && h > 0)
      page.drawRectangle({
        x,
        y,
        width: w,
        height: h,
        color: fill,
        borderColor: border,
        borderWidth: 0.35,
      });
  }
  function frame(page: PDFPage, subtitle: string) {
    pageNumber++;
    const titleLines = wrap(s.project.name, bold, 12, width - 2 * margin);
    text(page, titleLines[0], margin, height - 27, bold, 12);
    if (titleLines[1])
      text(page, titleLines.slice(1).join(" "), margin, height - 42, bold, 8);
    text(
      page,
      `Hợp đồng: ${s.project.contractCode || "—"}   |   Ngày xuất: ${new Date(s.exportedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}   |   Physical: ${overallProgress(s.result.tasks).toFixed(1)}%`,
      margin,
      height - 55,
      normal,
      8,
    );
    let lx = margin;
    for (const [label, hex] of [
      ["Task thường", s.theme.task],
      ["Đường găng", s.theme.critical],
      [s.baseline?.name ?? "Baseline (chưa chốt)", s.theme.baseline],
      ["Mốc FAT/SAT", s.theme.milestone],
      ["Duration %", s.theme.duration],
    ] as [string, string][]) {
      rect(page, lx, height - 73, 10, 5, color(hex), color(hex));
      text(page, label, lx + 14, height - 74, normal, 7);
      lx += normal.widthOfTextAtSize(label, 7) + 32;
    }
    text(page, subtitle, margin, height - 90, normal, 7, muted);
    const boxWidth = (width - 2 * margin) / 3;
    for (const [i, title] of [
      "Người lập biểu (Kỹ sư kế hoạch)",
      "Chỉ huy trưởng / PM",
      "Đại diện Chủ đầu tư",
    ].entries()) {
      rect(page, margin + i * boxWidth, 27, boxWidth, 49);
      text(page, title, margin + i * boxWidth + 8, 63, bold, 8);
      text(
        page,
        "(Ký, ghi rõ họ tên)",
        margin + i * boxWidth + 8,
        49,
        normal,
        7,
        muted,
      );
    }
    text(
      page,
      `ForgePlan · ${options.paper.toUpperCase()} ngang · Trang ${pageNumber}/${total}`,
      margin,
      14,
      normal,
      7,
      muted,
    );
  }
  for (const group of groups)
    for (const [windowIndex, win] of windows.entries()) {
      const page = doc.addPage([width, height]),
        lo = win[0].offset,
        hi = win.at(-1)!.endOffset,
        cellWidth = chartWidth / win.length;
      frame(
        page,
        `WBS ${group.start + 1}–${group.end}/${rows.length} · Timeline ${win[0].start} → ${win.at(-1)!.end} · Dải ${windowIndex + 1}/${windows.length} · Nhạt: phần còn lại; thanh dưới: Duration; vạch xám: Baseline`,
      );
      const xPosition = (position: number) => {
        if (position <= lo) return chartX;
        if (position >= hi) return chartX + chartWidth;
        const i = win.findIndex(
          (c) => position >= c.offset && position < c.endOffset,
        );
        return (
          chartX +
          (Math.max(0, i) +
            (position - win[Math.max(0, i)].offset) /
              (win[Math.max(0, i)].endOffset - win[Math.max(0, i)].offset)) *
            cellWidth
        );
      };
      let x = margin;
      [
        "WBS",
        "Hạng mục công việc",
        "Ngày công",
        "Bắt đầu",
        "Kết thúc",
        "Tiền nhiệm",
        "Phys.%",
        "Dur.%",
        "SV (d)",
        "Kỹ sư phụ trách",
      ].forEach((label, i) => {
        rect(page, x, top, colWidths[i], 17, rgb(0.93, 0.95, 0.98));
        wrap(label, bold, 5.8, colWidths[i] - 4)
          .slice(0, 2)
          .forEach((l, n) => text(page, l, x + 2, top + 11 - n * 6, bold, 5.8));
        x += colWidths[i];
      });
      win.forEach((c, i) => {
        rect(
          page,
          chartX + i * cellWidth,
          top,
          cellWidth,
          17,
          rgb(0.93, 0.95, 0.98),
        );
        text(
          page,
          options.scale === "day" ? c.start.slice(8) : c.label,
          chartX + i * cellWidth + 2,
          top + 6,
          normal,
          Math.min(6, cellWidth / 3),
        );
      });
      const centers = new Map<string, number>();
      let y = top;
      for (let i = group.start; i < group.end; i++) {
        const { task, base } = rows[i],
          h = heights[i],
          cy = y - h / 2;
        centers.set(task.id, cy);
        let cx = margin;
        colWidths.forEach((w, c) => {
          rect(
            page,
            cx,
            y - h,
            w,
            h,
            task.isSummary ? rgb(0.93, 0.95, 0.98) : rgb(1, 1, 1),
          );
          cellLines[i][c].forEach((l, n) =>
            text(
              page,
              l,
              cx + 3 + (c === 1 ? Math.min(task.depth, 8) * 5 : 0),
              y - size - 3 - n * (size + 2),
              task.isSummary ? bold : normal,
            ),
          );
          cx += w;
        });
        win.forEach((c, j) => {
          const sunday =
            options.scale === "day" &&
            !isWorkingDay(c.start, s.project.calendar);
          rect(
            page,
            chartX + j * cellWidth,
            y - h,
            cellWidth,
            h,
            sunday ? rgb(0.93, 0.94, 0.95) : rgb(1, 1, 1),
          );
        });
        const a = timePosition(task.startAt, range.start, s.project.calendar),
          b =
            task.duration === 0
              ? a
              : timePosition(task.finishAt, range.start, s.project.calendar),
          barColor = color(taskColor(task, s));
        if (task.duration === 0 && a >= lo && a < hi) {
          const dx = xPosition(a),
            dy = cy;
          page.drawSvgPath("M 0 -4 L 4 0 L 0 4 L -4 0 Z", {
            x: Math.max(chartX + 4, Math.min(chartX + chartWidth - 4, dx)),
            y: dy,
            color: color(s.theme.milestone),
          });
        } else if (b > lo && a < hi) {
          const xa = xPosition(a),
            xb = xPosition(b),
            physical = xPosition(a + ((b - a) * task.physicalPct) / 100),
            duration = xPosition(a + ((b - a) * task.durationPct) / 100);
          rect(page, xa, cy - 4, xb - xa, 9, barColor, barColor);
          rect(page, xa, cy - 4, xb - xa, 9, rgb(1, 1, 1), barColor);
          page.drawRectangle({
            x: xa,
            y: cy - 4,
            width: xb - xa,
            height: 9,
            color: barColor,
            opacity: 0.18,
          });
          rect(
            page,
            xa,
            cy - 4,
            Math.max(0, physical - xa),
            9,
            barColor,
            barColor,
          );
          rect(
            page,
            xa,
            cy - 7,
            Math.max(0, duration - xa),
            2,
            color(s.theme.duration),
            color(s.theme.duration),
          );
          if (task.isSummary) {
            line(page, xa, cy + 3, xb, cy + 3, barColor, 2.5);
            line(page, xa, cy + 3, xa, cy - 2, barColor, 2);
            line(page, xb, cy + 3, xb, cy - 2, barColor, 2);
          }
        }
        if (base) {
          const a = timePosition(base.startAt, range.start, s.project.calendar),
            b = timePosition(base.finishAt, range.start, s.project.calendar);
          if (b >= lo && a < hi)
            rect(
              page,
              xPosition(a),
              cy - 11,
              Math.max(2, xPosition(b) - xPosition(a)),
              1.6,
              color(s.theme.baseline),
              color(s.theme.baseline),
            );
        }
        y -= h;
      }
      const links = new Map<string, (typeof s.project.dependencies)[number]>();
      for (let i = group.start; i < group.end; i++)
        for (const d of outgoing.get(rows[i].task.id) ?? []) links.set(d.id, d);
      for (const d of links.values()) {
        const a = taskById.get(d.predecessorId)!,
          b = taskById.get(d.successorId)!,
          ap = timePosition(
            d.type[0] === "F" ? a.finishAt : a.startAt,
            range.start,
            s.project.calendar,
          ),
          bp = timePosition(
            d.type[1] === "F" ? b.finishAt : b.startAt,
            range.start,
            s.project.calendar,
          ),
          ay = centers.get(a.id),
          by = centers.get(b.id),
          av = ay !== undefined && ap >= lo && ap <= hi,
          bv = by !== undefined && bp >= lo && bp <= hi,
          stroke = color(
            a.isCritical && b.isCritical ? s.theme.critical : "#64748b",
          );
        if (av && bv) {
          const ax = xPosition(ap),
            bx = xPosition(bp),
            middle = Math.max(
              chartX + 3,
              Math.min(chartX + chartWidth - 3, ax + 5),
            );
          line(page, ax, ay!, middle, ay!, stroke, 0.65);
          line(page, middle, ay!, middle, by!, stroke, 0.65);
          line(page, middle, by!, bx, by!, stroke, 0.65);
          line(page, bx, by!, bx - 3, by! + 2, stroke, 0.65);
          line(page, bx, by!, bx - 3, by! - 2, stroke, 0.65);
        } else if (av || bv) {
          const source = av,
            aTask = source ? b : a,
            position = source ? ap : bp,
            anchorY = (source ? ay : by)!,
            partner = source ? bp : ap,
            ref = pageFor(taskIndex.get(aTask.id)!, partner),
            anchorX = xPosition(position),
            stub =
              anchorX > chartX + chartWidth - 75 ? anchorX - 65 : anchorX + 5;
          line(page, anchorX, anchorY, stub, anchorY, stroke, 0.5);
          text(
            page,
            `${d.type} ${source ? "→" : "←"} ${aTask.wbs} p.${ref}`,
            stub,
            anchorY + 4,
            normal,
            5,
            stroke,
          );
        }
      }
      progress("Đang dựng PDF vector", pageNumber, total);
      await yieldToBrowser();
    }
  const wbs = new Map(s.result.tasks.map((t) => [t.id, t.wbs]));
  for (
    let offset = 0;
    offset < s.project.dependencies.length;
    offset += appendixPerPage
  ) {
    const page = doc.addPage([width, height]);
    frame(
      page,
      "Phụ lục · Danh mục liên kết đầy đủ (tham chiếu các đường nối qua trang)",
    );
    let y = top;
    for (const d of s.project.dependencies.slice(
      offset,
      offset + appendixPerPage,
    )) {
      text(
        page,
        `${wbs.get(d.predecessorId)}  →  ${wbs.get(d.successorId)}     ${d.type}     Lag/Lead: ${d.lagDays} ngày làm việc`,
        margin + 8,
        y - 12,
        normal,
        8,
      );
      line(page, margin, y - 19, width - margin, y - 19);
      y -= 20;
    }
    progress("Đang dựng phụ lục liên kết", pageNumber, total);
    await yieldToBrowser();
  }
  doc.setTitle(`Kế hoạch tiến độ — ${s.project.name}`);
  doc.setAuthor("ForgePlan");
  doc.setCreationDate(new Date(s.exportedAt));
  progress("Đang đóng gói PDF", total, total);
  return doc.save();
}
