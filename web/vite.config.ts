import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Build to web/dist; the FastAPI server serves that folder in prod/desktop.
// Dev server proxies /ws and /api to the backend on :8760.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      "/ws": { target: "ws://127.0.0.1:8760", ws: true },
      "/api": "http://127.0.0.1:8760",
    },
  },
});
