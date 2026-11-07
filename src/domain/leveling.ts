import type { Dependency, ProjectInput, ResourceDay, Task } from "./project";
import {
  MINUTES_PER_DAY,
  scheduleProject,
  WorkingClock,
} from "../modules/schedule/engine/schedulingEngine";

export interface LevelingChange {
  taskId: string;
  name: string;
  /** Current scheduled start. */
  fromStart: string;
  /** Suggested "start no earlier than" date. */
  toStart: string;
}
export interface LevelingSuggestion {
  changes: LevelingChange[];
  finishBefore: string;
  finishAfter: string;
  overloadsBefore: number;
  overloadsAfter: number;
  /** Days where one task alone exceeds a resource's capacity (cannot be fixed by delaying). */
  unresolvable: ResourceDay[];
  /** True when a task could not be placed within the search horizon. */
  truncated: boolean;
}

/** Same edge offsets as the CPM engine, in working minutes. */
function edgeWeight(link: Dependency, a: number, b: number) {
  const lag = Math.round(link.lagDays * MINUTES_PER_DAY);
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

/** Minimal binary heap keyed by a comparator. */
class Heap<T> {
  private items: T[] = [];
  constructor(private before: (a: T, b: T) => boolean) {}
  get size() {
    return this.items.length;
  }
  push(item: T) {
    const a = this.items;
    a.push(item);
    for (let i = a.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (!this.before(a[i], a[p])) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop(): T {
    const a = this.items,
      top = a[0],
      last = a.pop()!;
    if (a.length) {
      a[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1,
          r = l + 1;
        let m = i;
        if (l < a.length && this.before(a[l], a[m])) m = l;
        if (r < a.length && this.before(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Resource leveling by serial schedule generation, non-preemptive.
 *
 * Leaf tasks are taken in dependency order; among those whose predecessors
 * are placed, the one with the earliest CPM start (then least float) goes
 * first. Each is placed at the earliest working-minute start that satisfies
 * its links to already-placed predecessors and its "start no earlier than"
 * date, then pushed day by day until every assigned engineer/equipment has
 * capacity for its whole span. Tasks are only ever delayed; a delay becomes
 * a "start no earlier than" date. Nothing is applied: callers preview and
 * commit the changes in one step.
 */
export function suggestLeveling(
  project: ProjectInput,
  horizonDays = 3650,
): LevelingSuggestion {
  const initial = scheduleProject(project);
  const scheduled = new Map(initial.tasks.map((t) => [t.id, t]));
  const clock = new WorkingClock(project.startDate, project.calendar);
  const parents = new Set(project.tasks.map((t) => t.parentId));
  const leaves = project.tasks.filter((t) => !parents.has(t.id));
  const resources = new Map(project.resources.map((r) => [r.id, r]));
  const duration = new Map(
    leaves.map((t) => [t.id, Math.round(t.duration * MINUTES_PER_DAY)]),
  );
  const incoming = new Map<string, Dependency[]>();
  const outgoing = new Map<string, Dependency[]>();
  const indegree = new Map(leaves.map((t) => [t.id, 0]));
  for (const link of project.dependencies) {
    (
      incoming.get(link.successorId) ??
      incoming.set(link.successorId, []).get(link.successorId)!
    ).push(link);
    (
      outgoing.get(link.predecessorId) ??
      outgoing.set(link.predecessorId, []).get(link.predecessorId)!
    ).push(link);
    indegree.set(link.successorId, indegree.get(link.successorId)! + 1);
  }

  // Hours already booked per resource per working-day index.
  const booked = new Map<string, Map<number, number>>();
  const loads = (task: Task, start: number) => {
    const end = start + duration.get(task.id)!;
    const out: { resourceId: string; day: number; hours: number }[] = [];
    for (const a of task.assignments) {
      if (resources.get(a.resourceId)?.kind === "material") continue;
      for (
        let day = Math.floor(start / MINUTES_PER_DAY);
        day * MINUTES_PER_DAY < end;
        day++
      ) {
        const minutes =
          Math.min(end, (day + 1) * MINUTES_PER_DAY) -
          Math.max(start, day * MINUTES_PER_DAY);
        if (minutes > 0)
          out.push({
            resourceId: a.resourceId,
            day,
            hours: (minutes / 60) * a.units,
          });
      }
    }
    return out;
  };
  const fits = (task: Task, start: number) =>
    loads(task, start).every(({ resourceId, day, hours }) => {
      const used = booked.get(resourceId)?.get(day) ?? 0;
      const capacity = resources.get(resourceId)!.capacityHours;
      // A task that exceeds capacity on its own is placed anyway (reported).
      return used === 0 || used + hours <= capacity + 1e-6;
    });

  const byId = new Map(leaves.map((t) => [t.id, t]));
  const ready = new Heap<Task>((a, b) => {
    const sa = scheduled.get(a.id)!,
      sb = scheduled.get(b.id)!;
    return (
      (sa.earlyStart - sb.earlyStart ||
        sa.totalFloat - sb.totalFloat ||
        (a.id < b.id ? -1 : 1)) < 0
    );
  });
  for (const t of leaves) if (!indegree.get(t.id)) ready.push(t);
  const placed = new Map<string, number>();
  let truncated = false;
  while (ready.size) {
    const task = ready.pop();
    let start = Math.max(
      0,
      task.requestedStartDate ? clock.startOf(task.requestedStartDate) : 0,
    );
    for (const link of incoming.get(task.id) ?? [])
      start = Math.max(
        start,
        placed.get(link.predecessorId)! +
          edgeWeight(
            link,
            duration.get(link.predecessorId)!,
            duration.get(task.id)!,
          ),
      );
    const limit = start + horizonDays * MINUTES_PER_DAY;
    while (!fits(task, start)) {
      start = (Math.floor(start / MINUTES_PER_DAY) + 1) * MINUTES_PER_DAY;
      if (start > limit) {
        truncated = true;
        break;
      }
    }
    placed.set(task.id, start);
    for (const { resourceId, day, hours } of loads(task, start)) {
      const days =
        booked.get(resourceId) ??
        booked.set(resourceId, new Map()).get(resourceId)!;
      days.set(day, (days.get(day) ?? 0) + hours);
    }
    for (const link of outgoing.get(task.id) ?? []) {
      const n = indegree.get(link.successorId)! - 1;
      indegree.set(link.successorId, n);
      if (!n) ready.push(byId.get(link.successorId)!);
    }
  }

  // Only delays that change the start date become constraints.
  const changes: LevelingChange[] = [];
  const leveled = structuredClone(project) as ProjectInput;
  for (const task of leaves) {
    const s = scheduled.get(task.id)!;
    const start = placed.get(task.id);
    if (start === undefined || start <= s.earlyStart) continue;
    const date = clock.point(start).date;
    if (date <= s.startDate) continue;
    changes.push({
      taskId: task.id,
      name: task.name,
      fromStart: s.startDate,
      toStart: date,
    });
    leveled.tasks.find((t) => t.id === task.id)!.requestedStartDate = date;
  }
  const after = changes.length ? scheduleProject(leveled) : initial;
  const unresolvable = after.overloads.filter(
    (d) => new Set(d.taskIds).size < 2,
  );
  return {
    changes,
    finishBefore: initial.finishDate,
    finishAfter: after.finishDate,
    overloadsBefore: initial.overloads.length,
    overloadsAfter: after.overloads.length,
    unresolvable,
    truncated,
  };
}
