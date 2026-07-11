import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    react(), 
    tailwindcss(), 
    // Only inline to a single file at build time, do not interfere with dev server routes!
    command === "build" ? viteSingleFile() : null
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    watch: {
      ignored: [
        "**/database.sqlite",
        "**/database.sqlite-journal",
        "**/*.log",
        "**/server/**",
        "**/uploads/**"
      ]
    },
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
        // Gracefully handle a momentarily-unavailable backend (e.g. during restart) instead
        // of crashing the dev proxy with an unhandled "http proxy error" and leaving the
        // request hanging. Returns a clean 503 the client can retry.
        configure: (proxy) => {
          proxy.on("error", (err, _req, res) => {
            try {
              if (res && "writeHead" in res && !res.headersSent) {
                res.writeHead(503, { "Content-Type": "application/json" });
              }
              if (res && "end" in res) {
                res.end(JSON.stringify({ error: "Backend temporarily unavailable. Please retry." }));
              }
            } catch { /* socket already closed */ }
            console.warn("[vite proxy] backend unavailable:", err.message);
          });
        },
      },
    },
  },
}));
