import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: {
      "state-workflow-runtime": fileURLToPath(
        new URL("../../../state-workflow-runtime/dist/debugger/headless.js", import.meta.url)
      )
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: false
  },
  build: {
    target: "es2022"
  }
});
