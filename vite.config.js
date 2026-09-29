import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "/" — абсолютные пути, сайт работает на корневом домене (89.207.249.82)
// При деплое на GitHub Pages в подпапке — поменять обратно на "./"
export default defineConfig({
  plugins: [react()],
  base: "/",
  server: {
    host: true, // Разрешает подключение по IP-адресу в сети (например 172.20.10.7)
  },
});
