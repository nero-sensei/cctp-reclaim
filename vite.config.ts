import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    global: "globalThis",
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@solana-mobile") || id.includes("qrcode")) return;
          if (/\/@(solana|solana-program|wallet-standard)\//.test(id)) return "solana";
          if (id.includes("motion") || id.includes("number-flow")) return "motion";
          if (id.includes("react-dom") || id.includes("/react/")) return "react";
        },
      },
    },
  },
});
