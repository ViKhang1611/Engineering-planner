import { readStored } from "./storageHelper";
import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".schedule-module")).toBeVisible();
});
test("renders aligned grid/Gantt and responsive desktop layouts without errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(
    page.getByRole("heading", {
      name: "Hệ thống Tự động hóa & Trạm cân Nhà máy",
    }),
  ).toBeVisible();
  await expect(page.locator(".virtual-row")).toHaveCount(12);
  expect(
    await page
      .locator(".virtual-row")
      .first()
      .evaluate((node) => node.getBoundingClientRect().height),
  ).toBe(36);
  expect(
    await page
      .locator(".dual-header")
      .evaluate((node) => node.getBoundingClientRect().height),
  ).toBe(56);
  expect(
    await page
      .locator(".command-ribbon")
      .evaluate((node) => node.getBoundingClientRect().height),
  ).toBe(48);
  await page.locator('[data-task-id="drawing"]').click();
  await expect(page.locator('[data-task-id="drawing"]')).toHaveClass(
    /row-selected/,
  );
  await page.screenshot({ path: "test-results/workspace-1366.png" });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.screenshot({ path: "test-results/workspace-1920.png" });
  expect(errors).toEqual([]);
});
test("edits duration, captures immutable baseline, persists and undoes", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Chốt Baseline", exact: true })
    .click();
  await page.getByRole("button", { name: "Xác nhận chốt Baseline" }).click();
  await expect(page.locator(".baseline-bar")).toHaveCount(12);
  await page.locator('[data-task-id="drawing"] .grid-cell').nth(2).dblclick();
  const input = page.getByRole("spinbutton", { name: /Sửa duration/ });
  await input.fill("6");
  await input.press("Enter");
  await expect(
    page.locator('[data-task-id="drawing"] .grid-cell').nth(2),
  ).toHaveText("6d");
  await expect(page.locator(".storage-state")).toContainText("Đã lưu");
  const data = await readStored(page);
  const saved = data.projects.find(
    (item: { project: { id: string } }) =>
      item.project.id === data.activeProjectId,
  );
  expect(
    saved.project.tasks.find((task: { id: string }) => task.id === "drawing")
      .duration,
  ).toBe(6);
  expect(
    saved.baseline.tasks.find((task: { id: string }) => task.id === "drawing")
      .duration,
  ).toBe(4);
  await page.reload();
  await expect(
    page.locator('[data-task-id="drawing"] .grid-cell').nth(2),
  ).toHaveText("6d");
  await page.locator('[data-task-id="drawing"] .grid-cell').nth(2).dblclick();
  await page.getByRole("spinbutton", { name: /Sửa duration/ }).fill("7");
  await page.getByRole("spinbutton", { name: /Sửa duration/ }).press("Enter");
  await page.getByTitle("Hoàn tác Ctrl+Z").click();
  await expect(
    page.locator('[data-task-id="drawing"] .grid-cell').nth(2),
  ).toHaveText("6d");
});
test("filters consistently, collapses and virtualizes 5000 tasks", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Thu gọn Giai đoạn 1 · Thiết kế & Chế tạo" })
    .click();
  await expect(page.locator(".virtual-row")).toHaveCount(7);
  await page.getByRole("textbox", { name: "Tìm công việc" }).fill("AutoCAD");
  await expect(page.locator(".virtual-row")).toHaveCount(2);
  await page.getByRole("button", { name: "Xóa tìm kiếm" }).click();
  await page.getByRole("button", { name: "5.000 task", exact: true }).click();
  await page.getByRole("button", { name: "Nạp 5.000 task" }).click();
  await expect(
    page.getByRole("heading", { name: /Kiểm chứng hiệu năng/ }),
  ).toBeVisible();
  const rendered = await page.locator(".virtual-row").count();
  expect(rendered).toBeLessThan(50);
  await page.locator(".shared-viewport").evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await expect(page.locator('[data-task-id="t4999"]')).toBeVisible();
  expect(await page.locator(".virtual-row").count()).toBeLessThan(50);
  await page.screenshot({ path: "test-results/workspace-5000.png" });
});
test("rejects a dependency cycle without committing changes", async ({
  page,
}) => {
  const savedBefore = await readStored(page);
  await page.getByRole("button", { name: "Liên kết FS" }).click();
  await page
    .getByLabel("Công việc trước", { exact: true })
    .selectOption("drawing");
  await page
    .getByLabel("Công việc sau", { exact: true })
    .selectOption("survey");
  await page.getByRole("button", { name: "Tạo liên kết & tính lịch" }).click();
  await expect(page.getByRole("alert")).toContainText("DEPENDENCY_CYCLE");
  expect(await readStored(page)).toEqual(savedBefore);
});
test("dragging shows preview, commits with confirmation and supports undo", async ({
  page,
}) => {
  const bar = page.getByRole("button", {
    name: "Thanh Gantt Thiết kế bản vẽ AutoCAD",
    exact: true,
  });
  const box = (await bar.boundingBox())!;
  await page.mouse.move(box.x + 25, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + 109, box.y + 8, { steps: 5 });
  await page.mouse.up();
  await expect(
    page.getByRole("dialog", { name: "Xem trước thay đổi lịch" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(
    page.locator('[data-task-id="drawing"] .grid-cell').nth(3),
  ).toHaveText("09/10/2026");
  await page.getByTitle("Hoàn tác Ctrl+Z").click();
  await expect(
    page.locator('[data-task-id="drawing"] .grid-cell').nth(3),
  ).toHaveText("07/10/2026");
});

test("hover follows the same task across WBS and Gantt and preserves selection", async ({
  page,
}) => {
  const row = page.locator('[data-task-id="drawing"]');
  await row.locator(".grid-row-clip").hover();
  await expect(row).toHaveAttribute("data-hovered", "true");
  const colors = await row.evaluate((node) =>
    [".grid-row-clip", ".gantt-row-clip"].map(
      (selector) =>
        getComputedStyle(node.querySelector(selector)!).backgroundColor,
    ),
  );
  expect(colors[0]).toBe(colors[1]);
  await row.locator(".gantt-row-clip").hover();
  await expect(row).toHaveAttribute("data-hovered", "true");
  await row.locator(".grid-row-clip").click();
  await page
    .getByRole("heading", { name: "Hệ thống Tự động hóa & Trạm cân Nhà máy" })
    .hover();
  await expect(row).toHaveAttribute("data-hovered", "false");
  await expect(row).toHaveClass(/row-selected/);
});

test("an edit made right before reload is not lost to the save debounce", async ({
  page,
}) => {
  await page.locator('[data-task-id="drawing"] .grid-cell').nth(2).dblclick();
  const input = page.getByRole("spinbutton", { name: /Sửa duration/ });
  await input.fill("9");
  await input.press("Enter");
  // Reload immediately, inside the 400 ms debounce window.
  await page.reload();
  await expect(
    page.locator('[data-task-id="drawing"] .grid-cell').nth(2),
  ).toHaveText("9d");
});

test("an edit in one tab appears in another open tab without reload", async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.locator(".schedule-module")).toBeVisible();
  await page.locator('[data-task-id="drawing"] .grid-cell').nth(2).dblclick();
  const input = page.getByRole("spinbutton", { name: /Sửa duration/ });
  await input.fill("11");
  await input.press("Enter");
  await expect(page.locator(".storage-state")).toContainText("Đã lưu");
  await expect(
    other.locator('[data-task-id="drawing"] .grid-cell').nth(2),
  ).toHaveText("11d");
  await expect(
    other.getByRole("status").filter({ hasText: "tab khác" }),
  ).toBeVisible();
  // The other tab can keep editing: its next save is not a conflict.
  await other.locator('[data-task-id="survey"] .grid-cell').nth(2).dblclick();
  const otherInput = other.getByRole("spinbutton", { name: /Sửa duration/ });
  await otherInput.fill("3");
  await otherInput.press("Enter");
  await expect(other.locator(".storage-state")).toContainText("Đã lưu");
  await expect(other.locator(".shell-alert[role=alert]")).toHaveCount(0);
  await expect(
    page.locator('[data-task-id="survey"] .grid-cell').nth(2),
  ).toHaveText("3d");
});

test("hides WBS columns per device and keeps the choice after reload", async ({
  page,
}) => {
  const header = page.locator(".dual-header .column-label");
  await expect(header.filter({ hasText: "Nguồn lực" })).toHaveCount(1);
  await page.locator(".column-menu > summary").click();
  await page.locator(".column-menu-panel").getByLabel("Nguồn lực").uncheck();
  await expect(header.filter({ hasText: "Nguồn lực" })).toHaveCount(0);
  await expect(
    page.locator('[data-task-id="drawing"] [data-column="resources"]'),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.locator(".dual-header .column-label").filter({ hasText: "Nguồn lực" }),
  ).toHaveCount(0);
  await expect(
    page.locator(".dual-header .column-label").filter({ hasText: "WBS" }),
  ).toHaveCount(1);
});

test("dashboard print view hides the shell", async ({ page }) => {
  await page
    .getByRole("button", { name: "Dashboard điều hành", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "In / Lưu PDF" }),
  ).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".shell-sidebar")).toBeHidden();
  await expect(page.locator(".shell-header")).toBeHidden();
  await expect(page.locator(".kpi-grid")).toBeVisible();
});
