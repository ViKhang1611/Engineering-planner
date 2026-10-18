# Kiểm tra bàn giao Enterprise 2.0 — 17/10/2026

## Kết quả

| Kiểm tra                                | Kết quả                                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| TypeScript (`tsc -b`)                   | Đạt, không có lỗi                                                                                |
| Production build (Vite)                 | Đạt; ExcelJS lazy chunk có cảnh báo kích thước >500 KB                                           |
| Unit/domain/persistence                 | 53/53 đạt                                                                                        |
| Playwright Chromium                     | 15/15 đạt, một worker                                                                            |
| Smoke test trên `dist` qua Vite preview | WBS + 4 phân hệ mới mở thành công, xuất XLSX thành công, 0 pageerror                             |
| WBS/Gantt 5.000 task                    | Virtual rows <50, cuộn đến task cuối thành công                                                  |
| Chiều cao hàng và bố cục laptop         | 36px; kiểm tra bounds 1366×768                                                                   |
| Giao diện                               | Đã kiểm tra ảnh render Dashboard, Resource Heatmap, Kanban                                       |
| Baseline                                | Nhiều snapshot giữ nguyên, chọn lại, undo, thanh đối chiếu                                       |
| Dữ liệu liên thông                      | Checklist → Physical → Kanban → Dashboard → IndexedDB → reload                                   |
| Xuất/nhập                               | CSV/XLSX round-trip giữ cây, links, baselines và attachment dài; XLSX cũng chạy trên trình duyệt |
| Xung đột lưu                            | fake-indexeddb test xác nhận tab cũ không ghi đè revision mới                                    |

## Phạm vi bài kiểm tra

29 bài engine gốc: lịch làm việc, nghỉ lễ, bốn kiểu dependency, lag/lead, CPM, cycle/hierarchy validation, roll-up và workload. 12 bài workspace: migration, phân tách dự án, undo, nhập atomic, lưu lỗi và retry. 11 bài domain mới: multi-baseline, trọng số cố định, checklist/nghiệm thu, parser tiền nhiệm, variance, subtree outdent, EVM, lịch sử tiến độ, CSV/XLSX và dữ liệu lỗi. 1 bài adapter IndexedDB: migration, lưu/đọc, conflict hai phiên.

15 bài browser gồm 5 bài shell, 6 bài core Gantt và 4 bài enterprise: checklist/nghiệm thu xuyên phân hệ; Resource Pool/heatmap; baseline và download JSON; kéo thả Kanban và xuất/nhập Excel thực tế.

## Hiệu năng đo được

Node 24.19.0, Linux, Intel Xeon Platinum 8573C (9 logical CPUs được báo cáo):

| Fixture                      |   Median |      P95 |
| ---------------------------- | -------: | -------: |
| 5.000 task, không dependency | 34,18 ms | 51,32 ms |
| 5.000 task, 4.702 dependency | 43,80 ms | 67,50 ms |

Đây là thời gian engine, không phải FPS của trình duyệt. Scroll dùng virtualization và không chạy lại engine; chưa chứng nhận 60fps trên mọi cấu hình máy người dùng. Chi tiết trong `benchmark-output.txt`.

## Giới hạn đã công bố

- Bản standalone chạy trên một thiết bị/origin; không triển khai xác thực, phân quyền hay server cộng tác đa người. SQL/OpenAPI là hợp đồng bàn giao, chưa chạy qua PostgreSQL/server integration test.
- CSV/XLSX là định dạng round-trip riêng của ForgePlan, không nhập trực tiếp file MPP hoặc mọi bảng Excel tùy ý.
- Actual S-Curve chỉ dùng quan sát đã ghi nhận. Không có dữ liệu quá khứ thì không vẽ giả đường lịch sử.
- Không tuyên bố chứng nhận bảo mật, SLA uptime hoặc hiệu năng 60fps phổ quát từ các bài kiểm tra này.

## Bổ sung 2.1 — Themes / Professional Export (18/10/2026)

- TypeScript và production build đạt; Worker dùng ES modules để hỗ trợ các chunk Excel/PDF tải theo yêu cầu.
- Bộ unit/domain/persistence/export: **59/59 đạt**. Gồm sáu bài mới cho theme, timeline, workbook có màu, 5.000 task Excel và PDF A4/A3/phân trang hai chiều.
- Bộ Chromium E2E: **17/17 đạt**, gồm kiểm tra đủ 5 theme và tải XLSX/PDF thật từ Worker, khi cây WBS đang thu gọn.
- Render PDF A4/A3 bằng Poppler; kiểm tra font tiếng Việt, ngày dd/mm/yy, bảng đủ task, thanh Physical/Duration, baseline, dependency và ba khung ký duyệt.
- ExcelJS/PDF/fontkit tải ở worker/chunk riêng; cảnh báo chunk thư viện lớn là thông tin về kích thước bundle, không phải lỗi build.
- Mẫu đầu ra tại `docs/samples/`. Không lưu ảnh chụp màn hình trong bộ bàn giao.

- Kiểm tra cold-start sau khi xóa cache dependency: 2/2 bài theme/export đạt. Vite prebundle Excel/PDF/fontkit trước khi mở giao diện, tránh reload khi xuất lần đầu.
- Kiểm tra chồng lớp: mở Task Detail Drawer rồi xuất file; hộp xuất và nút tải vẫn hoạt động đầy đủ.
- Production preview tải được XLSX (3 sheets), PDF A4 và A3 (mỗi mẫu 2 trang), không có pageerror.
