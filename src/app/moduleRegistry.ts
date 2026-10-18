import {
  BarChart3,
  CalendarRange,
  Database,
  FolderKanban,
  Kanban,
  Settings2,
  Users,
} from "lucide-react";
import type { WorkspaceView } from "../domain/workspace";

export const moduleRegistry = [
  {
    id: "portfolio",
    label: "Danh mục dự án",
    icon: FolderKanban,
    phase: 1,
    description: "Danh mục và chuyển đổi dự án",
  },
  {
    id: "schedule",
    label: "Lập tiến độ",
    icon: CalendarRange,
    phase: 1,
    description: "WBS, Gantt và đường găng",
  },
  {
    id: "resources",
    label: "Nguồn lực",
    icon: Users,
    phase: 3,
    description: "Danh mục nguồn lực, tải theo ngày và xung đột phân công",
  },
  {
    id: "execution",
    label: "Thực hiện & Nghiệm thu",
    icon: Kanban,
    phase: 3,
    description: "Kanban, checklist kỹ thuật và hồ sơ FAT/SAT",
  },
  {
    id: "dashboard",
    label: "Dashboard điều hành",
    icon: BarChart3,
    phase: 4,
    description: "KPI, S-Curve và cảnh báo chênh lệch tiến độ",
  },
  {
    id: "data",
    label: "Dữ liệu & Báo cáo",
    icon: Database,
    phase: 4,
    description: "IndexedDB, xuất/nhập JSON, Excel và CSV",
  },
  {
    id: "settings",
    label: "Thiết lập dự án",
    icon: Settings2,
    phase: 1,
    description: "Hợp đồng, chủ đầu tư và lịch làm việc",
  },
] satisfies {
  id: WorkspaceView;
  label: string;
  icon: typeof FolderKanban;
  phase: number;
  description: string;
}[];
