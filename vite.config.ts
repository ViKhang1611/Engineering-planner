import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  optimizeDeps: { include: ["exceljs", "pdf-lib", "@pdf-lib/fontkit"] },
  worker: { format: "es" },
  plugins: [react(), tailwindcss()],
  build: { sourcemap: true },
});
