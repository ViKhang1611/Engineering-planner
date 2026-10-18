import { cpus, platform, release } from "node:os";
import { createLargeProject } from "../src/modules/schedule/data/seed";
import { scheduleProject } from "../src/modules/schedule/engine/schedulingEngine";
const input = createLargeProject();
for (let i = 0; i < 3; i++) scheduleProject(input);
const times = Array.from(
  { length: 20 },
  () => scheduleProject(input).elapsedMs,
).sort((a, b) => a - b);
const linked = structuredClone(input);
const leaf = linked.tasks.filter((task) => task.parentId);
for (let i = 1; i < leaf.length; i++)
  if (i % 20 !== 0)
    linked.dependencies.push({
      id: `link-${i}`,
      predecessorId: leaf[i - 1].id,
      successorId: leaf[i].id,
      type: "FS",
      lagDays: 0,
    });
const linkedTimes = Array.from(
  { length: 10 },
  () => scheduleProject(linked).elapsedMs,
).sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      environment: {
        node: process.version,
        os: `${platform()} ${release()}`,
        cpu: cpus()[0].model,
        logicalCpus: cpus().length,
      },
      independent: {
        tasks: input.tasks.length,
        links: 0,
        iterations: 20,
        medianMs: times[10],
        p95Ms: times[18],
      },
      linked: {
        tasks: linked.tasks.length,
        links: linked.dependencies.length,
        iterations: 10,
        medianMs: linkedTimes[5],
        p95Ms: linkedTimes[9],
      },
      note: "Engine timings only; these are not browser frame rate measurements.",
    },
    null,
    2,
  ),
);
