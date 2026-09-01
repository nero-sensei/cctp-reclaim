import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const stripFontImport = {
  name: "strip-font-import",
  transform(code: string, id: string) {
    if (!id.includes("wallet-adapter-react-ui") || !id.includes(".css")) return null;
    return code.replace(/@import\s*(url\()?["'][^"']*fonts\.googleapis[^"']*["']\)?\s*;/g, "");
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss(), stripFontImport],
  define: {
    global: "globalThis",
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("wallet-adapter") || id.includes("wallet-standard")) return "wallet";
          if (id.includes("@solana/web3.js")) return "web3";
          if (id.includes("motion") || id.includes("number-flow")) return "motion";
          if (id.includes("react-dom") || id.includes("/react/")) return "react";
        },
      },
    },
  },
});
