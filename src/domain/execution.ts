import { parseDate } from "../modules/schedule/engine/schedulingEngine";
import type { ProjectInput, ScheduledTask, Task } from "./project";
export const statuses = {
  todo: "Chưa bắt đầu",
  active: "Đang thi công",
  review: "Chờ nghiệm thu FAT–SAT",
  done: "Hoàn thành",
} as const;
export type ExecutionStatus = keyof typeof statuses;
export function taskStatus(task: Task): ExecutionStatus {
  if (task.physicalPct === 100)
    return task.milestoneType && !task.acceptance?.accepted ? "review" : "done";
  return task.executionStatus === "review"
    ? "review"
    : task.executionStatus === "active" || task.physicalPct > 0
      ? "active"
      : "todo";
}
export function normalizeExecution(project: ProjectInput) {
  for (const task of project.tasks) {
    task.progressWeight ??= Math.max(1, task.duration);
    if (task.progressMode === "checklist") {
      const checks = task.checklist ?? [],
        total = checks.reduce((n, c) => n + c.weight, 0);
      task.physicalPct = total
        ? Math.round(
            (checks.reduce((n, c) => n + (c.checked ? c.weight : 0), 0) /
              total) *
              10000,
          ) / 100
        : 0;
    }
    if (
      task.progressMode === "checklist" &&
      task.physicalPct < 100 &&
      task.acceptance?.accepted
    )
      task.acceptance = { ...task.acceptance, accepted: false, date: "" };
    task.executionStatus = taskStatus(task);
  }
}
export function transition(task: Task, status: ExecutionStatus, date: string) {
  task.executionStatus = status;
  if (status === "done" && !task.checklist?.length)
    task.progressMode = "manual";
  if (status === "done" || status === "todo") {
    task.checklist?.forEach((c) => (c.checked = status === "done"));
    task.physicalPct = status === "done" ? 100 : 0;
    task.acceptance = {
      accepted: status === "done",
      date: status === "done" ? date : "",
      reference: task.acceptance?.reference ?? "",
    };
  } else {
    task.acceptance = {
      accepted: false,
      date: "",
      reference: task.acceptance?.reference ?? "",
    };
    if (task.progressMode !== "checklist")
      task.physicalPct =
        status === "review" ? 90 : Math.min(99, Math.max(1, task.physicalPct));
    else if (
      status === "active" &&
      task.checklist?.length &&
      task.checklist.every((c) => c.checked)
    )
      task.checklist[task.checklist.length - 1].checked = false;
  }
}
export function overallProgress(tasks: ScheduledTask[], planned = false) {
  const leaves = tasks.filter((t) => !t.isSummary),
    weight = leaves.reduce(
      (n, t) => n + (t.progressWeight ?? Math.max(t.duration, 1)),
      0,
    );
  return weight
    ? leaves.reduce(
        (n, t) =>
          n +
          (t.progressWeight ?? Math.max(t.duration, 1)) *
            (planned ? t.durationPct : t.physicalPct),
        0,
      ) / weight
    : 0;
}
export function validateExtensions(p: ProjectInput) {
  if (!p || !Array.isArray(p.tasks))
    throw new Error("Danh sách công việc không hợp lệ");
  let attachmentBytes = 0;
  for (const t of p.tasks) {
    for (const a of t.assignments ?? [])
      if (
        a.quantity !== undefined &&
        (!Number.isFinite(a.quantity) || a.quantity < 0)
      )
        throw new Error("Số lượng vật tư không hợp lệ");
    for (const key of ["progressWeight", "budgetCost", "actualCost"] as const)
      if (
        t[key] !== undefined &&
        (!Number.isFinite(t[key]) ||
          t[key]! < (key === "progressWeight" ? 0.001 : 0))
      )
        throw new Error(`${t.name}: ${key} không hợp lệ`);
    if (
      t.checklist &&
      (!Array.isArray(t.checklist) ||
        t.checklist.some(
          (c) =>
            !c.id ||
            typeof c.title !== "string" ||
            !Number.isFinite(c.weight) ||
            c.weight <= 0 ||
            typeof c.checked !== "boolean",
        ))
    )
      throw new Error("Checklist không hợp lệ");
    if (t.progressMode && !["manual", "checklist"].includes(t.progressMode))
      throw new Error("Cách đo tiến độ không hợp lệ");
    if (t.executionStatus && !Object.hasOwn(statuses, t.executionStatus))
      throw new Error("Trạng thái không hợp lệ");
    if (t.milestoneType && !["FAT", "SAT", "OTHER"].includes(t.milestoneType))
      throw new Error("Loại nghiệm thu không hợp lệ");
    if (
      t.checklist &&
      new Set(t.checklist.map((c) => c.id)).size !== t.checklist.length
    )
      throw new Error("Trùng mã checklist");
    if (t.acceptance?.accepted && t.physicalPct < 100)
      throw new Error(`${t.name}: chỉ nghiệm thu khi Physical đạt 100%`);
    if (t.attachments && !Array.isArray(t.attachments))
      throw new Error("Tài liệu không hợp lệ");
    for (const a of t.attachments ?? []) {
      if (
        !a.id ||
        typeof a.name !== "string" ||
        typeof a.type !== "string" ||
        !Number.isSafeInteger(a.size) ||
        a.size < 0 ||
        (a.data !== undefined && typeof a.data !== "string")
      )
        throw new Error("Tệp đính kèm không hợp lệ");
      // Stored attachments carry metadata only; inline data must match its size.
      if (a.data !== undefined) {
        const match = a.data.match(
          /^data:[^,]*;base64,([A-Za-z0-9+/]*={0,2})$/,
        );
        if (!match || match[1].length % 4 !== 0)
          throw new Error("Mã hóa tệp không hợp lệ");
        const bytes =
          (match[1].length / 4) * 3 -
          (match[1].endsWith("==") ? 2 : match[1].endsWith("=") ? 1 : 0);
        if (bytes !== a.size) throw new Error("Kích thước tệp không hợp lệ");
      }
      if (a.size > 5 * 1024 * 1024) throw new Error("Tệp đính kèm vượt 5 MB");
      attachmentBytes += a.size;
    }
    if (t.notes !== undefined && typeof t.notes !== "string")
      throw new Error("Ghi chú không hợp lệ");
    if (t.acceptance) {
      if (
        typeof t.acceptance.accepted !== "boolean" ||
        typeof t.acceptance.reference !== "string"
      )
        throw new Error("Nghiệm thu không hợp lệ");
      if (t.acceptance.accepted || t.acceptance.date)
        parseDate(t.acceptance.date);
    }
  }
  if (attachmentBytes > 25 * 1024 * 1024)
    throw new Error("Tổng tài liệu dự án vượt 25 MB");
  if (p.baselines && !Array.isArray(p.baselines))
    throw new Error("Danh sách baseline không hợp lệ");
  for (const b of p.baselines ?? []) {
    if (
      !b.id ||
      typeof b.name !== "string" ||
      !Array.isArray(b.tasks) ||
      new Set(b.tasks.map((t) => t.id)).size !== b.tasks.length
    )
      throw new Error("Baseline không hợp lệ");
    b.calendar?.holidays.forEach(parseDate);
    for (const t of b.tasks) {
      parseDate(t.startDate);
      parseDate(t.endDate);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(t.startDate) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(t.endDate) ||
        !Number.isFinite(t.duration) ||
        t.duration < 0 ||
        !Number.isFinite(Date.parse(t.startAt)) ||
        !Number.isFinite(Date.parse(t.finishAt))
      )
        throw new Error("Ngày hoặc thời lượng baseline không hợp lệ");
    }
  }
  if (
    p.activeBaselineId &&
    !p.baselines?.some((b) => b.id === p.activeBaselineId)
  )
    throw new Error("Baseline đang chọn không tồn tại");
  if (
    p.progressHistory &&
    (!Array.isArray(p.progressHistory) ||
      p.progressHistory.some(
        (h) =>
          !/^\d{4}-\d{2}-\d{2}$/.test(h.date) ||
          !Number.isFinite(h.physicalPct) ||
          h.physicalPct < 0 ||
          h.physicalPct > 100,
      ))
  )
    throw new Error("Lịch sử tiến độ không hợp lệ");
  for (const h of p.progressHistory ?? []) parseDate(h.date);
  if (
    p.baselines &&
    new Set(p.baselines.map((b) => b.id)).size !== p.baselines.length
  )
    throw new Error("Trùng mã baseline");
}
export function variance(end: string, baselineEnd: string, holidays: string[]) {
  let from = new Date(`${baselineEnd}T00:00:00Z`),
    to = new Date(`${end}T00:00:00Z`),
    sign = 1;
  if (from > to) {
    [from, to] = [to, from];
    sign = -1;
  }
  let days = 0;
  while (from < to) {
    from.setUTCDate(from.getUTCDate() + 1);
    if (
      from.getUTCDay() !== 0 &&
      !holidays.includes(from.toISOString().slice(0, 10))
    )
      days++;
  }
  return sign * days;
}
