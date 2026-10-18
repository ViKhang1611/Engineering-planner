import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import ExcelJS from "exceljs";
const { Workbook } = ExcelJS;
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".schedule-module")).toBeVisible();
});
test("all five themes apply to complete workspace, persist, and synchronize dashboard curves", async ({
  page,
}) => {
  const themes = ["slate", "classic", "dark", "blueprint", "contrast"];
  const colors = [];
  for (const id of themes) {
    await page.getByLabel("Theme giao diện").selectOption(id);
    await expect(page.locator("html")).toHaveAttribute("data-theme", id);
    colors.push(
      await page
        .locator(".physical-fill")
        .first()
        .evaluate((e) => getComputedStyle(e).backgroundColor),
    );
    await page.screenshot({ path: `test-results/theme-${id}.png` });
  }
  expect(new Set(colors).size).toBeGreaterThanOrEqual(4);
  await page.getByLabel("Theme giao diện").selectOption("dark");
  await page.reload();
  await expect(page.getByLabel("Theme giao diện")).toHaveValue("dark");
  await page
    .getByRole("button", { name: "Dashboard điều hành", exact: true })
    .click();
  await expect(page.locator(".dashboard")).toBeVisible();
  await expect(page.locator(".dashboard svg path").nth(1)).toHaveCSS(
    "stroke",
    "rgb(6, 182, 212)",
  );
  await page.screenshot({ path: "test-results/theme-dark-dashboard.png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    1366,
  );
});
test("downloads XLSX and PDFs in A4/A3 from worker with full WBS including collapsed rows", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page
    .getByRole("button", { name: "Chốt Baseline", exact: true })
    .click();
  await page.getByRole("button", { name: "Xác nhận chốt Baseline" }).click();
  await page
    .getByRole("button", {
      name: "Thu gọn Giai đoạn 1 · Thiết kế & Chế tạo",
      exact: true,
    })
    .click();
  await page.locator('[data-task-id="plc"]').dblclick();
  await expect(page.locator(".task-drawer")).toBeVisible();
  for (const format of ["xlsx", "pdf"] as const) {
    for (const paper of format === "pdf" ? ["a4", "a3"] : ["a4"]) {
      await page
        .getByRole("button", { name: "Xuất Kế hoạch", exact: false })
        .click();
      await page
        .getByRole("menuitem", {
          name:
            format === "xlsx"
              ? "Excel .xlsx · WBS + Gantt"
              : "PDF · A4/A3 ngang + Gantt",
          exact: true,
        })
        .click();
      const dialog = page.getByRole("dialog", {
        name: format === "pdf" ? "Xuất kế hoạch PDF" : "Xuất kế hoạch Excel",
      });
      await dialog.getByLabel("Khổ giấy").selectOption(paper);
      const event = page.waitForEvent("download", { timeout: 20000 });
      await dialog
        .getByRole("button", {
          name: `Tải ${format.toUpperCase()}`,
          exact: true,
        })
        .click();
      const download = await event;
      const bytes = await readFile((await download.path())!);
      expect(bytes.byteLength).toBeGreaterThan(1000);
      if (format === "xlsx") {
        const book = new Workbook();
        await book.xlsx.load(
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer,
        );
        expect(book.getWorksheet("Ke hoach Gantt")!.rowCount).toBe(19);
      } else {
        const pdf = await PDFDocument.load(bytes);
        expect(pdf.getPage(0).getWidth()).toBeGreaterThan(
          pdf.getPage(0).getHeight(),
        );
        expect(pdf.getPage(0).getWidth()).toBeCloseTo(
          paper === "a4" ? 841.89 : 1190.55,
          1,
        );
        await download.saveAs(`test-results/sample-${paper}.pdf`);
      }
      await expect(dialog.getByRole("status")).toContainText("Đã tải");
      await dialog
        .getByRole("button", { name: "Đóng", exact: true })
        .last()
        .click();
    }
  }
  expect(errors).toEqual([]);
});
