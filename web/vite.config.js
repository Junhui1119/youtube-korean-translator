import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 开发时未设置 VITE_API_BASE_URL 时，/api 会代理到本地 FastAPI 后端。
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
});
