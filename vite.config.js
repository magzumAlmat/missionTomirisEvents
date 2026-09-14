import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" — относительные пути, чтобы собранный сайт работал в любой подпапке
// (например, на GitHub Pages по адресу /EventTomiris/).
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    host: true, // Разрешает подключение по IP-адресу в сети (например 172.20.10.7)
  },
});
