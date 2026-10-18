# Themes và Xuất Kế hoạch chuyên nghiệp — 2.1

## Theme

ThemeProvider đọc `forgeplan.theme.v1` trong localStorage, ánh xạ preset thành CSS variables trên phần tử html. Lựa chọn lỗi/không tồn tại trở về Enterprise Slate. Khi trình duyệt cấm lưu, giao diện vẫn đổi và báo lựa chọn chưa lưu được. Không thay đổi dữ liệu, lịch, baseline hoặc tiến độ khi đổi theme.

| Preset                     | Màu điều khiển | Thanh Gantt | Đường găng | Đặc điểm                        |
| -------------------------- | -------------- | ----------- | ---------- | ------------------------------- |
| Modern Enterprise Slate    | #4F46E5        | #4F46E5     | #E11D48    | Nền Slate sáng                  |
| MS Project Classic         | #107C41        | #0078D4     | #D13438    | Xanh lá–trắng, thanh xanh dương |
| Industrial Dark / CAD      | #06B6D4        | #06B6D4     | #F43F5E    | Nền #0F172A / #1E293B, chữ sáng |
| Blueprint Technical        | #1E3A8A        | #1D4ED8     | #B45309    | Navy/Steel, Duration Amber      |
| High-Contrast Construction | #003F88        | #003F88     | #C00000    | Nền trắng, chữ/viền đậm         |

Tokens riêng cho task, critical, physical/complete, duration, baseline, summary, milestone, hover, selection, surface và text. Tailwind slate/indigo/rose tokens, CSS thông thường và SVG cùng lấy variables. Không thay đổi chiều cao hàng 36px. Preset cố định; không có trình chỉnh màu tự do.

## Excel

Bấm Xuất Kế hoạch → Excel .xlsx, chọn khổ giấy và đơn vị timeline rồi Tải XLSX.

- `Ke hoach Gantt`: mười cột WBS, tên, duration, start, finish, predecessors, Physical, Duration, Variance, kỹ sư; bên phải là cột ngày/tuần/tháng. Summary in đậm và thụt lề theo cấp.
- Ngày là dữ liệu ngày thật của Excel; tỷ lệ là số, có định dạng phần trăm. Predecessors biểu diễn mã WBS + loại + lag/lead. Variance dùng baseline đang chọn và lịch của baseline.
- Task dùng màu preset; đường găng dùng màu critical. Đậm/nhạt thể hiện phần đã đạt/còn lại theo Physical. Chủ Nhật ở thang ngày tô xám. Milestone có ký hiệu hình thoi. Baseline là viền dưới xám. Khi xuất từ CAD Dark, giấy vẫn nền trắng và summary đổi sang mực đậm để in rõ.
- Header dự án/hợp đồng/ngày xuất/Physical; nhóm tháng; freeze WBS+tên và header, zoom 80%, lặp tiêu đề khi in ngang A4/A3.
- `Lien ket`: toàn bộ dependency và lag/lead.
- `Project Data`: dữ liệu đầy đủ theo định dạng của module Dữ liệu, có thể nhập lại. Chỉnh báo cáo Gantt không tự sửa Project Data. Dùng giao diện ứng dụng hoặc dữ liệu chuẩn để cập nhật lịch, không coi các màu Excel là scheduling engine.

## PDF

PDF được dựng trực tiếp bằng pdf-lib và fontkit, nhúng DejaVu Sans/DejaVu Sans Bold có glyph tiếng Việt. Không phụ thuộc ảnh canvas hoặc vùng virtual đang mount.

A4 ngang 841,89 × 595,28 pt; A3 ngang 1190,55 × 841,89 pt. Mỗi trang lặp header, legend, mốc ngày, bảng WBS và ba khung ký. PDF dùng ngày dd/mm/yy trong bảng, giữ toàn bộ tên công việc bằng wrap theo chiều cao hàng. Bảng có Physical/Duration và Variance.

Timeline tối đa 21 cột/trang A4 hoặc 42 cột/trang A3; tiếp tục sang trang ngang khi cần. Đồng thời phân trang dọc theo chiều cao thực tế của các ô. Task được lặp trên các dải thời gian để người đọc luôn đối chiếu được WBS. Không loại bỏ ngày hoặc task để ép vào một trang.

Thanh task có Physical phía trên, Duration mảnh phía dưới; baseline nằm dưới cùng. Summary có đầu móc; milestone dạng hình thoi. Liên kết FS/SS/FF/SF dùng điểm start/finish tương ứng. Khi endpoint ở trang khác, có tham chiếu mã WBS và số trang; phụ lục liệt kê toàn bộ dependency/lag để kiểm tra. Số trang bao gồm phụ lục.

## Tải file, hủy và kích thước

Ứng dụng chụp snapshot project/result/baseline/theme khi bắt đầu xuất. Worker nhận snapshot, dựng file và trả ArrayBuffer; UI tải Blob qua trình duyệt. Có tiến trình; Hủy xuất hoặc đóng hộp thoại sẽ terminate worker. Đổi dự án cũng hủy phiên xuất để tránh dùng nhầm ngữ cảnh. Không gọi server để tạo báo cáo.

- Excel giới hạn 16.384 cột theo định dạng XLSX và 1.500.000 ô task×timeline cho quá trình dựng trong trình duyệt.
- PDF giới hạn 2.000 trang mỗi lần xuất.
- Nếu vượt giới hạn, ứng dụng báo lỗi rõ ràng và yêu cầu chọn tuần/tháng; không âm thầm cắt bớt dữ liệu. Timeline tuần/tháng vẫn bao phủ toàn bộ khoảng dự án và baseline.
- Hàng nghìn task và timeline nhiều năm nên dùng tuần/tháng. Hiệu năng phụ thuộc RAM thiết bị; có thể hủy mà không ảnh hưởng dự án đang lưu.

## Kiểm chứng

Unit tests kiểm tra presets, biên tháng, tọa độ thời gian, XLSX thật có style/date/links/baseline, 5.000 dòng Excel, PDF A4/A3 có font nhúng và phân trang hai chiều. Browser tests chọn đủ 5 theme, reload và S-Curve đồng bộ; xuất thực tế XLSX và PDF A4/A3 khi WBS đang thu gọn. PDF mẫu được render qua Poppler để kiểm tra trực quan chữ, bảng, ngày và khung ký.
