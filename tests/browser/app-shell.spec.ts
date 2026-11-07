import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".schedule-module")).toBeVisible();
});

test("creates a second project and keeps schedules isolated across navigation and reload", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Danh mục dự án", exact: true })
    .click();
  await page.getByRole("button", { name: "Tạo dự án", exact: true }).click();
  await page
    .getByLabel("Tên dự án", { exact: true })
    .fill("Tủ điều khiển dây chuyền B");
  await page.getByLabel("Mã hợp đồng").fill("PLC-B-2026");
  await page.getByLabel("Chủ đầu tư").fill("Nhà máy B");
  await page.getByRole("button", { name: "Tạo và mở dự án" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Tủ điều khiển dây chuyền B",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".virtual-row")).toHaveCount(0);
  await page.getByRole("button", { name: "Thêm Task", exact: true }).click();
  await expect(page.locator(".virtual-row")).toHaveCount(1);
  const second = await page.getByLabel("Dự án đang làm việc").inputValue();
  await page
    .getByLabel("Dự án đang làm việc")
    .selectOption("automation-weighbridge");
  await expect(page.locator(".virtual-row")).toHaveCount(12);
  await page.getByLabel("Dự án đang làm việc").selectOption(second);
  await page.reload();
  await expect(page.locator(".virtual-row")).toHaveCount(1);
  await expect(page.locator(".contract-code")).toHaveText("PLC-B-2026");
  await page
    .getByRole("button", { name: "Danh mục dự án", exact: true })
    .click();
  await expect(page.locator(".enterprise-table tbody tr")).toHaveCount(2);
  await page.screenshot({ path: "test-results/phase1-portfolio.png" });
});

test("settings update the shell and schedule while retaining baseline", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Chốt Baseline", exact: true })
    .click();
  await page.getByRole("button", { name: "Xác nhận chốt Baseline" }).click();
  await page
    .getByRole("button", { name: "Thiết lập dự án", exact: true })
    .click();
  await page
    .getByLabel("Tên dự án", { exact: true })
    .fill("Dự án kỹ thuật đã cập nhật");
  await page.getByLabel("Mã hợp đồng").fill("HD-UPDATED");
  await page.getByLabel("Ngày nghỉ lễ", { exact: true }).fill("2026-10-05");
  await page.getByRole("button", { name: "Lưu thông tin dự án" }).click();
  await expect(page.getByRole("status")).toContainText("Đã lưu");
  await expect(page.locator(".contract-code")).toHaveText("HD-UPDATED");
  await page.screenshot({ path: "test-results/phase1-settings.png" });
  await page.getByRole("button", { name: "Lập tiến độ", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Dự án kỹ thuật đã cập nhật",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.locator('[data-task-id="survey"] .grid-cell').nth(3),
  ).toHaveText("06/10/2026");
  await expect(page.getByTitle("So sánh baseline")).toBeEnabled();
});

test("sidebar, module views, browser back and route restoration work", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const expand = page.getByRole("button", { name: "Mở rộng thanh điều hướng" });
  if (await expand.isVisible()) await expand.click();
  await expect(page.locator(".shell-sidebar")).toHaveCSS("width", "208px");
  await page.screenshot({ path: "test-results/phase1-schedule-desktop.png" });
  await page.getByRole("button", { name: "Nguồn lực", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Nguồn lực & phân bổ công việc",
      level: 2,
    }),
  ).toBeVisible();
  await expect(page.locator(".heatmap-scroll")).toBeVisible();
  await page
    .getByRole("button", { name: "Thiết lập dự án", exact: true })
    .click();
  await page.goBack();
  await expect(
    page.getByRole("heading", {
      name: "Nguồn lực & phân bổ công việc",
      level: 2,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Nguồn lực & phân bổ công việc",
      level: 2,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Thu gọn thanh điều hướng" }).click();
  await expect(page.locator(".shell-sidebar")).toHaveCSS("width", "56px");
});

test("keyboard navigation and horizontal bounds at laptop resolution", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const collapse = page.getByRole("button", {
    name: "Thu gọn thanh điều hướng",
  });
  if (await collapse.isVisible()) await collapse.click();
  await expect(page.locator(".shell-header")).toHaveCSS("height", "48px");
  await expect(page.locator(".virtual-row").first()).toHaveCSS(
    "height",
    "36px",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    1366,
  );
  const nav = page.getByRole("button", { name: "Danh mục dự án", exact: true });
  await nav.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Danh mục dự án", level: 2 }),
  ).toBeVisible();
  expect(
    await page
      .locator(".enterprise-table tbody tr")
      .first()
      .evaluate((node) => node.getBoundingClientRect().height),
  ).toBe(36);
});

test("portfolio progress updates immediately after editing the scheduling module", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Danh mục dự án", exact: true })
    .click();
  const before = await page
    .locator(".enterprise-table tbody tr td")
    .nth(5)
    .innerText();
  await page.getByRole("button", { name: "Lập tiến độ", exact: true }).click();
  const row = page.locator('[data-task-id="plc"]');
  await row.dblclick();
  await page.getByLabel(/Physical/).fill("100");
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await page
    .getByRole("button", { name: "Danh mục dự án", exact: true })
    .click();
  await expect(
    page.locator(".enterprise-table tbody tr td").nth(5),
  ).not.toHaveText(before);
});

test("duplicates and deletes projects from the portfolio, surviving reload", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Danh mục dự án", exact: true })
    .click();
  const rows = page.locator(".enterprise-table tbody tr");
  await expect(rows).toHaveCount(1);
  // The only project cannot be deleted.
  await expect(page.getByRole("button", { name: /^Xóa / })).toBeDisabled();
  const name = (await rows.first().locator(".project-link").innerText()).trim();
  await page.getByRole("button", { name: `Nhân bản ${name}` }).click();
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText(`${name} (bản sao)`);
  await page.getByRole("button", { name: `Xóa ${name} (bản sao)` }).click();
  await page.getByRole("button", { name: "Xóa vĩnh viễn" }).click();
  await expect(rows).toHaveCount(1);
  await expect(page.locator(".storage-state")).toContainText("Đã lưu");
  await page.reload();
  await expect(page.locator(".enterprise-table tbody tr")).toHaveCount(1);
});

test("work week and shift times flow into the schedule and shell", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Thiết lập dự án", exact: true })
    .click();
  await page.getByLabel("Làm việc T7").uncheck();
  await page.getByLabel("Ca sáng bắt đầu").fill("07:30");
  await page.getByLabel("Ca chiều bắt đầu").fill("12:30");
  await expect(page.locator(".calendar-fields .field-hint")).toContainText(
    "T2–T6 · 07:30–11:30 / 12:30–16:30",
  );
  await page.getByRole("button", { name: "Lưu thông tin dự án" }).click();
  await expect(page.getByRole("status")).toContainText("Đã lưu");
  await expect(page.locator(".shell-calendar")).toContainText("T2–T6");
  await page.getByRole("button", { name: "Lập tiến độ", exact: true }).click();
  await expect(page.locator(".project-heading")).toContainText(
    "T2–T6 · 07:30–11:30 / 12:30–16:30",
  );
  await page.reload();
  await expect(page.locator(".shell-calendar")).toContainText("T2–T6");
});

test("header bell is an accessible link to the dashboard", async ({ page }) => {
  const bell = page.getByRole("button", { name: /việc đường găng/ });
  await expect(bell).toBeVisible();
  await bell.click();
  await expect(
    page.getByRole("heading", { name: "Dashboard điều hành", level: 2 }),
  ).toBeVisible();
  // Standalone app: no fake cloud/profile chips, no window dots.
  await expect(
    page.locator(".header-cloud-chip, .header-profile-ring, .window-dots"),
  ).toHaveCount(0);
});
