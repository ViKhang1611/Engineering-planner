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

`main.tsx` chờ `initializePersistence()` trước khi import App/store. IndexedDB `forgeplan-enterprise` (v4): store `workspace` key `meta` chứa revision, `projectOrder`, dự án đang mở, view và sidebar; store `projects` chứa mỗi dự án một record `{project, baseline, rev}` theo id, có index `rev` (revision đã ghi record); store `attachments` chứa nội dung tệp. Dữ liệu v1/v2 (`workspace/current` = cả document) được đọc một lần và xóa ở lần lưu v3 đầu tiên. Lần đầu chưa có record, adapter đọc `forgeplan.workspace.v2`, sau đó `forgeplan.project.v1` nếu cần. Khóa localStorage cũ không bị xóa.

Store gom các thay đổi trong 400 ms (`SAVE_DELAY_MS`), không trì hoãn quá 2 giây khi người dùng sửa liên tục (`SAVE_MAX_WAIT_MS`), và ghi ngay khi tab bị ẩn, `pagehide` hoặc `beforeunload`. Trong lúc chờ, trạng thái hiển thị "Đang lưu…". Store ghi nhận id các dự án có `project`/`baseline` đổi tham chiếu; mỗi lần lưu chỉ ghi `meta` và các dự án đó. Lần lưu thất bại giữ lại danh sách dự án chưa lưu để lần sau ghi kèm. Nếu đóng tab khi đang có lỗi lưu, trình duyệt hỏi xác nhận.

Mỗi lần ghi là một read-write transaction trên `workspace` + `projects`: phát lệnh đọc revision, rồi ngay lập tức các lệnh ghi `meta` (revision+1), dự án đã đổi và xóa dự án không còn trong workspace. Callback của lệnh đọc so revision và `abort()` nếu lệch, toàn bộ lệnh ghi được rollback. Không gọi `tx.commit()` vì sau đó không còn abort được. Phát mọi lệnh ngay từ đầu giúp lần lưu lúc đóng/tải lại trang không phải chờ thêm vòng sự kiện. Queue tuần tự (transaction tạo ngay khi không có lần lưu nào đang chạy) tránh đảo thứ tự các lần commit. Tab khác đã ghi sẽ làm transaction bị abort và UI báo lỗi; xuất JSON phiên đang mở trước khi tải lại. Snapshot hover không được lưu. Khi không có IndexedDB, dùng localStorage; nếu đọc dữ liệu bị lỗi, chặn ghi tự động để không phá bản cũ.

### Đồng bộ giữa các tab

Mở tab không ghi gì (chỉ ghi khi cần chuyển dữ liệu định dạng cũ hoặc chưa có dữ liệu), nên không làm tab khác phải tải lại. Sau mỗi lần lưu thành công, tab phát `{type: "saved", revision}` qua `BroadcastChannel("forgeplan-workspace")`. Tab nhận tin, tab vừa được hiện lại (`visibilitychange`) và tab vừa bị `WorkspaceConflictError` khi lưu đều gọi `pullIndexedWorkspace()`: đọc `meta`, lấy các dự án có `rev` lớn hơn revision của tab qua index, và các dự án đã bị gỡ khỏi `projectOrder`.

Store gộp theo từng dự án:
- Dự án chỉ tab kia đổi: thay bằng bản mới (giữ dòng đang chọn và trạng thái thu gọn, lịch sử undo của dự án đó bắt đầu lại). Thanh trên hiện "Đã cập nhật N dự án từ tab khác".
- Dự án cả hai tab đang sửa (còn trong danh sách chưa lưu): tạm dừng lưu, hiện thanh cảnh báo với hai lựa chọn. **Dùng bản từ tab khác** bỏ thay đổi chưa lưu của dự án đó; **Giữ bản của tôi** giữ thay đổi và lần lưu tiếp theo ghi đè bản kia. Các dự án không xung đột vẫn được gộp như trên.
- Dự án tạo mới ở tab này nhưng chưa lưu được giữ lại và nối vào cuối danh sách. Dự án đang mở và view của mỗi tab không đi theo tab khác.

Sau khi gộp, `accept()` nhận revision của đĩa để lần lưu kế tiếp không bị coi là xung đột. Drawer đang mở vẫn tự phát hiện công việc đã đổi trước khi lưu.

### Tệp đính kèm (IndexedDB v2)

Nội dung tệp nằm trong object store `attachments` (key = id tệp, value = `{bytes: ArrayBuffer, type, createdAt}`). Task chỉ giữ metadata `{id, name, type, size}`, nên commit, undo và mỗi lần ghi workspace không sao chép nội dung tệp. Tệp là bất biến: một id luôn ứng với cùng nội dung, nhiều dự án hoặc snapshot undo có thể dùng chung.

- **Migration:** khi khởi động, `initializePersistence()` chuyển các `data` base64 cũ (v1 hoặc localStorage) sang store riêng rồi bỏ khỏi document; lần lưu đầu ghi document đã gọn. Lỗi chuyển thì giữ nguyên bản inline. Dữ liệu sai cỡ hoặc sai mã hóa vẫn để inline để validation từ chối.
- **Xóa và dọn rác:** xóa tệp trong Drawer chỉ bỏ metadata, nên undo vẫn mở được tệp. Khi khởi động, tệp không còn được document nào tham chiếu và cũ hơn 24 giờ sẽ bị xóa (`deleteUnreferencedAttachments`).
- **Xuất/nhập:** JSON, CSV, XLSX và bản sao workspace nhúng lại `data` (`inlineAttachments`/`inlineDocument`) để mang sang máy khác; tệp không còn trên thiết bị chỉ giữ tên và UI báo lại. Khi nhập/khôi phục, `externalizeAttachments`/`externalizeDocument` tách tệp vào store trước khi thay dữ liệu.
- **Fallback localStorage:** không có IndexedDB thì tệp vẫn lưu inline như phiên bản trước.

Trạng thái lưu dùng sequence để một giao dịch cũ hoàn thành không làm hiển thị “Đã lưu” trong khi còn giao dịch mới. Dữ liệu chỉ thật sự durable sau khi transaction hoàn thành. Thiết bị/trình duyệt vẫn có thể xóa dữ liệu khi người dùng xóa site data; xuất backup là cơ chế di chuyển và phục hồi.

## Hiệu năng

- WBS/Gantt dùng một virtual row, cao 36px, một viewport dọc; không có vòng lặp đồng bộ scroll hai bảng.
- Kanban virtualize từng cột, Resource heatmap virtualize hàng; cửa sổ thời gian 14 ngày.
- S-Curve tối đa 101 mẫu; warning table phân trang 50 dòng.
- ExcelJS import động. Không tải thư viện Excel trong bundle giao diện chính.
- Engine chạy đồng bộ để giữ commit nguyên tử. Benchmark có số đo 5.000 tasks, nhưng không thay thế profiling trên máy người dùng hoặc SLA 60fps.
- App shell tách thành các component nhỏ, mỗi phần chỉ theo dõi đúng trường store nó hiển thị (`useShallow`, `store/shellSelectors.ts`); chọn dòng hay gõ phím không render lại shell.

### Module Lập tiến độ (`modules/schedule/components`)

`ScheduleWorkspace` giữ state hiển thị (zoom, lọc, cuộn, hộp thoại) và nối session với các phần đã memo:

- `TaskRow` (memo): một dòng WBS + làn Gantt; chỉ render lại khi task, trạng thái chọn, độ lệch kéo hoặc thang thời gian của chính nó đổi. Callback dùng chung một đối tượng `RowActions` ổn định, đọc dữ liệu mới nhất qua ref.
- `hoverStore`: dòng đang hover nằm ngoài state React; mỗi dòng đăng ký "mình có đang được hover", nên di chuột chỉ render lại dòng rời và dòng vào.
- Độ rộng bảng WBS và độ lệch cuộn ngang là biến CSS (`--pane`, `--grid-x`, `--timeline-x`) đặt trên `.workspace`; cuộn ngang hay kéo thanh chia không render lại các dòng.
- `TimelineParts` (header, nền ngày), `DependencyLayer` (đường nối SVG), `ScheduleChrome` (heading, ribbon, thanh trạng thái), `ScheduleDialogs` (mỗi hộp thoại tự giữ state form), `useGanttDrag` (kéo/đổi thời lượng thành đề xuất chờ xác nhận), `scheduleShared` (cột, định dạng, `barPosition`).
- Ô dùng ở mọi dòng (`InlineCell`, `PredecessorCell`) chỉ lấy action ổn định từ store, không theo dõi cả session.

## Hợp đồng nhập/xuất

JSON chứa project chuẩn. CSV/XLSX Project Data dùng `record_type,id,part,payload`; phân loại metadata/task/resource/dependency/baseline/progress. Chuỗi JSON dài được chia 16.000 ký tự để không vượt giới hạn ô Excel. Import gom phần theo thứ tự, từ chối thiếu/trùng phần, kiểm tra toàn bộ project, rồi mới gọi replace. CSV theo RFC4180, hỗ trợ dấu ngoặc kép/newline/BOM và escape tiền tố công thức. Excel không chấp nhận công thức trong sheet dữ liệu.

Sheet WBS Report là báo cáo thuận tiện cho người đọc. Project Data mới là dữ liệu nhập lại. Không quảng cáo tương thích trực tiếp định dạng MPP/MS Project.

## Ranh giới backend

`docs/backend/schema.sql` chuẩn hóa bảng chính và FK; `openapi.yaml` định nghĩa REST project snapshot với optimistic concurrency. Đây là hợp đồng triển khai, không phải server đã chạy. Để dùng nhiều người cần server xác thực, kiểm tra quyền theo project, transaction, audit và object storage cho tài liệu. Không dùng localStorage/IndexedDB làm giải pháp cộng tác 10–50 người qua mạng.
