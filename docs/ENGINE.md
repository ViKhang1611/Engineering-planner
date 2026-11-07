# Hợp đồng và quy tắc scheduling engine

## Đầu vào và kết quả

`scheduleProject(input: ProjectInput): ScheduleResult` là hàm thuần: không sửa đối tượng đầu vào. Types được khai báo trong `src/domain/project.ts`. Lỗi nghiệp vụ là `SchedulingError` gồm `code`, `message`, `taskIds`.

- `ProjectInput`: thông tin dự án, ngày bắt đầu, ngày báo cáo, ngày lễ, tasks, dependencies và resources.
- Task: ID ổn định, parentId hoặc null, tên, duration (ngày công), physicalPct 0–100, requestedStartDate tùy chọn, assignments.
- Assignment: resourceId và units; 1 = 100%, 0.5 = 50%, 1.5 = 150%.
- Dependency: predecessorId, successorId, type và lagDays. Tối đa một quan hệ cho mỗi cặp có hướng; không liên kết summary.
- Kết quả có cây phẳng theo thứ tự WBS, lịch tính được, CPM, phần trăm thời gian, giờ nguồn lực/ngày và cảnh báo.

Giới hạn: 5.000 tasks, 50.000 dependencies; chân trời khoảng 100 năm. Độ chính xác thời lượng một phút. UI nhập nhanh mặc định bước 0.125 ngày = 1 giờ; input JSON có thể dùng số ngày quy đổi thành phút nguyên. Các lịch rất dài với nhiều nguồn lực tạo nhiều bản ghi resource-day, vì vậy 5.000 task không có nghĩa mọi chân trời lịch đều có cùng chi phí xử lý.

## Lịch và biên thời gian

Ngày nhập dùng ISO `yyyy-MM-dd`, hiển thị `dd/MM/yyyy`. Thời điểm kết quả có offset `+07:00` (Asia/Ho_Chi_Minh). Lịch mặc định cố định T2–T7, hai ca 08–12 và 13–17. Ngoại lệ MVP là danh sách ngày lễ nghỉ cả ngày. Không trừ ngày lễ tự động theo tên lễ; quản lý nhập ngày nghỉ của công ty.

Quy đổi 1 ngày công = 480 phút. Mọi phép cộng duration/lag và float chạy trên trục **phút làm việc**, bỏ qua nghỉ trưa, Chủ Nhật và ngày lễ. Các công việc dùng cùng một calendar.

Khoảng thực hiện là `[start, finish)`. Ví dụ task 1 ngày bắt đầu T2 08:00 và kết thúc T2 17:00; task FS tiếp theo bắt đầu T3 08:00. Task 0.5 ngày từ 08:00 kết thúc 12:00; FS tiếp theo bắt đầu 13:00. Hai thời điểm này có cùng tọa độ làm việc nhưng cách hiển thị start/finish khác nhau tại biên nghỉ.

Milestone có start = finish. Nếu một milestone FS nằm ở biên cuối ngày, bản này hiển thị đầu ca ngày làm việc kế tiếp. Đó là quy ước của bản MVP, cần giữ nhất quán khi đối chiếu công cụ khác.

`requestedStartDate` là ngày không-bắt-đầu-trước. Kết quả `startDate/endDate` không được dùng lại làm đầu vào cho lần tính sau, tránh vô tình giữ lịch cũ khi tiền nhiệm rút ngắn. Summary lấy min start / max finish; duration summary là khoảng bao phủ theo lịch, không phải tổng duration con.

## Bốn quan hệ và CPM

Đặt `sᵢ` là start của task i, `dᵢ` là duration bằng phút, `L` là lag bằng phút. Mỗi liên kết chuyển thành bất đẳng thức `sⱼ >= sᵢ + wᵢⱼ`:

| Loại                  | Bất đẳng thức          | wᵢⱼ         |
| --------------------- | ---------------------- | ----------- |
| FS — Finish to Start  | sⱼ >= sᵢ + dᵢ + L      | dᵢ + L      |
| SS — Start to Start   | sⱼ >= sᵢ + L           | L           |
| FF — Finish to Finish | sⱼ + dⱼ >= sᵢ + dᵢ + L | dᵢ − dⱼ + L |
| SF — Start to Finish  | sⱼ + dⱼ >= sᵢ + L      | L − dⱼ      |

Kahn topological sort kiểm tra đồ thị có hướng không chu trình (DAG). Cây WBS được kiểm tra riêng; cha–con không tạo cạnh phụ thuộc.

Lượt đi theo thứ tự topo:

```text
ES[j] = max(0, requestedStart[j], max(ES[i] + w[i,j]))
EF[j] = ES[j] + d[j]
T = max(EF[k]) trên tất cả công việc lá/cột mốc
```

Lượt về theo thứ tự topo đảo ngược:

```text
LS[i] = min(T − d[i], min(LS[j] − w[i,j]))
LF[i] = LS[i] + d[i]
TotalFloat[i] = LS[i] − ES[i]
isCritical[i] = TotalFloat[i] === 0
```

ES/EF/LS/LF/TotalFloat trả về bằng phút làm việc so với đầu dự án. UI chia 480 để hiển thị float theo ngày. Summary không phải nút CPM: late start/finish được đặt bằng early để hiển thị kỹ thuật; `isCritical=false`. Không diễn giải totalFloat của summary như CPM độc lập.

Dự án hiện lấy ngày kết thúc sớm nhất tính được làm mốc lượt về. Chưa có deadline bắt buộc nên không sinh float âm. Không kết luận một task có slack âm trước khi có chức năng deadline/ràng buộc cứng. CPM không xét giới hạn năng lực nguồn lực.

## Roll-up và hai chỉ số

Với tập công việc **lá** nằm dưới summary, trọng số `w[k] = progressWeight[k] ?? durationMinutes[k]`:

```text
SummaryPhysicalPct = Σ(w[k] × physicalPct[k]) / Σw[k]
SummaryDurationPct = Σ(w[k] × durationPct[k]) / Σw[k]
```

Tính bộ ba tổng trọng số / tổng tiến độ có trọng số / tổng thời gian có trọng số từ dưới lên; không lấy duration khoảng bao phủ của summary trung gian làm trọng số. Session Enterprise khởi tạo progressWeight bằng max(duration, 1) khi chưa có; giữ trọng số cố định qua sửa duration. Vì vậy milestone mặc định có trọng số 1. Engine thuần vẫn tương thích đầu vào cũ không có progressWeight: milestone duration 0 không tăng trọng số; nhánh chỉ milestone đạt 100 khi mọi milestone hoàn tất.

Duration % của task lá bằng `clamp((statusEnd − ES) / duration, 0, 1) × 100`. `statusEnd` là cuối ngày làm việc báo cáo; ngày nghỉ dùng cuối ngày làm việc trước đó. Milestone có Duration % 100 khi mốc thời gian đã trôi qua, không phụ thuộc Physical %.

Physical % phản ánh nghiệm thu, được nhập độc lập; không dùng để tự tính Remaining Duration hoặc khóa task. Sửa Physical % vẫn chạy cùng quy trình kiểm tra/tính lại để giữ kết quả roll-up và cảnh báo nhất quán.

## Nguồn lực

```text
workHours = durationMinutes / 60 × assignmentUnits
resourceDayHours = tổng phút giao nhau với ngày công / 60 × assignmentUnits
warning = resourceDayHours > resource.capacityHours
```

Seed đặt capacity 8h/ngày cho cả kỹ sư và thiết bị. Duration không tự thay đổi khi thêm người hoặc sửa units. Milestone không tiêu thụ giờ. Không có auto-resource leveling. Lỗi quá tải không chặn lưu, chỉ cảnh báo đỏ kèm icon và số giờ. Peak pill là giờ cao điểm của nguồn lực trong toàn dự án; danh sách ngày chi tiết có trong `ScheduleResult.overloads`.

## Baseline và tính nhất quán

Baseline copy ID, ngày/thời điểm bắt đầu–kết thúc, duration, work và Physical %; không lưu tham chiếu tới kết quả hiện hành. Một baseline đang hoạt động được lưu cùng dự án. Khi sửa, schedule session clone input, chạy toàn bộ engine, chỉ thay state và ghi localStorage nếu tính thành công. Lỗi lịch không tạo một nửa dữ liệu đã cập nhật.

Undo/redo lưu tối đa 10 snapshot đầu vào/baseline. Không lưu bản sao toàn bộ DOM hoặc computed schedule vào localStorage. Khi reload/import, engine tính lại để có dữ liệu dẫn xuất mới. Xuất/nhập JSON giữ baseline và ID; WBS được tạo lại từ cây.

## Hiệu năng

Đo bằng `npm run benchmark` (riêng engine) và `scripts/commit-profile.ts` (một lần sửa trọn vẹn, chia theo bước). Hai tối ưu không đổi kết quả tính:

- **Cache ngày:** `parseDate` kiểm tra chặt (regex, `Date`, so lại `toISOString`) và từng chiếm khoảng 36% thời gian engine vì được gọi ở mỗi bước tìm ngày làm việc. Mỗi chuỗi ngày giờ chỉ kiểm tra một lần (`dateMs`, giới hạn 100.000 mục); `parseDate` vẫn trả `Date` mới cho người gọi. Thứ trong tuần tính bằng số học trên số ngày từ 1970-01-01; ngày lễ tra bằng `Set` cache theo mảng `holidays`.
- **Sao chép khi commit:** `cloneForCommit` sao chép sâu mọi thứ trừ baseline. Baseline là bản chụp bất biến của toàn bộ task (chốt mới chỉ thêm bản mới), nên được dùng chung tham chiếu; mảng `baselines` vẫn được sao chép để có thể thêm/bớt. Không được sửa một baseline tại chỗ.

**Chưa chuyển CPM sang Web Worker.** Sau tối ưu, một lần sửa trên 5.000 task/4.702 liên kết mất khoảng 30 ms trên máy tham chiếu; máy yếu hơn 3–4 lần vẫn dưới khoảng 120 ms. Chuyển sang Worker buộc `commit` thành bất đồng bộ, trong khi nhiều nơi dựa vào kết quả đồng bộ (`updateTask`/`link`/`updateSettings` trả `boolean` để đóng Drawer hoặc báo lỗi ngay, undo/redo, kiểm tra dữ liệu nhập), và phải truyền project qua `postMessage` (tự nó là một lần sao chép tương đương `structuredClone`). Nên xem lại khi giới hạn 5.000 task được nâng, hoặc khi đo trên máy người dùng vượt khoảng 100 ms mỗi lần sửa.
