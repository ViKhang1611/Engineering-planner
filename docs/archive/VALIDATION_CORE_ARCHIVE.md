# Biên bản kiểm tra bản bàn giao

Ngày thực hiện: 16/10/2026. Môi trường: Linux 6.18.44, Node v24.19.0, CPU Intel Xeon Platinum 8573C, 9 logical CPU được cấp cho runtime. Kết quả dưới đây áp dụng cho bản source đính kèm; không thay thế kiểm chứng trên laptop/máy chủ thực tế.

## Kiểm tra đã đạt

| Kiểm tra                                    | Kết quả                                                               |
| ------------------------------------------- | --------------------------------------------------------------------- |
| TypeScript strict + Vite production build   | Đạt                                                                   |
| Vitest nghiệp vụ                            | 29/29 đạt                                                             |
| Playwright Chromium 140                     | 5/5 đạt                                                               |
| Kích thước hàng, header, ribbon đo trên DOM | 36px / 56px / 48px                                                    |
| Kiểm tra giao diện ở hai kích thước         | 1366×768 và 1920×1080                                                 |
| Ảo hóa bộ 5.000 dòng                        | Ít hơn 50 DOM rows ở viewport 1366×768; cuộn tới task cuối thành công |
| Lỗi JavaScript ở luồng render mẫu           | Không ghi nhận                                                        |
| Source có `TODO`/`FIXME`                    | Không có                                                              |

29 ca nghiệp vụ bao phủ: nghỉ Chủ Nhật, ngày lễ, thay lịch, nghỉ trưa, thời lượng lẻ, biên đầu/cuối ngày, ngày dự án vào Chủ Nhật, ngày không tồn tại, FS/SS/FF/SF với lead/lag, nhiều tiền nhiệm, lượt về CPM, rút ngắn duration kéo lịch con về sớm, ràng buộc không-bắt-đầu-trước, dời ngày dự án, vòng lặp, tự liên kết, milestone, nested roll-up, WBS không tạo dependency, cấm liên kết summary, vòng lặp WBS, Duration/Physical độc lập, quá tải 12h/8h, ngưỡng đúng 8h, input bất biến, duration âm, resource import sai dạng bộ 5.000 dòng và summary bao phủ milestone tại đầu ca kế tiếp.

5 ca trình duyệt bao phủ:

1. Render grid/Gantt, chọn dòng, đo kích thước và xem bố cục hai màn hình.
2. Chốt baseline, sửa duration, kiểm tra baseline giữ nguyên, tải lại trang và hoàn tác.
3. Thu gọn, lọc đồng bộ, nạp 5.000 dòng và cuộn tới dòng cuối trong khi giới hạn DOM.
4. Tạo vòng lặp dependency bị từ chối và không ghi dữ liệu lỗi.
5. Kéo thanh Gantt, xác nhận thay đổi lịch và hoàn tác về ngày cũ.

Trong runtime hạn chế socket, kiểm thử dùng Chromium headless shell với `--single-process --no-zygote`, mỗi ca chạy trên worker riêng:

```bash
CI_RESTRICTED=1 npm run test:e2e -- --fully-parallel --workers=5
```

Máy thông thường chạy `npm run test:e2e` sau `npx playwright install chromium`, không cần biến môi trường này. Kết quả E2E cuối: **5 passed**. Ảnh chụp QA chỉ dùng nội bộ để kiểm tra giao diện, không đưa vào gói source.

## Đo thời gian engine

Lệnh `npm run benchmark`. Có 3 lượt warm-up; bộ không liên kết lặp 20 lần, bộ có liên kết lặp 10 lần. Hàm đo bằng `performance.now()`; không bao gồm React, localStorage hay thời gian vẽ.

| Dữ liệu                         | Trung vị |  p95 mẫu |
| ------------------------------- | -------: | -------: |
| 5.000 tasks, 0 dependency | 33,06 ms | 42,76 ms |
| 5.000 tasks, 4.702 dependencies | 58,28 ms | 66,76 ms |

Dữ liệu bao gồm 50 summary, 4.950 công việc lá, thời lượng 1–6 ngày; khoảng 500 task được gán kỹ sư. Trong bộ linked, liên kết FS theo các chuỗi dài tối đa khoảng 20 task. Xem output nguyên gốc trong `benchmark-output.txt`. Đây không phải benchmark worst-case với 50.000 liên kết hay lịch dài 100 năm; lần chạy khác có thể biến thiên theo tải CPU/JIT.

Không có tuyên bố đã đo hoặc bảo đảm **60fps**. Ảo hóa giảm số dòng DOM và số cột timeline; để nghiệm thu hiệu năng sản phẩm cần đo trên thiết bị đích với dữ liệu thật, gồm số task, số dependency, số assignment và chân trời lịch cụ thể. Đề nghị dùng Chrome Performance ở bản production, cuộn dọc/ngang 10 giây, kéo thanh 10 lần, ghi frame time p50/p95, long tasks và thời gian từ lưu đến cập nhật. Có thể đặt mục tiêu frame time p95 ≤16,7ms và phản hồi sửa lịch p95 <300ms trên máy Core i5/16GB/Chrome hiện hành, nhưng **đó là mục tiêu cần xác minh**, chưa phải kết quả bản bàn giao.

## Các giới hạn đã biết

- Engine đồng bộ trên main thread; các mạng lớn hơn dữ liệu đo có thể gây khoảng chờ khi lưu. Nên dùng Web Worker trước khi mở rộng độ phức tạp, rồi chuyển nguồn tính chính thức về backend khi triển khai nhiều người dùng.
- LocalStorage có hạn mức theo trình duyệt. Khi không lưu được, ứng dụng báo lỗi và cho phép xuất JSON. Undo/redo chỉ tồn tại trong phiên, không lưu lịch sử sau reload.
- Thanh Gantt biểu diễn khoảng thời gian liên tục qua ngày nghỉ nhưng tính duration/work bỏ qua ngày nghỉ. Ngày nghỉ được tô nền xám; chưa chia thanh thành từng đoạn theo ca.
- Timeline dùng SVG cho đầu nối của các cạnh cắt qua vùng nhìn dọc. Nhiều cạnh dài cắt cùng viewport vẫn có thể làm tăng số path; cần benchmark riêng trước khi cam kết 60fps với mạng dày.
- Không hỗ trợ kéo nối dependency trực tiếp, sắp xếp tùy ý, kéo đổi thứ tự WBS, hay cột người dùng tự cấu hình; thao tác WBS có qua thụt/nhô lề.
- Chưa có backend, phân quyền, đa dự án dùng chung nguồn lực, chi phí hay lịch thực tế khóa cứng. Xem phạm vi trong README.
