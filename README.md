# ForgePlan Enterprise 2.1 — Engineering Project Workspace

Ứng dụng React + TypeScript chạy độc lập, mở rộng từ module WBS/Gantt hiện có. Gồm danh mục dự án, lập tiến độ, nguồn lực, Kanban/nghiệm thu, Dashboard và xuất/nhập dữ liệu. Không cần Figma hoặc khóa API để chạy.

## Mới trong 2.1: Themes và Xuất Kế hoạch

Thanh trên cùng có **Theme** và **Xuất Kế hoạch** ở mọi phân hệ.

- Chọn một trong 5 theme: Enterprise Slate, MS Project Classic, Industrial Dark/CAD, Blueprint Technical, High-Contrast Construction. Lựa chọn lưu riêng trên thiết bị; WBS, Gantt và S-Curve đổi màu ngay.
- Chọn **Xuất Kế hoạch → Excel .xlsx** để tải bảng WBS đầy đủ và timeline Gantt tô màu trực tiếp trên các ô. Có thêm sheet liên kết và Project Data để nhập lại dữ liệu nguyên vẹn.
- Chọn **Xuất Kế hoạch → PDF**; chọn A4/A3 ngang và đơn vị ngày/tuần/tháng. PDF vector nhúng font tiếng Việt, thanh kép Physical/Duration, baseline, đường nối, phụ lục liên kết và ba ô ký duyệt.
- Xuất toàn bộ dự án, bao gồm dòng đang thu gọn, ẩn do tìm kiếm và nằm ngoài vùng cuộn. Kế hoạch dài tự chia trang theo cả WBS và timeline; không chụp màn hình vùng đang thấy.
- Tạo file trong Web Worker, có tiến trình và hủy. Dữ liệu không gửi đến dịch vụ bên ngoài.

Hướng dẫn và giới hạn kích thước tại `docs/THEMES_EXPORT.md`; file mẫu trong `docs/samples/`.

## Chạy trên Windows / macOS / Linux

Cài Node.js 22.12+ (khuyến nghị Node 24 LTS), giải nén ZIP rồi mở terminal tại thư mục `engineering-planner`:

```sh
npm ci
npm run dev
```

Mở `http://127.0.0.1:5173`. Trên Windows có thể dùng `START_WINDOWS.bat`. Không mở `dist/index.html` bằng file:// vì ứng dụng cần HTTP origin cho module và lưu trữ.

```sh
npm run build
npm run preview
```

`dist/` đi kèm là bản build. Có thể đưa thư mục này lên static hosting HTTPS; hash router không cần rewrite route. Mỗi domain/port/profile trình duyệt có vùng dữ liệu riêng. Xuất JSON trước khi đổi origin hoặc xóa dữ liệu trình duyệt.

## Chức năng

- **Workspace:** sidebar thu gọn; nhiều dự án; chuyển view; sửa hợp đồng, chủ đầu tư, ngày bắt đầu/ngày báo cáo và ngày nghỉ.
- **WBS/Gantt:** thêm/xóa, indent/outdent, đánh mã cây tự động; inline sửa tên, duration, ngày bắt đầu, Physical %, tiền nhiệm; FS/SS/FF/SF và lag/lead; CPM ES/EF/LS/LF/Float; summary roll-up; drag/resize có preview và xác nhận; undo/redo 100 bước.
- **Cuộn/hover:** grid và Gantt dùng chung một hàng 36px và một viewport cuộn dọc, virtualization 5.000 tasks. Cuộn ngang riêng cho bảng và timeline.
- **Baseline:** tạo Baseline 0/1/2…; chọn bản đối chiếu; thanh xám 4px; Variance theo ngày làm việc trên lịch baseline. Chốt mới không ghi đè bản cũ.
- **Chi tiết task:** nhấp tên/WBS hoặc nhấp đúp hàng; checklist trọng số, Physical tự động; gán kỹ sư/thiết bị/vật tư; FAT/SAT; ngày và số biên bản; ghi chú; đính kèm tệp, tải lại và xóa tệp.
- **Nguồn lực:** tạo/sửa/xóa danh mục, công suất; heatmap 14 ngày, mở các task được gán; ô quá tải đỏ và danh sách xung đột; không tự dời lịch. Vật tư hiển thị số lượng vào ngày bắt đầu task, không quy thành giờ.
- **Kanban:** bốn cột, kéo thả và chọn trạng thái bằng bàn phím, tìm kiếm/lọc nguồn lực, danh sách ảo. Mọi cập nhật đi qua cùng store với Gantt.
- **Dashboard:** KPI Physical/Duration, critical bị trễ, kỹ sư quá tải, mốc 14 ngày; S-Curve baseline/current/actual; cảnh báo lệch tiến độ; EVM PV/EV/AC/SPI/CPI/SV/CV khi có ngân sách và chi phí.
- **Dữ liệu:** IndexedDB có transaction/revision; migration từ localStorage v1/v2; chống ghi đè giữa các tab; báo lỗi lưu; JSON/CSV/XLSX đầy đủ; backup/restore toàn workspace; Reset Demo Data cho dự án hiện tại.

## Quy ước cần biết

1. Lịch mặc định T2–T7, 08:00–12:00 và 13:00–17:00, nghỉ Chủ Nhật và ngày lễ. Ở Thiết lập dự án (hoặc Lập tiến độ › Thiết lập lịch) có thể chọn ngày làm việc trong tuần, ngày làm bù và giờ bắt đầu hai ca. Mỗi ngày luôn gồm hai ca 4 giờ (480 phút làm việc). Mốc thời gian engine dùng +07:00. Chưa hỗ trợ lịch riêng theo nguồn lực.
2. Duration % là thời lượng kế hoạch đã trôi qua đến **ngày báo cáo**, không phải Actual Duration / Remaining Duration. Thay ngày báo cáo ở Thiết lập dự án.
3. Physical % summary dùng trọng số khối lượng cố định. Khi dữ liệu cũ chưa có trọng số, khởi tạo bằng `max(duration, 1)` một lần. Sửa thời lượng không âm thầm đổi trọng số. Có thể sửa trọng số trong Drawer.
4. Checklist tính `tổng trọng số đã xong / tổng trọng số`. Khi ở chế độ checklist, Physical không sửa trực tiếp ở grid. Checklist rỗng = 0%. Task FAT/SAT đạt 100% nhưng chưa nghiệm thu nằm ở cột Chờ nghiệm thu.
5. Kéo sang Hoàn thành đánh dấu tất cả checklist, Physical 100% và nghiệm thu tại ngày báo cáo. Kéo về Chưa bắt đầu bỏ các đánh dấu. Kéo Đang thi công ở chế độ thủ công đặt ít nhất 1%; Chờ nghiệm thu đặt 90% (mặc định; đổi được theo từng dự án ngay trên màn hình Kanban). Với checklist, phần trăm do checklist quyết định.
6. S-Curve thực tế chỉ có các điểm đã ghi nhận. Mỗi ngày báo cáo lưu một điểm, cập nhật khi dữ liệu thay đổi hoặc bấm Ghi nhận tiến độ. Không tự tạo các số liệu quá khứ. Baseline giữ phạm vi/trọng số tại thời điểm chốt.
7. EVM dùng ngân sách và chi phí task lá nhập trong Drawer, đơn vị VND. Khi chưa chốt baseline, PV dựa trên lịch hiện tại. SV trong EVM là tiền (EV−PV); Variance trong WBS là ngày.
8. Tệp đính kèm tối đa 5 MB/tệp và 25 MB/dự án. Nội dung tệp lưu riêng trong IndexedDB, không nằm trong dữ liệu dự án; các file xuất JSON/CSV/XLSX vẫn mang theo tệp. Tệp nhập tối đa 50 MB. Dữ liệu dự án gồm tối đa 5.000 tasks và 50.000 dependencies. Các tệp nhập lỗi bị từ chối trước khi ghi.
9. JSON là định dạng backup dễ đọc. CSV dùng các bản ghi có kiểu và payload JSON để giữ cây, liên kết, checklist, baseline, tài liệu; đây không phải CSV phẳng của MS Project. Excel có `WBS Report` để đọc, `Project Data` để round-trip. Chỉnh `WBS Report` không thay đổi `Project Data`.
10. Đây là bản **standalone**, không có tài khoản, phân quyền hay đồng bộ nhiều người qua máy chủ. Có schema PostgreSQL và hợp đồng REST trong `docs/backend` để triển khai backend riêng; không tuyên bố backend đã chạy. Các tab cùng trình duyệt tự đồng bộ: thay đổi ở tab này hiện ngay ở tab kia, sửa đồng thời các dự án khác nhau được gộp tự động; nếu hai tab cùng sửa một dự án, ứng dụng tạm dừng lưu và hỏi giữ bản nào.

## Kiểm tra

```sh
npm run check          # typecheck + ESLint + Prettier + unit test (CI chạy lệnh tương tự)
npm run format         # tự định dạng mã nguồn
npm test
npx playwright install chromium --only-shell
npm run test:e2e -- --workers=1
npm run benchmark
```

Xem kết quả cụ thể trong `docs/VALIDATION.md`. Benchmark engine không phải cam kết tốc độ khung hình 60fps trên mọi máy.

## Cấu trúc

`src/app` chứa shell/router; `src/store` chứa workspace và session; `src/domain` chứa model, execution, dependency parser và analytics; `src/modules` chứa schedule/resources/execution/dashboard/data/portfolio/project-settings; `src/infrastructure/persistence` chứa adapters; `src/shared` chứa tokens, fonts và UI dùng chung. Chi tiết ranh giới và luồng dữ liệu trong `docs/ARCHITECTURE.md`.

Font Inter và JetBrains Mono được đóng gói tại chỗ, không gọi Google Fonts. ExcelJS được tải riêng khi dùng Excel; chunk Excel lớn hơn 500 KB nhưng không nằm trên đường tải giao diện ban đầu.
