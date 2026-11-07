import { useState, useRef, useEffect } from "react";
import { X, Plus, Trash2, FileDown } from "lucide-react";
import type { ScheduledTask, Task } from "../../domain/project";
import { useProjectStore } from "../../store/useProjectStore";
import { setPredecessors } from "../../domain/predecessors";
import {
  attachmentsPersistent,
  blobToDataUrl,
  putAttachments,
  resolveAttachment,
} from "../../infrastructure/persistence/attachmentStore";
import { download } from "../../modules/data/serialization";
export function TaskDetailDrawer({
  task,
  close,
}: {
  task: ScheduledTask;
  close: () => void;
}) {
  const state = useProjectStore();
  const original = useRef(
    JSON.stringify(state.project.tasks.find((t) => t.id === task.id)),
  );
  const [draft, setDraft] = useState<Task>(() =>
    structuredClone(state.project.tasks.find((t) => t.id === task.id)!),
  );
  const drawer = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    drawer.current?.focus();
    return () => previous?.focus();
  }, []);
  const [tab, setTab] = useState("Thông tin");
  const [error, setError] = useState("");
  const [links, setLinks] = useState(() =>
    state.project.dependencies
      .filter((l) => l.successorId === task.id)
      .map(
        (l) =>
          `${state.result.tasks.find((t) => t.id === l.predecessorId)?.wbs}${l.type}${l.lagDays >= 0 ? "+" : ""}${l.lagDays}`,
      )
      .join(", "),
  );
  const patch = (p: Partial<Task>) => setDraft((d) => ({ ...d, ...p }));
  const checks = draft.checklist ?? [];
  const save = () => {
    if (
      JSON.stringify(state.project.tasks.find((t) => t.id === task.id)) !==
      original.current
    ) {
      setError(
        "Công việc đã thay đổi trong lúc chỉnh sửa. Đóng và mở lại chi tiết để dùng dữ liệu mới.",
      );
      return;
    }
    const ok = state.commit((p) => {
      const target = p.tasks.find((t) => t.id === task.id)!;
      if (task.isSummary)
        Object.assign(target, { name: draft.name, notes: draft.notes });
      else {
        Object.assign(target, draft);
        setPredecessors(p, state.result.tasks, task.id, links);
      }
    }, "Đã lưu chi tiết công việc");
    if (ok) close();
  };
  return (
    <aside
      ref={drawer}
      tabIndex={-1}
      className="task-drawer"
      role="dialog"
      aria-label={`Chi tiết ${task.name}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      <header>
        <div>
          <small>
            WBS {task.wbs} · {task.isCritical ? "Đường găng" : "Công việc"}
          </small>
          <h2>{task.name}</h2>
        </div>
        <button aria-label="Đóng chi tiết" onClick={close}>
          <X size={18} />
        </button>
      </header>
      <nav>
        {["Thông tin", "Checklist", "Nguồn lực", "Nghiệm thu", "Tài liệu"].map(
          (t) => (
            <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
              {t}
            </button>
          ),
        )}
      </nav>
      <div className="drawer-content">
        {(error || state.error) && (
          <p role="alert" className="error-box">
            {error || state.error}
          </p>
        )}
        {tab === "Thông tin" && (
          <>
            <label>
              Tên công việc
              <input
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </label>
            <fieldset disabled={task.isSummary} className="form-grid">
              <label>
                Thời lượng (ngày)
                <input
                  type="number"
                  min="0"
                  step="0.125"
                  value={draft.duration}
                  onChange={(e) => patch({ duration: Number(e.target.value) })}
                />
              </label>
              <label>
                Bắt đầu sớm nhất
                <input
                  type="date"
                  value={draft.requestedStartDate ?? ""}
                  onChange={(e) =>
                    patch({ requestedStartDate: e.target.value || undefined })
                  }
                />
              </label>
              <label>
                Hạn chót
                <input
                  type="date"
                  value={draft.deadline ?? ""}
                  onChange={(e) =>
                    patch({ deadline: e.target.value || undefined })
                  }
                />
              </label>
              <label>
                Physical %
                <input
                  type="number"
                  min="0"
                  max="100"
                  disabled={draft.progressMode === "checklist"}
                  value={
                    draft.progressMode === "checklist" && checks.length
                      ? Math.round(
                          (checks.reduce(
                            (n, c) => n + (c.checked ? c.weight : 0),
                            0,
                          ) /
                            checks.reduce((n, c) => n + c.weight, 0)) *
                            100,
                        )
                      : draft.physicalPct
                  }
                  onChange={(e) =>
                    patch({ physicalPct: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Trọng số khối lượng
                <input
                  type="number"
                  min="0.001"
                  step="any"
                  value={draft.progressWeight ?? Math.max(1, draft.duration)}
                  onChange={(e) =>
                    patch({ progressWeight: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Ngân sách (VND)
                <input
                  type="number"
                  min="0"
                  value={draft.budgetCost ?? 0}
                  onChange={(e) =>
                    patch({ budgetCost: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Chi phí thực tế (VND)
                <input
                  type="number"
                  min="0"
                  value={draft.actualCost ?? 0}
                  onChange={(e) =>
                    patch({ actualCost: Number(e.target.value) })
                  }
                />
              </label>
              <label className="full">
                Tiền nhiệm · FS / SS / FF / SF ± ngày
                <input
                  value={links}
                  placeholder="1.2FS+2, 2SS-1"
                  onChange={(e) => setLinks(e.target.value)}
                />
              </label>
            </fieldset>
            <label>
              Ghi chú hiện trường
              <textarea
                rows={5}
                value={draft.notes ?? ""}
                onChange={(e) => patch({ notes: e.target.value })}
              />
            </label>
            <div className="metric-grid">
              {[
                ["Early Start", task.earlyStart / 480],
                ["Early Finish", task.earlyFinish / 480],
                ["Late Start", task.lateStart / 480],
                ["Late Finish", task.lateFinish / 480],
                ["Total Float", task.totalFloat / 480],
              ].map(([k, v]) => (
                <div key={k}>
                  <small>{k} (ngày làm việc từ mốc dự án)</small>
                  <b>{v}</b>
                </div>
              ))}
            </div>
          </>
        )}
        {tab === "Checklist" && (
          <fieldset disabled={task.isSummary}>
            <label>
              Cách đo khối lượng
              <select
                value={draft.progressMode ?? "manual"}
                onChange={(e) =>
                  patch({
                    progressMode: e.target.value as Task["progressMode"],
                  })
                }
              >
                <option value="manual">Nhập Physical % trực tiếp</option>
                <option value="checklist">Tính theo trọng số checklist</option>
              </select>
            </label>
            <p className="muted">
              Physical % = trọng số đã hoàn tất / tổng trọng số. Thay đổi có
              hiệu lực khi lưu.
            </p>
            {checks.map((c, i) => (
              <div className="check-row" key={c.id}>
                <input
                  aria-label={`Hoàn thành ${c.title}`}
                  type="checkbox"
                  checked={c.checked}
                  onChange={(e) =>
                    patch({
                      checklist: checks.map((x, j) =>
                        j === i ? { ...x, checked: e.target.checked } : x,
                      ),
                    })
                  }
                />
                <input
                  aria-label="Đầu việc"
                  value={c.title}
                  onChange={(e) =>
                    patch({
                      checklist: checks.map((x, j) =>
                        j === i ? { ...x, title: e.target.value } : x,
                      ),
                    })
                  }
                />
                <input
                  aria-label="Trọng số"
                  type="number"
                  min="0.01"
                  value={c.weight}
                  onChange={(e) =>
                    patch({
                      checklist: checks.map((x, j) =>
                        j === i ? { ...x, weight: Number(e.target.value) } : x,
                      ),
                    })
                  }
                />
                <button
                  onClick={() =>
                    patch({ checklist: checks.filter((x) => x.id !== c.id) })
                  }
                  aria-label="Xóa đầu việc"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button
              onClick={() =>
                patch({
                  checklist: [
                    ...checks,
                    {
                      id: crypto.randomUUID(),
                      title: "Đầu việc kỹ thuật",
                      weight: 1,
                      checked: false,
                    },
                  ],
                })
              }
            >
              <Plus size={14} /> Thêm đầu việc
            </button>
          </fieldset>
        )}
        {tab === "Nguồn lực" && (
          <fieldset disabled={task.isSummary}>
            <p className="muted">
              100% = 8 giờ/ngày. Phân bổ vượt công suất sẽ được cảnh báo, không
              tự đổi lịch.
            </p>
            {state.project.resources.map((r) => {
              const a = draft.assignments.find((a) => a.resourceId === r.id);
              return (
                <div className="assignment-row" key={r.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={!!a}
                      onChange={(e) =>
                        patch({
                          assignments: e.target.checked
                            ? [
                                ...draft.assignments,
                                { resourceId: r.id, units: 1 },
                              ]
                            : draft.assignments.filter(
                                (a) => a.resourceId !== r.id,
                              ),
                        })
                      }
                    />
                    {r.name} <small>{r.kind}</small>
                  </label>
                  {a && (
                    <input
                      aria-label={`${r.kind === "material" ? "Số lượng" : "Tỷ lệ"} ${r.name}`}
                      type="number"
                      min="0.01"
                      max={r.kind === "material" ? undefined : 4}
                      step="0.1"
                      value={
                        r.kind === "material" ? (a.quantity ?? 1) : a.units
                      }
                      onChange={(e) =>
                        patch({
                          assignments: draft.assignments.map((x) =>
                            x.resourceId === r.id
                              ? {
                                  ...x,
                                  ...(r.kind === "material"
                                    ? { quantity: Number(e.target.value) }
                                    : { units: Number(e.target.value) }),
                                }
                              : x,
                          ),
                        })
                      }
                    />
                  )}
                </div>
              );
            })}
            {!state.project.resources.length && (
              <p>Chưa có nguồn lực. Thêm tại phân hệ Nguồn lực.</p>
            )}
          </fieldset>
        )}
        {tab === "Nghiệm thu" && (
          <fieldset disabled={task.isSummary}>
            <label>
              Loại mốc
              <select
                value={draft.milestoneType ?? ""}
                onChange={(e) =>
                  patch({
                    milestoneType: (e.target.value ||
                      undefined) as Task["milestoneType"],
                  })
                }
              >
                <option value="">Không áp dụng</option>
                <option>FAT</option>
                <option>SAT</option>
                <option>OTHER</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft.acceptance?.accepted ?? false}
                onChange={(e) =>
                  patch({
                    acceptance: {
                      accepted: e.target.checked,
                      date: state.project.statusDate,
                      reference: draft.acceptance?.reference ?? "",
                    },
                  })
                }
              />{" "}
              Đã nghiệm thu
            </label>
            <label>
              Ngày nghiệm thu
              <input
                type="date"
                value={draft.acceptance?.date ?? ""}
                onChange={(e) =>
                  patch({
                    acceptance: {
                      accepted: draft.acceptance?.accepted ?? false,
                      reference: draft.acceptance?.reference ?? "",
                      date: e.target.value,
                    },
                  })
                }
              />
            </label>
            <label>
              Số biên bản
              <input
                value={draft.acceptance?.reference ?? ""}
                onChange={(e) =>
                  patch({
                    acceptance: {
                      accepted: draft.acceptance?.accepted ?? false,
                      date: draft.acceptance?.date ?? "",
                      reference: e.target.value,
                    },
                  })
                }
              />
            </label>
          </fieldset>
        )}
        {tab === "Tài liệu" && (
          <>
            <label>
              Đính kèm bản vẽ / biên bản (tối đa 5 MB/tệp)
              <input
                type="file"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.size > 5 * 1024 * 1024) {
                    setError("Tệp vượt 5 MB");
                    return;
                  }
                  const input = e.target;
                  try {
                    const id = crypto.randomUUID();
                    const type = f.type || "application/octet-stream";
                    // Bytes go to the attachment store now; the task keeps
                    // metadata only. Cancelling leaves an orphan that the next
                    // start-up removes.
                    let data: string | undefined;
                    if (attachmentsPersistent())
                      await putAttachments([{ id, blob: f }]);
                    else data = await blobToDataUrl(f, type);
                    setDraft((d) => ({
                      ...d,
                      attachments: [
                        ...(d.attachments ?? []),
                        { id, name: f.name, size: f.size, type, data },
                      ],
                    }));
                    setError("");
                  } catch {
                    setError("Không đọc hoặc lưu được tệp");
                  } finally {
                    input.value = "";
                  }
                }}
              />
            </label>
            {draft.attachments?.map((a) => (
              <div className="assignment-row" key={a.id}>
                <button
                  type="button"
                  className="text-action"
                  onClick={async () => {
                    try {
                      const blob = await resolveAttachment(a);
                      if (!blob)
                        throw new Error(
                          `Tệp "${a.name}" không còn trên thiết bị này.`,
                        );
                      download(blob, a.name);
                      setError("");
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : "Không mở được tệp",
                      );
                    }
                  }}
                >
                  <FileDown size={14} /> {a.name}
                </button>
                <span>{Math.ceil(a.size / 1024)} KB</span>
                <button
                  aria-label={`Xóa ${a.name}`}
                  onClick={() =>
                    patch({
                      attachments: draft.attachments?.filter(
                        (f) => f.id !== a.id,
                      ),
                    })
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </>
        )}
      </div>
      <footer>
        <button onClick={close}>Đóng</button>
        <button className="primary-button" onClick={save}>
          Lưu thay đổi
        </button>
      </footer>
    </aside>
  );
}
