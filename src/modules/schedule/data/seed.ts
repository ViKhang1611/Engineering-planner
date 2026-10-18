import type { ProjectInput, Task } from "../engine/types";
const task = (
  id: string,
  parentId: string | null,
  name: string,
  duration: number,
  physicalPct = 0,
  engineers: string[] = [],
): Task => ({
  id,
  parentId,
  name,
  duration,
  physicalPct,
  ...(id === "fat"
    ? { milestoneType: "FAT" as const }
    : id === "sat"
      ? { milestoneType: "SAT" as const }
      : {}),
  assignments: engineers.map((resourceId) => ({ resourceId, units: 1 })),
});
export function createSeed(): ProjectInput {
  return {
    id: "automation-weighbridge",
    name: "Hệ thống Tự động hóa & Trạm cân Nhà máy",
    startDate: "2026-10-05",
    statusDate: "2026-10-14",
    calendar: { holidays: [] },
    resources: [
      { id: "an", name: "KS. An", kind: "engineer", capacityHours: 8 },
      { id: "binh", name: "KS. Bình", kind: "engineer", capacityHours: 8 },
      { id: "chi", name: "KS. Chi", kind: "engineer", capacityHours: 8 },
      { id: "crane", name: "Cẩu 5T", kind: "equipment", capacityHours: 8 },
    ],
    tasks: [
      task("p1", null, "Giai đoạn 1 · Thiết kế & Chế tạo", 0),
      task("survey", "p1", "Khảo sát hiện trạng & chốt yêu cầu", 2, 100, [
        "an",
      ]),
      task("drawing", "p1", "Thiết kế bản vẽ AutoCAD", 4, 100, ["an"]),
      task("bom", "p1", "Kiểm tra BOM & đặt mua thiết bị", 3, 80, ["binh"]),
      task("panel", "p1", "Lắp ráp tủ PLC & đấu nối nội bộ", 5, 55, [
        "an",
        "binh",
      ]),
      task("fat", "p1", "Nghiệm thu FAT", 0, 0),
      task("p2", null, "Giai đoạn 2 · Lắp đặt & Chạy thử", 0),
      task("loadcell", "p2", "Lắp đặt Loadcell & cân chỉnh cơ khí", 3, 25, [
        "chi",
        "crane",
      ]),
      task("plc", "p2", "Lập trình PLC / SCADA", 6, 45, ["an"]),
      task("loop", "p2", "Chạy thử liên động & hiệu chuẩn", 3, 0, [
        "an",
        "chi",
      ]),
      task("training", "p2", "Đào tạo vận hành & hồ sơ hoàn công", 2, 0, [
        "binh",
      ]),
      task("sat", "p2", "Nghiệm thu SAT & bàn giao", 0, 0),
    ],
    dependencies: [
      {
        id: "d1",
        predecessorId: "survey",
        successorId: "drawing",
        type: "FS",
        lagDays: 0,
      },
      {
        id: "d2",
        predecessorId: "drawing",
        successorId: "bom",
        type: "SS",
        lagDays: 1,
      },
      {
        id: "d3",
        predecessorId: "drawing",
        successorId: "panel",
        type: "FS",
        lagDays: 0,
      },
      {
        id: "d4",
        predecessorId: "bom",
        successorId: "panel",
        type: "FS",
        lagDays: 0,
      },
      {
        id: "d5",
        predecessorId: "panel",
        successorId: "fat",
        type: "FS",
        lagDays: 0,
      },
      {
        id: "d6",
        predecessorId: "fat",
        successorId: "loadcell",
        type: "FS",
        lagDays: 0,
      },
      {
        id: "d7",
        predecessorId: "panel",
        successorId: "plc",
        type: "SS",
        lagDays: 2,
      },
      {
        id: "d8",
        predecessorId: "loadcell",
        successorId: "loop",
        type: "FS",
        lagDays: 0,
      },
      {
        id: "d9",
        predecessorId: "plc",
        successorId: "loop",
        type: "FS",
        lagDays: 0,
      },
      {
        id: "d10",
        predecessorId: "loop",
        successorId: "training",
        type: "SS",
        lagDays: 1,
      },
      {
        id: "d11",
        predecessorId: "loop",
        successorId: "sat",
        type: "FS",
        lagDays: 0,
      },
      {
        id: "d12",
        predecessorId: "training",
        successorId: "sat",
        type: "FS",
        lagDays: 0,
      },
    ],
  };
}
export function createLargeProject(count = 5000): ProjectInput {
  const project = createSeed();
  project.id = "performance-fixture";
  project.name = `Kiểm chứng hiệu năng · ${count.toLocaleString("vi-VN")} công việc`;
  project.tasks = [];
  project.dependencies = [];
  for (let i = 0; i < count; i++) {
    if (i % 100 === 0)
      project.tasks.push(
        task(`t${i}`, null, `Gói kỹ thuật ${Math.floor(i / 100) + 1}`, 0),
      );
    else {
      const row = task(
        `t${i}`,
        `t${i - (i % 100)}`,
        `Thiết bị ${String(i).padStart(4, "0")} · Kiểm tra tín hiệu & lập trình`,
        1 + (i % 6),
        i % 101,
        i % 10 === 0 ? ["an"] : [],
      );
      row.requestedStartDate = `2026-10-${String(5 + (i % 20)).padStart(2, "0")}`;
      project.tasks.push(row);
    }
  }
  return project;
}
