import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60000,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { trace: "retain-on-failure", actionTimeout: 10000 },
  outputDir: "test-results",
});
