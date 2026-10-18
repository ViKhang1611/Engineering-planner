import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  use: {
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1366, height: 768 },
    headless: true,
    launchOptions: {
      args:
        process.env.CI_RESTRICTED === "1"
          ? ["--single-process", "--no-zygote"]
          : [],
    },
  },
  webServer: {
    command: "npm run dev -- --port 5173",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
  },
  timeout: 30000,
});
