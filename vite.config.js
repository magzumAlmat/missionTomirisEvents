import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" — относительные пути, чтобы собранный сайт работал в любой подпапке
// (например, на GitHub Pages по адресу /EventTomiris/).
export default defineConfig({
  plugins: [react()],
  base: "./",
});
