import { ThemeProvider } from "./theme/ThemeProvider";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/vietnamese-400.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/vietnamese-600.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { initializePersistence } from "./infrastructure/persistence/indexedDbRepository";
import "./styles.css";
async function start() {
  await initializePersistence();
  const { App } = await import("./app/App");
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </React.StrictMode>,
  );
}
void start();
