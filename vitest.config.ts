import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only the TypeScript sources are tests; never collect compiled copies from dist/.
    include: ["test/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "dist/**"],
  },
});
