import { defineConfig, devices } from "@playwright/test";

// Interaction tests (docs/adr/0001): Chromium only — the bugs this tier
// exists to catch (input wiring, hit-testing) are our own code, not
// browser-engine quirks, so a full cross-browser matrix isn't worth the
// extra CI time and flakiness surface for this project.
export default defineConfig({
  testDir: "./interaction",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:4321",
    trace: "retain-on-failure",
    // The game renders via PixiJS/WebGL, which headless Chromium has no GPU
    // for by default. This forces ANGLE's software (SwiftShader) backend so
    // a real WebGL context exists in CI/headless runs without needing a GPU.
    launchOptions: {
      args: ["--use-gl=angle", "--use-angle=swiftshader"],
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:4321",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
