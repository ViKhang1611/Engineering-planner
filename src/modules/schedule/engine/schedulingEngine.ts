import type {
  Calendar,
  Dependency,
  ProjectInput,
  ResourceDay,
  ScheduledTask,
  ScheduleResult,
  Task,
} from "./types";
export const MINUTES_PER_DAY = 480;
const DAY_MS = 86_400_000;
export class SchedulingError extends Error {
  constructor(
    public code: string,
    message: string,
    public taskIds: string[] = [],
  ) {
    super(message);
    this.name = "SchedulingError";
  }
}
/**
 * Validated ISO date → UTC midnight in ms. Date math dominated engine time
 * (regex + Date + toISOString on every working-day step), and a plan only
 * touches a few thousand distinct dates, so each string is validated once.
 * Bounded so a long-running session cannot grow it without limit.
 */
const dateMsCache = new Map<string, number>();
const DATE_CACHE_LIMIT = 100_000;
function dateMs(value: string): number {
  const cached = dateMsCache.get(value);
  if (cached !== undefined) return cached;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new SchedulingError("INVALID_DATE", `Ngày không hợp lệ: ${value}`);
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value)
    throw new SchedulingError("INVALID_DATE", `Ngày không tồn tại: ${value}`);
  if (dateMsCache.size >= DATE_CACHE_LIMIT) dateMsCache.clear();
  dateMsCache.set(value, ms);
  return ms;
}
/** Validates an ISO date (YYYY-MM-DD) and returns a fresh Date at UTC midnight. */
export function parseDate(value: string): Date {
  return new Date(dateMs(value));
}
export const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const isoFromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export function addCalendarDays(value: string, days: number): string {
  return isoFromMs(dateMs(value) + days * DAY_MS);
}
export function calendarDaysBetween(a: string, b: string): number {
  return Math.round((dateMs(b) - dateMs(a)) / DAY_MS);
}
/** Monday–Saturday, the default work week (0 = Sunday). */
export const DEFAULT_WORK_WEEK: readonly number[] = [1, 2, 3, 4, 5, 6];
export const DEFAULT_SHIFT = { morningStart: "08:00", afternoonStart: "13:00" };
/** Lookup Sets cached per array (arrays are replaced, not mutated, on edit). */
const setCache = new WeakMap<
  readonly (string | number)[],
  { size: number; set: Set<string | number> }
>();
function cachedSet<T extends string | number>(list: readonly T[]): Set<T> {
  const cached = setCache.get(list);
  // Length check guards against an array mutated in place after caching.
  if (cached && cached.size === list.length) return cached.set as Set<T>;
  const set = new Set<T>(list);
  setCache.set(list, { size: list.length, set });
  return set;
}
/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(value: string): number {
  // Days since 1970-01-01 (a Thursday); +4 maps it to 0 = Sunday.
  const days = Math.floor(dateMs(value) / DAY_MS);
  return (((days + 4) % 7) + 7) % 7;
}
export function isWorkingDay(value: string, calendar: Calendar): boolean {
  if (cachedSet(calendar.holidays).has(value)) return false;
  if (
    calendar.extraWorkingDays &&
    cachedSet(calendar.extraWorkingDays).has(value)
  )
    return true;
  return cachedSet(calendar.workWeek ?? DEFAULT_WORK_WEEK).has(
    weekdayOf(value),
  );
}
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const toMinutes = (value: string) => {
  const match = TIME.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
};
/** Wall-clock minutes of day at which the morning and afternoon blocks start. */
export function shiftMinutes(calendar: Pick<Calendar, "shift">): {
  morning: number;
  afternoon: number;
} {
  const shift = calendar.shift ?? DEFAULT_SHIFT;
  return {
    morning: toMinutes(shift.morningStart),
    afternoon: toMinutes(shift.afternoonStart),
  };
}
/** Throws SchedulingError when the calendar cannot drive a schedule. */
export function validateCalendar(calendar: Calendar) {
  const fail = (message: string): never => {
    throw new SchedulingError("INVALID_CALENDAR", message);
  };
  if (!calendar || !Array.isArray(calendar.holidays))
    fail("Lịch làm việc không hợp lệ.");
  calendar.holidays.forEach(parseDate);
  if (calendar.workWeek !== undefined) {
    const week = calendar.workWeek;
    if (
      !Array.isArray(week) ||
      !week.length ||
      week.some((d) => !Number.isInteger(d) || d < 0 || d > 6) ||
      new Set(week).size !== week.length
    )
      fail("Chọn ít nhất một ngày làm việc trong tuần (T2–CN, không trùng).");
  }
  if (calendar.extraWorkingDays !== undefined) {
    if (!Array.isArray(calendar.extraWorkingDays))
      fail("Danh sách ngày làm bù không hợp lệ.");
    calendar.extraWorkingDays.forEach(parseDate);
  }
  if (calendar.shift !== undefined) {
    const { morning, afternoon } = shiftMinutes(calendar);
    if (!Number.isFinite(morning) || !Number.isFinite(afternoon))
      fail("Giờ bắt đầu ca phải theo dạng HH:MM.");
    if (afternoon < morning + 240)
      fail("Ca chiều phải bắt đầu sau khi ca sáng (4 giờ) kết thúc.");
    if (afternoon + 240 > 24 * 60)
      fail("Ca chiều (4 giờ) phải kết thúc trong ngày.");
  }
}
export function nextWorkingDate(value: string, calendar: Calendar): string {
  let date = value;
  for (let i = 0; i < 36600; i++) {
    if (isWorkingDay(date, calendar)) return date;
    date = addCalendarDays(date, 1);
  }
  throw new SchedulingError(
    "CALENDAR_RANGE",
    "Không tìm thấy ngày làm việc trong 100 năm.",
  );
}
/** A project-local working-minute axis. Only working minutes exist on this axis.
 * Intervals are [start, finish). At 480 minutes, a start is the next working
 * day's morning start, but a finish is the preceding day's afternoon end.
 * The break between the two 4-hour blocks is excluded (default 12:00–13:00). */
export class WorkingClock {
  private dates: string[] = [];
  private indices = new Map<string, number>();
  private shift: { morning: number; afternoon: number };
  constructor(
    public epoch: string,
    public calendar: Calendar,
  ) {
    validateCalendar(calendar);
    this.shift = shiftMinutes(calendar);
    this.epoch = nextWorkingDate(epoch, calendar);
    this.dates.push(this.epoch);
    this.indices.set(this.epoch, 0);
  }
  dateAt(index: number): string {
    if (!Number.isFinite(index) || Math.abs(index) > 31200)
      throw new SchedulingError(
        "SCHEDULE_RANGE",
        "Tiến độ vượt giới hạn 100 năm.",
      );
    if (index < 0) {
      let date = this.epoch,
        count = 0;
      while (count > index) {
        date = addCalendarDays(date, -1);
        if (isWorkingDay(date, this.calendar)) count--;
      }
      return date;
    }
    while (this.dates.length <= index) {
      const date = nextWorkingDate(
        addCalendarDays(this.dates[this.dates.length - 1], 1),
        this.calendar,
      );
      this.indices.set(date, this.dates.length);
      this.dates.push(date);
    }
    return this.dates[index];
  }
  startOf(value: string): number {
    const date = nextWorkingDate(value, this.calendar);
    if (date < this.epoch) {
      let cursor = date,
        count = 0;
      while (cursor < this.epoch) {
        cursor = nextWorkingDate(addCalendarDays(cursor, 1), this.calendar);
        count--;
      }
      return count * MINUTES_PER_DAY;
    }
    while (this.dates[this.dates.length - 1] < date)
      this.dateAt(this.dates.length);
    return this.indices.get(date)! * MINUTES_PER_DAY;
  }
  point(minutes: number, finish = false): { date: string; at: string } {
    let day = Math.floor(minutes / MINUTES_PER_DAY),
      minute =
        ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    if (finish && minute === 0) {
      day--;
      minute = MINUTES_PER_DAY;
    }
    const date = this.dateAt(day);
    const wall =
      minute < 240 || (finish && minute === 240)
        ? this.shift.morning + minute
        : this.shift.afternoon + minute - 240;
    return {
      date,
      at: `${date}T${String(Math.floor(wall / 60)).padStart(2, "0")}:${String(wall % 60).padStart(2, "0")}:00+07:00`,
    };
  }
}
function assertNumber(
  value: number,
  min: number,
  max: number,
  label: string,
  id?: string,
) {
  if (!Number.isFinite(value) || value < min || value > max)
    throw new SchedulingError(
      "INVALID_VALUE",
      `${label} phải từ ${min} đến ${max}.`,
      id ? [id] : [],
    );
}
function edgeWeight(link: Dependency, durations: Map<string, number>): number {
  const a = durations.get(link.predecessorId)!,
    b = durations.get(link.successorId)!,
    lag = Math.round(link.lagDays * MINUTES_PER_DAY);
  switch (link.type) {
    case "FS":
      return a + lag;
    case "SS":
      return lag;
    case "FF":
      return a - b + lag;
    case "SF":
      return -b + lag;
  }
}
/** Pure, transactional calculation: input objects are never changed. All temporal
 * values ES/EF/LS/LF/float use working minutes, never elapsed calendar minutes. */
export function scheduleProject(input: ProjectInput): ScheduleResult {
  const started = performance.now();
  if (
    !input ||
    typeof input.id !== "string" ||
    typeof input.name !== "string" ||
    !input.name.trim() ||
    !Array.isArray(input.tasks) ||
    !Array.isArray(input.dependencies) ||
    !Array.isArray(input.resources) ||
    !input.calendar ||
    !Array.isArray(input.calendar.holidays)
  )
    throw new SchedulingError(
      "INVALID_PROJECT",
      "Cấu trúc dự án không hợp lệ.",
    );
  if (input.tasks.length > 5000)
    throw new SchedulingError("TASK_LIMIT", "Tối đa 5.000 công việc/dự án.");
  if (input.dependencies.length > 50000)
    throw new SchedulingError("LINK_LIMIT", "Tối đa 50.000 liên kết/dự án.");
  parseDate(input.startDate);
  parseDate(input.statusDate);
  const clock = new WorkingClock(input.startDate, input.calendar);
  const byId = new Map<string, Task>(),
    children = new Map<string | null, Task[]>();
  const resourceIds = new Set<string>();
  for (const resource of input.resources) {
    if (
      !resource ||
      typeof resource.id !== "string" ||
      !resource.id ||
      typeof resource.name !== "string" ||
      !resource.name.trim() ||
      !["engineer", "equipment", "material"].includes(resource.kind)
    )
      throw new SchedulingError("INVALID_RESOURCE", "Nguồn lực không hợp lệ.");
    if (resourceIds.has(resource.id))
      throw new SchedulingError("DUPLICATE_RESOURCE", "ID nguồn lực bị trùng.");
    resourceIds.add(resource.id);
    assertNumber(resource.capacityHours, 0.01, 24, "Năng lực nguồn lực");
  }
  for (const task of input.tasks) {
    if (
      !task ||
      typeof task.id !== "string" ||
      typeof task.name !== "string" ||
      !(task.parentId === null || typeof task.parentId === "string") ||
      !Array.isArray(task.assignments)
    )
      throw new SchedulingError(
        "INVALID_TASK",
        "Cấu trúc công việc không hợp lệ.",
      );
    if (!task.id || byId.has(task.id))
      throw new SchedulingError(
        "DUPLICATE_TASK",
        "ID công việc thiếu hoặc trùng.",
        [task.id],
      );
    if (!task.name.trim())
      throw new SchedulingError(
        "INVALID_NAME",
        "Tên công việc không được trống.",
        [task.id],
      );
    byId.set(task.id, task);
    assertNumber(task.duration, 0, 31200, "Thời lượng", task.id);
    assertNumber(task.physicalPct, 0, 100, "Physical %", task.id);
    if (Math.abs(task.duration * 480 - Math.round(task.duration * 480)) > 1e-6)
      throw new SchedulingError(
        "DURATION_PRECISION",
        "Thời lượng phải quy đổi được thành phút nguyên.",
        [task.id],
      );
    if (task.requestedStartDate) parseDate(task.requestedStartDate);
    if (task.deadline !== undefined) parseDate(task.deadline);
    const assigned = new Set<string>();
    for (const assignment of task.assignments) {
      if (
        !resourceIds.has(assignment.resourceId) ||
        assigned.has(assignment.resourceId)
      )
        throw new SchedulingError(
          "INVALID_ASSIGNMENT",
          "Nguồn lực không tồn tại hoặc được gán trùng.",
          [task.id],
        );
      assertNumber(assignment.units, 0.01, 4, "Tỷ lệ phân bổ", task.id);
      assigned.add(assignment.resourceId);
    }
    const group = children.get(task.parentId) ?? [];
    group.push(task);
    children.set(task.parentId, group);
  }
  for (const task of input.tasks)
    if (task.parentId !== null && !byId.has(task.parentId))
      throw new SchedulingError(
        "INVALID_PARENT",
        "Không tìm thấy công việc cha.",
        [task.id],
      );
  const ordered: { task: Task; wbs: string; depth: number }[] = [];
  const stack = (children.get(null) ?? [])
    .map((task, index) => ({ task, wbs: String(index + 1), depth: 0 }))
    .reverse();
  while (stack.length) {
    const item = stack.pop()!;
    ordered.push(item);
    const list = children.get(item.task.id) ?? [];
    for (let i = list.length - 1; i >= 0; i--)
      stack.push({
        task: list[i],
        wbs: `${item.wbs}.${i + 1}`,
        depth: item.depth + 1,
      });
  }
  if (ordered.length !== input.tasks.length)
    throw new SchedulingError("WBS_CYCLE", "Cây WBS chứa vòng lặp cha–con.");
  const leaves = input.tasks.filter((task) => !children.has(task.id));
  const durations = new Map(
    leaves.map((task) => [
      task.id,
      Math.round(task.duration * MINUTES_PER_DAY),
    ]),
  );
  const outgoing = new Map<string, Dependency[]>(),
    indegree = new Map(leaves.map((task) => [task.id, 0]));
  const pairs = new Set<string>(),
    linkIds = new Set<string>();
  for (const link of input.dependencies) {
    if (!link || typeof link.id !== "string" || !link.id)
      throw new SchedulingError("INVALID_LINK", "ID liên kết không hợp lệ.");
    if (!durations.has(link.predecessorId) || !durations.has(link.successorId))
      throw new SchedulingError(
        "INVALID_LINK",
        "Chỉ liên kết công việc lá/cột mốc; không liên kết summary.",
        [link.predecessorId, link.successorId],
      );
    if (link.predecessorId === link.successorId)
      throw new SchedulingError(
        "SELF_LINK",
        "Không thể tự liên kết công việc.",
        [link.predecessorId],
      );
    if (!["FS", "SS", "FF", "SF"].includes(link.type))
      throw new SchedulingError(
        "INVALID_LINK_TYPE",
        "Loại liên kết không hợp lệ.",
      );
    assertNumber(link.lagDays, -31200, 31200, "Lead/lag");
    const key = `${link.predecessorId}\0${link.successorId}`;
    if (pairs.has(key) || linkIds.has(link.id))
      throw new SchedulingError("DUPLICATE_LINK", "Liên kết bị trùng.");
    pairs.add(key);
    linkIds.add(link.id);
    indegree.set(link.successorId, indegree.get(link.successorId)! + 1);
    const list = outgoing.get(link.predecessorId) ?? [];
    list.push(link);
    outgoing.set(link.predecessorId, list);
  }
  const queue = leaves
      .filter((task) => indegree.get(task.id) === 0)
      .map((task) => task.id),
    topological: string[] = [];
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head];
    topological.push(id);
    for (const link of outgoing.get(id) ?? []) {
      const n = indegree.get(link.successorId)! - 1;
      indegree.set(link.successorId, n);
      if (!n) queue.push(link.successorId);
    }
  }
  if (topological.length !== leaves.length)
    throw new SchedulingError(
      "DEPENDENCY_CYCLE",
      "Liên kết tạo vòng lặp phụ thuộc.",
      leaves
        .filter((task) => indegree.get(task.id)! > 0)
        .map((task) => task.id),
    );
  const early = new Map(
    leaves.map((task) => [
      task.id,
      Math.max(
        0,
        task.requestedStartDate ? clock.startOf(task.requestedStartDate) : 0,
      ),
    ]),
  );
  let finish = 0;
  for (const id of topological) {
    finish = Math.max(finish, early.get(id)! + durations.get(id)!);
    for (const link of outgoing.get(id) ?? [])
      early.set(
        link.successorId,
        Math.max(
          early.get(link.successorId)!,
          early.get(id)! + edgeWeight(link, durations),
        ),
      );
  }
  // End of the last working day on or before each deadline: the start of
  // the first working day after it, on the working-minute axis.
  const deadlineFinish = new Map<string, number>();
  for (const task of leaves)
    if (task.deadline)
      deadlineFinish.set(
        task.id,
        clock.startOf(addCalendarDays(task.deadline, 1)),
      );
  const late = new Map(
    leaves.map((task) => [
      task.id,
      Math.min(finish, deadlineFinish.get(task.id) ?? finish) -
        durations.get(task.id)!,
    ]),
  );
  for (let i = topological.length - 1; i >= 0; i--) {
    const id = topological[i];
    for (const link of outgoing.get(id) ?? [])
      late.set(
        id,
        Math.min(
          late.get(id)!,
          late.get(link.successorId)! - edgeWeight(link, durations),
        ),
      );
  }
  const daily = new Map<string, ResourceDay>();
  const resources = new Map(
    input.resources.map((resource) => [resource.id, resource]),
  );
  const computed = new Map<string, ScheduledTask>();
  const statusEnd =
    clock.startOf(input.statusDate) +
    (isWorkingDay(input.statusDate, input.calendar) ? MINUTES_PER_DAY : 0);
  const weights = new Map<
    string,
    {
      weight: number;
      physical: number;
      elapsed: number;
      milestones: number;
      done: number;
    }
  >();
  for (let i = ordered.length - 1; i >= 0; i--) {
    const { task, wbs, depth } = ordered[i],
      list = children.get(task.id),
      isSummary = Boolean(list);
    let es: number,
      ef: number,
      ls: number,
      lf: number,
      physicalPct = task.physicalPct,
      durationPct: number,
      workHours = 0;
    if (list) {
      const parts = list.map((child) => computed.get(child.id)!);
      es = Math.min(...parts.map((child) => child.earlyStart));
      ef = Math.max(...parts.map((child) => child.earlyFinish));
      ls = es;
      lf = ef;
      const weight = {
        weight: 0,
        physical: 0,
        elapsed: 0,
        milestones: 0,
        done: 0,
      };
      for (const child of list) {
        const value = weights.get(child.id)!;
        weight.weight += value.weight;
        weight.physical += value.physical;
        weight.elapsed += value.elapsed;
        weight.milestones += value.milestones;
        weight.done += value.done;
      }
      physicalPct = weight.weight
        ? weight.physical / weight.weight
        : weight.done === weight.milestones
          ? 100
          : 0;
      durationPct = weight.weight
        ? weight.elapsed / weight.weight
        : physicalPct;
      weights.set(task.id, weight);
      workHours = parts.reduce((sum, child) => sum + child.workHours, 0);
      if (task.deadline)
        throw new SchedulingError(
          "SUMMARY_DEADLINE",
          "Đặt hạn chót cho công việc lá, không đặt cho summary.",
          [task.id],
        );
      if (task.assignments.length)
        throw new SchedulingError(
          "SUMMARY_ASSIGNMENT",
          "Gán nguồn lực vào công việc lá, không gán vào summary.",
          [task.id],
        );
    } else {
      es = early.get(task.id)!;
      ef = es + durations.get(task.id)!;
      ls = late.get(task.id)!;
      lf = ls + durations.get(task.id)!;
      durationPct =
        ef === es
          ? statusEnd > es
            ? 100
            : 0
          : Math.min(100, Math.max(0, ((statusEnd - es) / (ef - es)) * 100));
      weights.set(task.id, {
        weight: task.progressWeight ?? ef - es,
        physical: (task.progressWeight ?? ef - es) * physicalPct,
        elapsed: (task.progressWeight ?? ef - es) * durationPct,
        milestones: ef === es ? 1 : 0,
        done: ef === es && physicalPct === 100 ? 1 : 0,
      });
      for (const assignment of task.assignments) {
        const resource = resources.get(assignment.resourceId)!;
        if (resource.kind === "material") continue;
        workHours += ((ef - es) / 60) * assignment.units;
        for (
          let day = Math.floor(es / MINUTES_PER_DAY);
          day * MINUTES_PER_DAY < ef;
          day++
        ) {
          const hours =
            (Math.max(
              0,
              Math.min(ef, (day + 1) * MINUTES_PER_DAY) -
                Math.max(es, day * MINUTES_PER_DAY),
            ) /
              60) *
            assignment.units;
          const date = clock.dateAt(day),
            key = `${resource.id}\0${date}`;
          const record = daily.get(key) ?? {
            resourceId: resource.id,
            date,
            hours: 0,
            capacityHours: resource.capacityHours,
            taskIds: [],
          };
          record.hours += hours;
          record.taskIds.push(task.id);
          daily.set(key, record);
        }
      }
    }
    const start = clock.point(es),
      end = clock.point(ef, ef !== es);
    if (list) {
      const childTasks = list.map((child) => computed.get(child.id)!);
      const first = childTasks.reduce((a, b) =>
        a.startAt < b.startAt ? a : b,
      );
      const last = childTasks.reduce((a, b) =>
        a.finishAt > b.finishAt ? a : b,
      );
      start.date = first.startDate;
      start.at = first.startAt;
      end.date = last.endDate;
      end.at = last.finishAt;
    }
    computed.set(task.id, {
      ...task,
      wbs,
      depth,
      isSummary,
      duration: (ef - es) / MINUTES_PER_DAY,
      physicalPct,
      durationPct,
      startDate: start.date,
      endDate: end.date,
      startAt: start.at,
      finishAt: end.at,
      earlyStart: es,
      earlyFinish: ef,
      lateStart: ls,
      lateFinish: lf,
      totalFloat: isSummary ? 0 : ls - es,
      // Negative float (a deadline that cannot be met) is critical too.
      isCritical: !isSummary && ls - es <= 0,
      deadlineMissed:
        !isSummary &&
        deadlineFinish.has(task.id) &&
        ef > deadlineFinish.get(task.id)!,
      workHours,
      overloadedResourceIds: [],
    });
  }
  const resourceDays = [...daily.values()],
    overloads = resourceDays.filter(
      (day) => day.hours > day.capacityHours + 1e-6,
    );
  for (const day of overloads)
    for (const id of day.taskIds) {
      const task = computed.get(id)!;
      if (!task.overloadedResourceIds.includes(day.resourceId))
        task.overloadedResourceIds.push(day.resourceId);
    }
  return {
    tasks: ordered.map((item) => computed.get(item.task.id)!),
    finishDate: leaves.reduce(
      (date, task) =>
        computed.get(task.id)!.endDate > date
          ? computed.get(task.id)!.endDate
          : date,
      clock.epoch,
    ),
    durationMinutes: finish,
    resourceDays,
    overloads,
    elapsedMs: performance.now() - started,
  };
}
