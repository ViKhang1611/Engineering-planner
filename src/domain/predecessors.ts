import type { ProjectInput, ScheduledTask, DependencyType } from "./project";
export function setPredecessors(
  project: ProjectInput,
  scheduled: ScheduledTask[],
  id: string,
  value: string,
) {
  const links = value.trim()
    ? value.split(/[,;]/).map((raw) => {
        const match = raw
          .trim()
          .match(/^(\d+(?:\.\d+)*)(FS|SS|FF|SF)?([+-]\d+(?:\.\d+)?)?d?$/i);
        if (!match)
          throw new Error(
            `Tiền nhiệm không hợp lệ: ${raw}. Ví dụ: 1.2FS+2, 2SS-1`,
          );
        const predecessor = scheduled.find((t) => t.wbs === match[1]);
        if (!predecessor) throw new Error(`Không có WBS ${match[1]}`);
        return {
          id: crypto.randomUUID(),
          predecessorId: predecessor.id,
          successorId: id,
          type: (match[2]?.toUpperCase() ?? "FS") as DependencyType,
          lagDays: Number(match[3] ?? 0),
        };
      })
    : [];
  project.dependencies = [
    ...project.dependencies.filter((l) => l.successorId !== id),
    ...links,
  ];
}
