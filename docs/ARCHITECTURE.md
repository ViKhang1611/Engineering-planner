# Kiến trúc và dữ liệu — Enterprise 2.0

## Luồng cập nhật

Mọi phân hệ dùng `useProjectStore` để lấy session của dự án đang chọn từ một Zustand workspace. Không có bản sao task riêng trong Dashboard, Kanban hoặc heatmap. Draft trong Drawer chỉ là dữ liệu form chưa lưu.

1. UI gọi `commit` với một mutation trên bản clone.
2. Chuẩn hóa checklist/trạng thái, cố định trọng số nếu chưa có.
3. Kiểm tra dữ liệu mở rộng, rồi chạy scheduling engine thuần.
4. Thành công: thay project/result atomically, lưu snapshot undo, cập nhật điểm tiến độ tại ngày báo cáo.
5. Các selector và view React lấy kết quả mới ngay trong cùng store.
6. Subscription chỉ lưu dữ liệu nghiệp vụ hoặc trạng thái điều hướng. Hover/selection/expand không ghi dữ liệu.
7. Lỗi validation hoặc dependency cycle không thay project/result/storage.

## Baseline

`project.baselines` là tập bản chụp chuẩn; `project.activeBaselineId` chọn bản hiển thị. Session `baseline` là alias tương thích cho renderer Gantt cũ, được suy ra mỗi lần commit/replace/khởi tạo. Undo/redo giữ đồng thời project và alias tương ứng. Baseline giữ ngày, thời lượng, công sức, Physical, trọng số, ngân sách và lịch lúc chốt. Không cho sửa trực tiếp snapshot.

Dữ liệu Phase 1 `snapshot.baseline` được chuyển vào collection nếu chưa tồn tại. Workspace schema giữ số 2 để tương thích envelope; định dạng project export mới là `forgeplan-v2`, có các trường mở rộng tùy chọn.

## Lưu trữ

`main.tsx` chờ `initializePersistence()` trước khi import App/store. IndexedDB `forgeplan-enterprise`, store `workspace`, key `current` chứa document và revision. Lần đầu chưa có record, adapter đọc `forgeplan.workspace.v2`, sau đó `forgeplan.project.v1` nếu cần. Khóa cũ không bị xóa.

Mỗi lần ghi là một read-write transaction: đọc revision, so với revision đã biết, rồi ghi revision+1 và document. Queue tuần tự tránh đảo thứ tự các lần commit. Tab khác đã ghi sẽ làm transaction bị abort và UI báo lỗi; xuất JSON phiên đang mở trước khi tải lại. Snapshot hover không được lưu. Khi không có IndexedDB, dùng localStorage; nếu đọc dữ liệu bị lỗi, chặn ghi tự động để không phá bản cũ.

Trạng thái lưu dùng sequence để một giao dịch cũ hoàn thành không làm hiển thị “Đã lưu” trong khi còn giao dịch mới. Dữ liệu chỉ thật sự durable sau khi transaction hoàn thành. Thiết bị/trình duyệt vẫn có thể xóa dữ liệu khi người dùng xóa site data; xuất backup là cơ chế di chuyển và phục hồi.

## Hiệu năng

- WBS/Gantt dùng một virtual row, cao 36px, một viewport dọc; không có vòng lặp đồng bộ scroll hai bảng.
- Kanban virtualize từng cột, Resource heatmap virtualize hàng; cửa sổ thời gian 14 ngày.
- S-Curve tối đa 101 mẫu; warning table phân trang 50 dòng.
- ExcelJS import động. Không tải thư viện Excel trong bundle giao diện chính.
- Engine chạy đồng bộ để giữ commit nguyên tử. Benchmark có số đo 5.000 tasks, nhưng không thay thế profiling trên máy người dùng hoặc SLA 60fps.

## Hợp đồng nhập/xuất

JSON chứa project chuẩn. CSV/XLSX Project Data dùng `record_type,id,part,payload`; phân loại metadata/task/resource/dependency/baseline/progress. Chuỗi JSON dài được chia 16.000 ký tự để không vượt giới hạn ô Excel. Import gom phần theo thứ tự, từ chối thiếu/trùng phần, kiểm tra toàn bộ project, rồi mới gọi replace. CSV theo RFC4180, hỗ trợ dấu ngoặc kép/newline/BOM và escape tiền tố công thức. Excel không chấp nhận công thức trong sheet dữ liệu.

Sheet WBS Report là báo cáo thuận tiện cho người đọc. Project Data mới là dữ liệu nhập lại. Không quảng cáo tương thích trực tiếp định dạng MPP/MS Project.

## Ranh giới backend

`docs/backend/schema.sql` chuẩn hóa bảng chính và FK; `openapi.yaml` định nghĩa REST project snapshot với optimistic concurrency. Đây là hợp đồng triển khai, không phải server đã chạy. Để dùng nhiều người cần server xác thực, kiểm tra quyền theo project, transaction, audit và object storage cho tài liệu. Không dùng localStorage/IndexedDB làm giải pháp cộng tác 10–50 người qua mạng.
