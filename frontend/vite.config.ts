import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        popup: "index.html",
        main: "src/main.tsx",
        background: "src/background.ts",
        content: "src/content.ts"
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name]-[hash].js"
      },
      preserveEntrySignatures: "strict"
    }
  }
});
