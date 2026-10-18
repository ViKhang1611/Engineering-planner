# ForgePlan — Quản lý dự án kỹ thuật & tự động hóa

Ứng dụng React + Vite + TypeScript chạy độc lập. Bao gồm scheduling engine (bộ máy tính lịch), cây WBS (cấu trúc phân rã công việc), Tree Grid/Gantt ảo hóa, dữ liệu mẫu thực tế và bộ kiểm thử. Không cần API key.

## Chạy ngay

Cài **Node.js 22.12 trở lên** (bản đã kiểm thử: Node 24) và npm. Giải nén, mở terminal trong `engineering-planner`:

```bash
npm ci
npm run dev
```

Mở **http://127.0.0.1:5173**. Vite sẽ in địa chỉ thực tế nếu cổng đang bận. Muốn mở từ máy khác trong mạng nội bộ: `npm run dev -- --host 0.0.0.0`.

```bash
npm run build       # Kiểm tra TypeScript và build production
npm run preview     # Chạy bản production, mặc định cổng 4173
npm test            # Kiểm thử nghiệp vụ
npm run benchmark   # Đo riêng bộ máy tính lịch với 5.000 dòng
npx playwright install chromium
npm run test:e2e     # Kiểm thử giao diện bằng Chromium
```

`package-lock.json` khóa chính xác dependency đã dùng; dùng `npm ci` để tái lập. Gói đã kèm `dist/` để tham khảo bản build, nhưng nên build lại sau khi sửa mã. Không mở `index.html` trực tiếp bằng `file://`.

## Cấu trúc thư mục

```text
engineering-planner/
├── src/
│   ├── components/ProjectWorkspace.tsx  # Ribbon, grid, Gantt, editor, dialogs
│   ├── engine/
│   │   ├── schedulingEngine.ts          # Pure scheduling function và lịch làm việc
│   │   └── types.ts                     # Hợp đồng dữ liệu đầu vào/đầu ra
│   ├── data/seed.ts                     # Dự án mẫu và bộ 5.000 dòng
│   ├── store/projectStore.ts            # Zustand, giao dịch, baseline, undo/redo
│   ├── main.tsx
│   └── styles.css                       # Tailwind và thông số thiết kế chính xác
├── tests/
│   ├── schedulingEngine.test.ts
│   └── browser/workspace.spec.ts
├── scripts/benchmark.ts
├── docs/ENGINE.md
├── docs/VALIDATION.md
├── dist/
├── index.html
├── package.json
├── package-lock.json
├── playwright.config.ts
├── vite.config.ts
├── vitest.config.ts
└── tsconfig.json
```

## Tính năng đã triển khai

- WBS nhiều cấp; ID ổn định, mã WBS tính lại theo vị trí; thêm, xóa cả nhánh, thụt/nhô lề, thu gọn/mở cây.
- Summary bao phủ thời gian các công việc con. Physical % tổng hợp theo **thời lượng công việc lá**, không đếm lặp các tầng summary.
- Liên kết FS/SS/FF/SF, lead/lag âm/dương, nhiều tiền nhiệm; kiểm tra tự liên kết, liên kết trùng, liên kết tới summary, vòng lặp phụ thuộc và vòng lặp WBS.
- Lịch T2–T7, 08:00–12:00 / 13:00–17:00, nghỉ Chủ Nhật và ngày lễ cấu hình; tính bằng phút làm việc, hỗ trợ thời lượng lẻ.
- CPM: Early/Late Start/Finish, Total Float; tô đường găng khi float bằng 0. Không san bằng nguồn lực.
- Phân bổ kỹ sư/thiết bị theo tỷ lệ; tổng giờ từng nguồn lực từng ngày; cảnh báo khi vượt năng lực 8h/ngày mặc định.
- Hai chỉ số độc lập: Physical % nhập theo nghiệm thu; Duration % theo thời gian kế hoạch đã trôi qua đến **cuối ngày báo cáo**. Physical % không tự thay đổi thời lượng/lịch.
- Grid và Gantt dùng **một danh sách hiển thị và một vùng cuộn dọc**. Mọi dòng cao 36px; header tổng 56px; command ribbon 48px.
- TanStack Table quản lý cột/dòng, TanStack Virtual chỉ render các dòng gần viewport. Timeline chỉ tạo cột ngày nằm gần vùng nhìn ngang.
- Đồng bộ hover/chọn hai vùng; Shift+cuộn hoặc thanh cuộn dưới mỗi vùng để cuộn ngang; splitter kéo chuột hoặc phím mũi tên.
- Thanh Gantt kép, summary bracket, milestone, SVG dependencies vuông góc, vạch ngày báo cáo, baseline; không dùng thư viện Gantt trả phí.
- Kéo thanh để đề xuất ngày bắt đầu, kéo mép phải để đổi thời lượng. Thả chuột mở hộp thoại xác nhận; kiểm tra dữ liệu rồi tính lại và lưu. Lỗi giữ nguyên dữ liệu cũ; có thể hoàn tác.
- Chụp một baseline đang hoạt động; so sánh thanh màu xám; undo/redo 10 lần; lưu dữ liệu qua tải lại trang; xuất/nhập dự án và baseline bằng JSON.
- Có sẵn dự án AutoCAD, mua thiết bị, lắp ráp tủ PLC, FAT, Loadcell, PLC/SCADA, chạy thử, hồ sơ và SAT.

## Thao tác nhanh

1. Nhấp một dòng để chọn. Ctrl/Cmd+click chọn nhiều dòng; hai dòng được chọn sẽ điền sẵn hộp thoại liên kết.
2. Nhấp đúp **ô** tên, thời lượng, bắt đầu hoặc Physical % để sửa. Enter lưu, Escape hủy. Ô còn lại và summary là dữ liệu tính.
3. Nhấp đúp dòng hoặc chọn **Chi tiết** để mở bảng chỉnh sửa nhanh, gán nguồn lực và tỷ lệ phân bổ.
4. **Ngày bắt đầu** được hiểu là ràng buộc “không bắt đầu trước”, không phải khóa cứng. Tiền nhiệm có thể đẩy task muộn hơn. Xóa ràng buộc trong bảng chi tiết để quay lại lịch tự động.
5. **Chốt Baseline** chụp kế hoạch hiện hành; **So sánh** bật thanh đối chiếu. Task mới sau baseline không có thanh xám; task đã xóa vẫn còn dữ liệu trong bản chụp nhưng không có dòng hiện hành để vẽ.
6. **Thiết lập lịch** sửa ngày dự án, ngày báo cáo và ngày lễ. Dữ liệu dự án mẫu dùng ngày báo cáo 14/10/2026 để quan sát hai chỉ số khác nhau.
7. **5.000 task** cho phép nạp bộ thử hiệu năng hoặc khôi phục dự án mẫu. Có thể Ctrl+Z để trở lại dữ liệu trước đó; nên xuất JSON trước khi đổi dữ liệu.

Các đầu nối được tạo qua hộp thoại liên kết; chưa có thao tác kéo trực tiếp từ đầu nối sang thanh khác. Kéo Gantt chỉ hoạt động với công việc lá/cột mốc; summary được tính tự động.

## Phạm vi bản bàn giao

Đây là ứng dụng **một trình duyệt**, dùng `localStorage`, không phải hệ thống backend đa người dùng. Chưa có đăng nhập, phân quyền, API, PostgreSQL, optimistic locking trên máy chủ hoặc đồng bộ 10–50 người dùng. Dữ liệu giữa nhiều tab không tự hợp nhất. Mỗi lần sửa trong một phiên được kiểm tra và tính thành công trước khi thay state; không phải giao dịch cơ sở dữ liệu.

Hiện giữ một baseline hoạt động, không có màn hình quản lý nhiều phiên bản baseline. Xuất JSON trước khi chốt baseline thay thế nếu muốn lưu bản cũ. Chưa có chi phí/vật tư, timesheet, Actual Work/Actual Finish, khóa lịch task đã hoàn thành, calendar riêng từng nguồn lực, lịch tùy biến theo ca, san bằng nguồn lực, xuất/nhập `.mpp`, hay tương đương đầy đủ MS Project/Primavera. Physical 100% hiện không khóa ngày task.

Tính lịch chạy đồng bộ trong trình duyệt. Ảo hóa giúp giới hạn DOM; **không cam kết 60fps trên mọi thiết bị**. Xem dữ liệu đo, môi trường và cách tái lập trong `docs/VALIDATION.md`. Khi triển khai backend, chuyển hàm pure `scheduleProject` sang dịch vụ tính lịch chính thức hoặc port kèm bộ test; thêm worker nếu phép tính bắt đầu chặn tương tác với tập dữ liệu thực.

Không tải font hay tài nguyên ảnh bên ngoài. CSS ưu tiên Inter/JetBrains Mono nếu máy có, sau đó dùng font hệ thống và monospace để luôn chạy được. Icons dùng Lucide React, stroke 1.5px.

## Tài liệu chính thức đã đối chiếu

- React adapter của TanStack Virtual: https://tanstack.com/virtual/latest/docs/framework/react/react-virtual
- Cấu hình virtualizer: https://tanstack.com/virtual/latest/docs/api/virtualizer
- TanStack Table + virtualization: https://tanstack.com/table/latest/docs/framework/react/guide/virtualization
- Tailwind CSS qua Vite: https://tailwindcss.com/docs/installation/using-vite
