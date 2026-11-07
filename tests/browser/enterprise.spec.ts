import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { readStored } from "./storageHelper";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".schedule-module")).toBeVisible();
});
test("checklist and acceptance propagate through Kanban, WBS, Dashboard and IndexedDB reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page
    .getByRole("button", { name: "Thực hiện & Nghiệm thu", exact: true })
    .click();
  await page.getByRole("button", { name: /Thiết kế bản vẽ AutoCAD/ }).click();
  await page.getByRole("button", { name: "Checklist", exact: true }).click();
  await page.getByLabel("Cách đo khối lượng").selectOption("checklist");
  await page.getByRole("button", { name: "Thêm đầu việc" }).click();
  await page.getByLabel("Đầu việc", { exact: true }).fill("Duyệt bản vẽ");
  await page.getByLabel("Hoàn thành Duyệt bản vẽ").check();
  await page.getByRole("button", { name: "Nghiệm thu", exact: true }).click();
  await page.getByLabel("Loại mốc").selectOption("FAT");
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  const review = page.locator(".kanban-column.review");
  await expect(
    review.getByText("Thiết kế bản vẽ AutoCAD", { exact: true }),
  ).toBeVisible();
  await review
    .getByLabel("Trạng thái Thiết kế bản vẽ AutoCAD")
    .selectOption("done");
  await expect(
    page
      .locator(".kanban-column.done")
      .getByText("Thiết kế bản vẽ AutoCAD", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Dashboard điều hành", exact: true })
    .click();
  await expect(
    page.getByRole("img", {
      name: "Đường cong kế hoạch và khối lượng thực tế",
    }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/enterprise-dashboard.png" });
  await expect(page.locator(".storage-state")).toContainText("Đã lưu");
  const document = await readStored(page);
  const task = document.projects[0].project.tasks.find(
    (t: { id: string }) => t.id === "drawing",
  );
  expect(task.physicalPct).toBe(100);
  expect(task.acceptance.accepted).toBe(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Dashboard điều hành", level: 2 }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Thực hiện & Nghiệm thu", exact: true })
    .click();
  await expect(
    page
      .locator(".kanban-column.done")
      .getByText("Thiết kế bản vẽ AutoCAD", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("resource heatmap exposes conflicts and pool edits persist", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Nguồn lực", exact: true }).click();
  await expect(page.locator(".heatmap-scroll")).toBeVisible();
  await page.getByRole("button", { name: "+ Nguồn lực", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Tên", { exact: true }).fill("Kỹ sư mới");
  await dialog.getByRole("button", { name: "Lưu nguồn lực" }).click();
  await expect(
    page.locator(".heatmap-row").getByText("Kỹ sư mới", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/enterprise-resources.png" });
  await expect(page.locator(".storage-state")).toContainText("Đã lưu");
  await page.reload();
  await expect(
    page.locator(".heatmap-row").getByText("Kỹ sư mới", { exact: true }),
  ).toBeVisible();
});
test("multiple baseline selection and project JSON download", async ({
  page,
}) => {
  for (let i = 0; i < 2; i++) {
    await page
      .getByRole("button", { name: "Chốt Baseline", exact: true })
      .click();
    await page.getByRole("button", { name: "Xác nhận chốt Baseline" }).click();
  }
  await page
    .getByRole("button", { name: "Chốt Baseline", exact: true })
    .click();
  await expect(
    page.getByLabel("Baseline đối chiếu").locator("option"),
  ).toHaveCount(2);
  await page.getByLabel("Baseline đối chiếu").selectOption({ index: 0 });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Đóng", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Dữ liệu & Báo cáo", exact: true })
    .click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON", exact: true }).click();
  expect((await downloaded).suggestedFilename()).toMatch(/\.json$/);
  await page.screenshot({ path: "test-results/enterprise-data.png" });
});

test("Kanban drag changes shared progress and spreadsheet round-trip works in browser", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Thực hiện & Nghiệm thu", exact: true })
    .click();
  const card = page
    .locator(".kanban-card")
    .filter({ hasText: "Đào tạo vận hành & hồ sơ hoàn công" });
  await card.dragTo(page.locator(".kanban-column.active h3"));
  await expect(
    page
      .locator(".kanban-column.active")
      .getByText("Đào tạo vận hành & hồ sơ hoàn công", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/enterprise-kanban.png" });
  await page
    .getByRole("button", { name: "Dữ liệu & Báo cáo", exact: true })
    .click();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Excel .xlsx", exact: true }).click();
  const download = await downloadEvent;
  await page.locator('input[accept=".json,.csv,.xlsx,.xml"]').setInputFiles({
    name: download.suggestedFilename(),
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: await readFile((await download.path())!),
  });
  await expect(
    page.getByRole("dialog", { name: "Xác nhận nhập dự án" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Thay thế dự án hiện tại" }).click();
  await expect(page.getByRole("status")).toContainText("Đã nhập dự án");
  await page
    .getByRole("button", { name: "Thực hiện & Nghiệm thu", exact: true })
    .click();
  await expect(
    page
      .locator(".kanban-column.active")
      .getByText("Đào tạo vận hành & hồ sơ hoàn công", { exact: true }),
  ).toBeVisible();
});

test("attachments live outside the workspace document and survive reload, export and import", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const content = "Biên bản FAT – tủ MCC-01";
  const openDocuments = async () => {
    await page
      .getByRole("button", { name: "Thực hiện & Nghiệm thu", exact: true })
      .click();
    await page.getByRole("button", { name: /Thiết kế bản vẽ AutoCAD/ }).click();
    await page.getByRole("button", { name: "Tài liệu", exact: true }).click();
  };
  await openDocuments();
  await page.getByLabel(/Đính kèm bản vẽ/).setInputFiles({
    name: "fat.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(content),
  });
  await expect(
    page.getByRole("button", { name: "fat.txt", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(page.locator(".storage-state")).toContainText("Đã lưu");
  const stored = await readStored(page);
  const task = stored.projects[0].project.tasks.find(
    (t: { id: string }) => t.id === "drawing",
  );
  expect(task.attachments).toHaveLength(1);
  expect(task.attachments[0].data).toBeUndefined();
  expect(JSON.stringify(stored)).not.toContain("base64");

  await page.reload();
  await expect(page.locator(".enterprise-shell")).toBeVisible();
  await openDocuments();
  const fileDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "fat.txt", exact: true }).click();
  const file = await fileDownload;
  expect(file.suggestedFilename()).toBe("fat.txt");
  expect(await readFile((await file.path())!, "utf8")).toBe(content);
  await page.getByRole("button", { name: "Đóng", exact: true }).click();

  await page
    .getByRole("button", { name: "Dữ liệu & Báo cáo", exact: true })
    .click();
  const jsonDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON", exact: true }).click();
  const json = await readFile((await (await jsonDownload).path())!, "utf8");
  expect(json).toContain(Buffer.from(content).toString("base64"));
  await page.locator('input[accept=".json,.csv,.xlsx,.xml"]').setInputFiles({
    name: "project.json",
    mimeType: "application/json",
    buffer: Buffer.from(json),
  });
  await page.getByRole("button", { name: "Thay thế dự án hiện tại" }).click();
  await expect(page.getByRole("status")).toContainText("Đã nhập dự án");
  await expect(page.locator(".storage-state")).toContainText("Đã lưu");
  expect(JSON.stringify(await readStored(page))).not.toContain("base64");
  expect(errors).toEqual([]);
});

test("leveling suggestion removes overloads in one undoable step", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Nguồn lực", exact: true }).click();
  const summary = page.locator(".module-toolbar p");
  await expect(summary).not.toContainText(/^0 ô quá tải/);
  await page.getByRole("button", { name: "Gợi ý giãn lịch" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Gợi ý giãn lịch theo nguồn lực",
  });
  await expect(dialog.locator(".leveling-summary")).toContainText("→ 0");
  await dialog.getByRole("button", { name: /^Áp dụng \d+ thay đổi$/ }).click();
  await expect(summary).toContainText("0 ô quá tải");
  await expect(
    page.getByRole("button", { name: "Gợi ý giãn lịch" }),
  ).toBeDisabled();
});

test("exports MS Project XML and imports it back", async ({ page }) => {
  await page
    .getByRole("button", { name: "Dữ liệu & Báo cáo", exact: true })
    .click();
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "MS Project XML", exact: true })
    .click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/\.xml$/);
  const xml = await readFile((await download.path())!, "utf8");
  expect(xml).toContain(
    '<Project xmlns="http://schemas.microsoft.com/project">',
  );
  await expect(page.getByRole("status")).toContainText("MS Project XML");
  await page.locator('input[accept=".json,.csv,.xlsx,.xml"]').setInputFiles({
    name: "plan.xml",
    mimeType: "application/xml",
    buffer: Buffer.from(xml),
  });
  await page.getByRole("button", { name: "Thay thế dự án hiện tại" }).click();
  await expect(page.getByRole("status")).toContainText("Đã nhập dự án");
});
