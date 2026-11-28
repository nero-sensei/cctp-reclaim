import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {},
  lint: {
    categories: { correctness: "error", suspicious: "error" },
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
    overrides: [
      {
        files: ["**/*.test.ts"],
        rules: { "typescript/no-unsafe-type-assertion": "off" },
      },
    ],
  },
  run: {
    cache: true,
  },
});
