/**
 * MS Project XML (MSPDI) export and import.
 *
 * Mapped: WBS outline, durations, Physical %, FS/SS/FF/SF links with lag,
 * "start no earlier than" (SNET constraint), deadlines, notes, costs,
 * resources (work/material; equipment via Group), assignments, the project
 * calendar (work week, two shift blocks, holidays, makeup days) and
 * baselines 0–10. Not representable in MSPDI and therefore dropped on
 * export: checklists, FAT/SAT acceptance and attachments.
 */
import { XMLParser } from "fast-xml-parser";
import type {
  Baseline,
  Calendar,
  Dependency,
  DependencyType,
  ProjectInput,
  Resource,
  Task,
} from "../../domain/project";
import {
  addCalendarDays,
  DEFAULT_WORK_WEEK,
  parseDate,
  scheduleProject,
  shiftMinutes,
} from "../schedule/engine/schedulingEngine";

const MSP_LINK: Record<DependencyType, number> = { FF: 0, FS: 1, SF: 2, SS: 3 };
const FROM_MSP_LINK: Record<string, DependencyType> = {
  "0": "FF",
  "1": "FS",
  "2": "SF",
  "3": "SS",
};
const EQUIPMENT_GROUP = "Thiết bị";

const escapeXml = (value: string) =>
  value.replace(
    /[<>&'"]/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        "'": "&apos;",
        '"': "&quot;",
      })[c]!,
  );
const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00`;
/** "2026-10-05T08:00:00+07:00" → "2026-10-05T08:00:00" (MSPDI local time). */
const local = (at: string) => at.slice(0, 19);
const hours = (days: number) => {
  const minutes = Math.round(days * 480);
  return `PT${Math.floor(minutes / 60)}H${minutes % 60}M0S`;
};

export interface MspExport {
  xml: string;
  /** What could not be carried over, for the user. */
  dropped: string[];
}

export function exportMsProject(project: ProjectInput): MspExport {
  const result = scheduleProject(project);
  const byId = new Map(result.tasks.map((t) => [t.id, t]));
  const uid = new Map(result.tasks.map((t, i) => [t.id, i + 1]));
  const resUid = new Map(project.resources.map((r, i) => [r.id, i + 1]));
  const { morning, afternoon } = shiftMinutes(project.calendar);
  const week = new Set(project.calendar.workWeek ?? DEFAULT_WORK_WEEK);
  const incoming = new Map<string, Dependency[]>();
  for (const d of project.dependencies)
    (
      incoming.get(d.successorId) ??
      incoming.set(d.successorId, []).get(d.successorId)!
    ).push(d);
  const dropped = new Set<string>();
  const el = (name: string, value: string | number | undefined) =>
    value === undefined || value === ""
      ? ""
      : `<${name}>${escapeXml(String(value))}</${name}>`;

  const weekDays = [0, 1, 2, 3, 4, 5, 6]
    .map((d) => {
      const working = week.has(d);
      return `<WeekDay><DayType>${d + 1}</DayType><DayWorking>${working ? 1 : 0}</DayWorking>${
        working
          ? `<WorkingTimes><WorkingTime><FromTime>${hhmm(morning)}</FromTime><ToTime>${hhmm(morning + 240)}</ToTime></WorkingTime><WorkingTime><FromTime>${hhmm(afternoon)}</FromTime><ToTime>${hhmm(afternoon + 240)}</ToTime></WorkingTime></WorkingTimes>`
          : ""
      }</WeekDay>`;
    })
    .join("");
  const exception = (date: string, working: boolean, i: number) =>
    `<Exception><EnteredByOccurrences>0</EnteredByOccurrences><TimePeriod><FromDate>${date}T00:00:00</FromDate><ToDate>${date}T23:59:00</ToDate></TimePeriod><Occurrences>1</Occurrences><Name>${working ? "Làm bù" : "Nghỉ lễ"} ${i + 1}</Name><Type>1</Type><DayWorking>${working ? 1 : 0}</DayWorking>${
      working
        ? `<WorkingTimes><WorkingTime><FromTime>${hhmm(morning)}</FromTime><ToTime>${hhmm(morning + 240)}</ToTime></WorkingTime><WorkingTime><FromTime>${hhmm(afternoon)}</FromTime><ToTime>${hhmm(afternoon + 240)}</ToTime></WorkingTime></WorkingTimes>`
        : ""
    }</Exception>`;
  const exceptions = [
    ...project.calendar.holidays.map((d, i) => exception(d, false, i)),
    ...(project.calendar.extraWorkingDays ?? []).map((d, i) =>
      exception(d, true, i),
    ),
  ].join("");

  const tasks = result.tasks
    .map((t) => {
      const source = project.tasks.find((x) => x.id === t.id)!;
      if (source.checklist?.length) dropped.add("checklist");
      if (source.milestoneType || source.acceptance?.accepted)
        dropped.add("nghiệm thu FAT/SAT");
      if (source.attachments?.length) dropped.add("tệp đính kèm");
      const links = (incoming.get(t.id) ?? [])
        .map(
          (d) =>
            `<PredecessorLink><PredecessorUID>${uid.get(d.predecessorId)}</PredecessorUID><Type>${MSP_LINK[d.type]}</Type><LinkLag>${Math.round(d.lagDays * 480 * 10)}</LinkLag><LagFormat>7</LagFormat></PredecessorLink>`,
        )
        .join("");
      const baselines = (project.baselines ?? [])
        .slice(0, 11)
        .map((b, n) => {
          const bt = b.tasks.find((x) => x.id === t.id);
          return bt
            ? `<Baseline><Number>${n}</Number><Start>${local(bt.startAt)}</Start><Finish>${local(bt.finishAt)}</Finish><Duration>${hours(bt.duration)}</Duration>${el("FixedCost", bt.budgetCost)}</Baseline>`
            : "";
        })
        .join("");
      return `<Task>${el("UID", uid.get(t.id))}${el("ID", uid.get(t.id))}${el("Name", t.name)}${el("WBS", t.wbs)}${el("OutlineNumber", t.wbs)}<OutlineLevel>${t.depth + 1}</OutlineLevel><Summary>${t.isSummary ? 1 : 0}</Summary><Milestone>${!t.isSummary && t.duration === 0 ? 1 : 0}</Milestone><Start>${local(t.startAt)}</Start><Finish>${local(t.finishAt)}</Finish><Duration>${hours(t.duration)}</Duration><DurationFormat>7</DurationFormat><PercentComplete>${Math.round(t.physicalPct)}</PercentComplete><PhysicalPercentComplete>${Math.round(t.physicalPct)}</PhysicalPercentComplete>${
        source.requestedStartDate && !t.isSummary
          ? `<ConstraintType>4</ConstraintType><ConstraintDate>${source.requestedStartDate}T${hhmm(morning)}</ConstraintDate>`
          : "<ConstraintType>0</ConstraintType>"
      }${source.deadline ? `<Deadline>${source.deadline}T${hhmm(afternoon + 240)}</Deadline>` : ""}${el("Notes", source.notes)}${el("FixedCost", source.budgetCost)}${el("ActualCost", source.actualCost)}${links}${baselines}</Task>`;
    })
    .join("");

  const resources = project.resources
    .map(
      (r) =>
        `<Resource>${el("UID", resUid.get(r.id))}${el("ID", resUid.get(r.id))}${el("Name", r.name)}<Type>${r.kind === "material" ? 0 : 1}</Type>${r.kind === "equipment" ? el("Group", EQUIPMENT_GROUP) : ""}<MaxUnits>${(r.capacityHours / 8).toFixed(2)}</MaxUnits></Resource>`,
    )
    .join("");
  let assignmentUid = 0;
  const assignments = project.tasks
    .flatMap((t) =>
      t.assignments.map((a) => {
        const material =
          project.resources.find((r) => r.id === a.resourceId)?.kind ===
          "material";
        return `<Assignment><UID>${++assignmentUid}</UID><TaskUID>${uid.get(t.id)}</TaskUID><ResourceUID>${resUid.get(a.resourceId)}</ResourceUID><Units>${material ? (a.quantity ?? 0) : a.units}</Units></Assignment>`;
      }),
    )
    .join("");

  const startAt = byId.size
    ? result.tasks.reduce(
        (m, t) => (t.startAt < m ? t.startAt : m),
        result.tasks[0].startAt,
      )
    : `${project.startDate}T${hhmm(morning)}`;
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project">${el("Name", `${project.name}.xml`)}${el("Title", project.name)}${el("Company", project.client)}${el("Subject", project.contractCode)}<ScheduleFromStart>1</ScheduleFromStart><StartDate>${local(startAt)}</StartDate><StatusDate>${project.statusDate}T${hhmm(afternoon + 240)}</StatusDate><DefaultStartTime>${hhmm(morning)}</DefaultStartTime><DefaultFinishTime>${hhmm(afternoon + 240)}</DefaultFinishTime><MinutesPerDay>480</MinutesPerDay><MinutesPerWeek>${480 * week.size}</MinutesPerWeek><DaysPerMonth>${Math.round((week.size * 52) / 12)}</DaysPerMonth><CalendarUID>1</CalendarUID><Calendars><Calendar><UID>1</UID><Name>ForgePlan</Name><IsBaseCalendar>1</IsBaseCalendar><WeekDays>${weekDays}</WeekDays>${exceptions ? `<Exceptions>${exceptions}</Exceptions>` : ""}</Calendar></Calendars><Tasks>${tasks}</Tasks><Resources>${resources}</Resources><Assignments>${assignments}</Assignments></Project>
`;
  return { xml, dropped: [...dropped] };
}

// ---------------------------------------------------------------- import

type Node = Record<string, unknown>;
const ARRAYS = new Set([
  "Calendar",
  "WeekDay",
  "WorkingTime",
  "Exception",
  "Task",
  "PredecessorLink",
  "Baseline",
  "Resource",
  "Assignment",
]);
const str = (node: Node | undefined, key: string) => {
  const v = node?.[key];
  return v === undefined || v === null ? "" : String(v);
};
const num = (node: Node | undefined, key: string, fallback = 0) => {
  const v = Number(str(node, key));
  return Number.isFinite(v) && str(node, key) !== "" ? v : fallback;
};
const list = (node: Node | undefined, key: string): Node[] =>
  (node?.[key] as Node[] | undefined) ?? [];
/** "PT40H0M0S" → minutes. */
function durationMinutes(value: string) {
  const m =
    /^-?P(?:(\d+(?:\.\d+)?)D)?T?(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(
      value,
    );
  if (!m) return 0;
  return (
    Number(m[1] ?? 0) * 480 +
    Number(m[2] ?? 0) * 60 +
    Number(m[3] ?? 0) +
    Number(m[4] ?? 0) / 60
  );
}
const dateOf = (value: string) => {
  const date = value.slice(0, 10);
  parseDate(date);
  return date;
};
const toTimeMinutes = (value: string) => {
  const m = /^(\d\d):(\d\d)/.exec(value);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};
const clockText = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
/** Each day in [from, to], capped at 366 entries. */
function datesBetween(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 366; d = addCalendarDays(d, 1))
    out.push(d);
  return out;
}

export interface MspImport {
  project: ProjectInput;
  warnings: string[];
}

export function importMsProject(xml: string): MspImport {
  const parser = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false,
    trimValues: true,
    isArray: (name) => ARRAYS.has(name),
  });
  const root = (parser.parse(xml) as Node).Project as Node | undefined;
  if (!root)
    throw new Error("Không phải tệp MS Project XML (thiếu thẻ Project).");
  const warnings: string[] = [];
  const warn = (message: string) => {
    if (!warnings.includes(message)) warnings.push(message);
  };

  // Calendar
  const calendars = list(root.Calendars as Node, "Calendar");
  const calendarNode =
    calendars.find((c) => str(c, "UID") === str(root, "CalendarUID")) ??
    calendars.find((c) => str(c, "IsBaseCalendar") === "1") ??
    calendars[0];
  const calendar: Calendar = { holidays: [] };
  const workWeek: number[] = [];
  let shift: { morning: number; afternoon: number } | undefined;
  const legacyExceptions: Node[] = [];
  for (const day of list(calendarNode?.WeekDays as Node, "WeekDay")) {
    const type = num(day, "DayType", -1);
    if (type === 0) {
      legacyExceptions.push(day);
      continue;
    }
    if (type < 1 || type > 7) continue;
    if (str(day, "DayWorking") !== "1") continue;
    workWeek.push(type - 1);
    const times = list(day.WorkingTimes as Node, "WorkingTime")
      .map((w) => [
        toTimeMinutes(str(w, "FromTime")),
        toTimeMinutes(str(w, "ToTime")),
      ])
      .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
    if (
      times.length === 2 &&
      times[0][1] - times[0][0] === 240 &&
      times[1][1] - times[1][0] === 240
    )
      shift ??= { morning: times[0][0], afternoon: times[1][0] };
    else if (times.length)
      warn("Giờ làm việc khác hai ca 4 giờ: dùng ca mặc định 08:00 / 13:00.");
  }
  if (calendarNode && workWeek.length) {
    const sorted = [...workWeek].sort((a, b) => a - b);
    if (sorted.join() !== DEFAULT_WORK_WEEK.join()) calendar.workWeek = sorted;
  }
  if (shift && (shift.morning !== 480 || shift.afternoon !== 780))
    calendar.shift = {
      morningStart: clockText(shift.morning),
      afternoonStart: clockText(shift.afternoon),
    };
  const extra: string[] = [];
  const periodDays = (node: Node) => {
    const period = node.TimePeriod as Node | undefined;
    if (!period) return [];
    try {
      return datesBetween(
        dateOf(str(period, "FromDate")),
        dateOf(str(period, "ToDate")),
      );
    } catch {
      warn("Bỏ qua ngoại lệ lịch có ngày không hợp lệ.");
      return [];
    }
  };
  for (const node of [
    ...legacyExceptions,
    ...list(calendarNode?.Exceptions as Node, "Exception"),
  ]) {
    const days = periodDays(node);
    if (str(node, "DayWorking") === "1") extra.push(...days);
    else calendar.holidays.push(...days);
  }
  calendar.holidays = [...new Set(calendar.holidays)].sort();
  if (extra.length) calendar.extraWorkingDays = [...new Set(extra)].sort();

  // Resources
  const resources: Resource[] = [];
  const resourceByUid = new Map<string, Resource>();
  for (const r of list(root.Resources as Node, "Resource")) {
    const uid = str(r, "UID");
    const name = str(r, "Name").trim();
    if (!name || uid === "0") continue;
    const type = str(r, "Type") || "1";
    if (type === "2") {
      warn("Bỏ qua nguồn lực chi phí (Cost resource).");
      continue;
    }
    const group = str(r, "Group").toLocaleLowerCase("vi");
    const resource: Resource = {
      id: `r${uid}`,
      name: name.slice(0, 200),
      kind:
        type === "0"
          ? "material"
          : group === EQUIPMENT_GROUP.toLocaleLowerCase("vi") ||
              group === "equipment"
            ? "equipment"
            : "engineer",
      capacityHours: Math.min(24, Math.max(0.01, num(r, "MaxUnits", 1) * 8)),
    };
    resources.push(resource);
    resourceByUid.set(uid, resource);
  }

  // Tasks and hierarchy from OutlineLevel
  const taskNodes = list(root.Tasks as Node, "Task").filter(
    (t) =>
      str(t, "UID") !== "0" && num(t, "OutlineLevel", 1) > 0 && str(t, "Name"),
  );
  if (taskNodes.length > 5000) throw new Error("Tệp có hơn 5.000 công việc.");
  const tasks: Task[] = [];
  const idByUid = new Map<string, string>();
  const stack: { level: number; id: string }[] = [];
  const minutesPerDay = num(root, "MinutesPerDay", 480) || 480;
  for (const node of taskNodes) {
    const uid = str(node, "UID");
    const id = `t${uid}`;
    idByUid.set(uid, id);
    const level = Math.max(1, num(node, "OutlineLevel", 1));
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    const parentId = stack.length ? stack[stack.length - 1].id : null;
    stack.push({ level, id });
    // MSPDI durations are work minutes on its own day length; ForgePlan uses
    // 8-hour days, rounded to whole minutes (1/480 day).
    const minutes = Math.round(
      (durationMinutes(str(node, "Duration")) / minutesPerDay) * 480,
    );
    const physical = str(node, "PhysicalPercentComplete")
      ? num(node, "PhysicalPercentComplete")
      : num(node, "PercentComplete");
    const task: Task = {
      id,
      parentId,
      name: str(node, "Name").slice(0, 500),
      duration: Math.max(0, minutes) / 480,
      physicalPct: Math.min(100, Math.max(0, physical)),
      assignments: [],
    };
    const constraint = str(node, "ConstraintType");
    if (["2", "4"].includes(constraint) && str(node, "ConstraintDate")) {
      task.requestedStartDate = dateOf(str(node, "ConstraintDate"));
      if (constraint === "2")
        warn("Ràng buộc “Must Start On” được nhập thành “bắt đầu sớm nhất”.");
    } else if (str(node, "Manual") === "1" && str(node, "Start"))
      task.requestedStartDate = dateOf(str(node, "Start"));
    else if (!["", "0"].includes(constraint))
      warn(
        "Một số ràng buộc khác ASAP/SNET/MSO không được hỗ trợ và đã bỏ qua.",
      );
    if (str(node, "Deadline")) task.deadline = dateOf(str(node, "Deadline"));
    if (str(node, "Notes")) task.notes = str(node, "Notes");
    if (num(node, "FixedCost") > 0) task.budgetCost = num(node, "FixedCost");
    if (num(node, "ActualCost") > 0) task.actualCost = num(node, "ActualCost");
    tasks.push(task);
  }
  const parents = new Set(tasks.map((t) => t.parentId));
  const leaf = (id: string) => !parents.has(id);
  for (const t of tasks)
    if (!leaf(t.id)) {
      // Summary values are rolled up by the engine.
      delete t.requestedStartDate;
      delete t.deadline;
      t.physicalPct = 0;
    }

  // Links
  const dependencies: Dependency[] = [];
  const pairs = new Set<string>();
  for (const node of taskNodes) {
    const successorId = idByUid.get(str(node, "UID"))!;
    for (const link of list(node, "PredecessorLink")) {
      const predecessorId = idByUid.get(str(link, "PredecessorUID"));
      if (!predecessorId || predecessorId === successorId) continue;
      if (!leaf(predecessorId) || !leaf(successorId)) {
        warn(
          "Bỏ qua liên kết tới công việc tổng hợp (summary); ForgePlan chỉ liên kết công việc lá.",
        );
        continue;
      }
      const key = `${predecessorId}\0${successorId}`;
      if (pairs.has(key)) continue;
      pairs.add(key);
      const format = str(link, "LagFormat");
      if (["19", "20"].includes(format))
        warn("Lag theo % không được hỗ trợ; đã quy về 0.");
      dependencies.push({
        id: `l${dependencies.length + 1}`,
        predecessorId,
        successorId,
        type: FROM_MSP_LINK[str(link, "Type") || "1"] ?? "FS",
        lagDays: ["19", "20"].includes(format)
          ? 0
          : Math.round((num(link, "LinkLag") / 10 / minutesPerDay) * 480) / 480,
      });
    }
  }

  // Assignments (leaf tasks only)
  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const a of list(root.Assignments as Node, "Assignment")) {
    const task = byId.get(idByUid.get(str(a, "TaskUID")) ?? "");
    const resource = resourceByUid.get(str(a, "ResourceUID"));
    if (!task || !resource) continue;
    if (!leaf(task.id)) {
      warn("Bỏ qua phân công trên công việc tổng hợp.");
      continue;
    }
    if (task.assignments.some((x) => x.resourceId === resource.id)) continue;
    const units = num(a, "Units", 1);
    task.assignments.push(
      resource.kind === "material"
        ? { resourceId: resource.id, units: 1, quantity: Math.max(0, units) }
        : {
            resourceId: resource.id,
            units: Math.min(4, Math.max(0.01, units)),
          },
    );
  }

  // Baselines (numbers 0–10)
  const baselineTasks = new Map<number, Baseline["tasks"]>();
  for (const node of taskNodes)
    for (const b of list(node, "Baseline")) {
      const n = num(b, "Number", -1);
      if (n < 0 || n > 10 || !str(b, "Start") || !str(b, "Finish")) continue;
      const start = str(b, "Start"),
        finish = str(b, "Finish");
      try {
        const id = idByUid.get(str(node, "UID"))!;
        const entry = {
          id,
          isSummary: !leaf(id),
          startDate: dateOf(start),
          endDate: dateOf(finish),
          startAt: `${start.slice(0, 19)}+07:00`,
          finishAt: `${finish.slice(0, 19)}+07:00`,
          duration:
            Math.round(
              (durationMinutes(str(b, "Duration")) / minutesPerDay) * 480,
            ) / 480,
          physicalPct: 0,
          workHours: 0,
          ...(num(b, "FixedCost") > 0
            ? { budgetCost: num(b, "FixedCost") }
            : {}),
        };
        (baselineTasks.get(n) ?? baselineTasks.set(n, []).get(n)!).push(entry);
      } catch {
        warn("Bỏ qua baseline có ngày không hợp lệ.");
      }
    }
  const baselines: Baseline[] = [...baselineTasks.entries()]
    .sort(([a], [b]) => a - b)
    .map(([n, entries]) => ({
      id: `baseline-${n}`,
      name: `Baseline ${n}`,
      createdAt: new Date().toISOString(),
      calendar: structuredClone(calendar),
      tasks: entries,
    }));

  const startDate = str(root, "StartDate")
    ? dateOf(str(root, "StartDate"))
    : (tasks.find((t) => t.requestedStartDate)?.requestedStartDate ??
      new Date().toISOString().slice(0, 10));
  const project: ProjectInput = {
    id: "imported",
    name: (
      str(root, "Title") ||
      str(root, "Name").replace(/\.xml$/i, "") ||
      "Dự án MS Project"
    ).slice(0, 200),
    contractCode: str(root, "Subject").slice(0, 80) || undefined,
    client: str(root, "Company").slice(0, 200) || undefined,
    startDate,
    statusDate: str(root, "StatusDate")
      ? dateOf(str(root, "StatusDate"))
      : startDate,
    calendar,
    tasks,
    dependencies,
    resources,
    ...(baselines.length
      ? { baselines, activeBaselineId: baselines[0].id }
      : {}),
  };
  if (!project.contractCode) delete project.contractCode;
  if (!project.client) delete project.client;
  return { project, warnings };
}
