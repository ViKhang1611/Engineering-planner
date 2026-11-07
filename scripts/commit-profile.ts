/**
 * Profiles one schedule edit end to end on the 5,000-task demo plan, split by
 * step, to see what a commit costs beyond the CPM engine itself.
 * Run: node --import tsx scripts/commit-profile.ts
 */
import { createLargeProject } from "../src/modules/schedule/data/seed";
import { scheduleProject } from "../src/modules/schedule/engine/schedulingEngine";
import {
  normalizeExecution,
  overallProgress,
  validateExtensions,
} from "../src/domain/execution";
import {
  cloneForCommit,
  createScheduleSession,
} from "../src/modules/schedule/model/createScheduleSession";

const base = createLargeProject();
const leaf = base.tasks.filter((t) => t.parentId);
for (let i = 1; i < leaf.length; i++)
  if (i % 20 !== 0)
    base.dependencies.push({
      id: `link-${i}`,
      predecessorId: leaf[i - 1].id,
      successorId: leaf[i].id,
      type: "FS",
      lagDays: 0,
    });

function median(run: () => void, n = 15) {
  for (let i = 0; i < 3; i++) run();
  const t: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = performance.now();
    run();
    t.push(performance.now() - s);
  }
  return +t.sort((a, b) => a - b)[n >> 1].toFixed(2);
}

const steps = {
  structuredClone: median(() => structuredClone(base)),
  normalizeExecution: median(() => normalizeExecution(structuredClone(base))) -
    median(() => structuredClone(base)),
  validateExtensions: median(() => validateExtensions(base)),
  scheduleProject: median(() => scheduleProject(base)),
  overallProgress: (() => {
    const r = scheduleProject(base);
    return median(() => overallProgress(r.tasks));
  })(),
};

let state: ReturnType<typeof createScheduleSession>;
const set = (p: object | ((s: typeof state) => object)) => {
  state = { ...state, ...(typeof p === "function" ? p(state) : p) };
};
state = createScheduleSession(set as never, () => state, {
  project: base,
  baseline: null,
});
let d = 1;
const fullCommit = median(() => {
  state.updateTask(leaf[10].id, { duration: (d++ % 5) + 1 });
});

// Same edit with three captured baselines (each a snapshot of every task).
for (let i = 0; i < 3; i++) state.captureBaseline();
const withBaselines = median(() => {
  state.updateTask(leaf[10].id, { duration: (d++ % 5) + 1 });
});
const cloneAll = median(() => structuredClone(state.project));
const cloneShared = median(() => cloneForCommit(state.project));

console.log(
  JSON.stringify(
    {
      tasks: base.tasks.length,
      links: base.dependencies.length,
      stepsMedianMs: steps,
      fullUpdateTaskMedianMs: fullCommit,
      withThreeBaselines: {
        fullUpdateTaskMedianMs: withBaselines,
        deepCloneEverythingMs: cloneAll,
        cloneSharingBaselinesMs: cloneShared,
      },
    },
    null,
    2,
  ),
);
