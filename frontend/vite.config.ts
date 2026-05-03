import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "fs";
import { resolve } from "path";

const host = process.env.TAURI_DEV_HOST;

function readBackendPort(): number {
  try {
    const portFile = resolve(__dirname, ".backend-port");
    return parseInt(readFileSync(portFile, "utf-8").trim(), 10);
  } catch {
    console.warn("[vite] .backend-port not found, falling back to 8765");
    return 8765;
  }
}

export default defineConfig(async () => {
  const backendPort = readBackendPort();

  return {
    plugins: [react(), tailwindcss()],
    define: {
      __BACKEND_PORT__: backendPort,
    },
    clearScreen: false,
    server: {
      port: 1420,
      strictPort: false,
      host: host || false,
      hmr: host
        ? {
            protocol: "ws",
            host,
            port: 1421,
          }
        : undefined,
      watch: {
        ignored: ["**/src-tauri/**"],
      },
      proxy: {
        "/api": {
          target: `http://127.0.0.1:${backendPort}`,
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on("proxyRes", (proxyRes, _req, res) => {
              if (proxyRes.headers["content-type"]?.includes("text/event-stream")) {
                res.flushHeaders();
              }
            });
          },
        },
      },
    },
  };
});
