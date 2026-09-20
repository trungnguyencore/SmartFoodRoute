import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://127.0.0.1:5173", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: "npm run build -- --outDir dist-e2e && npm run preview -- --outDir dist-e2e --port 5175 --strictPort",
      url: "http://127.0.0.1:5175",
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        VITE_SUPABASE_URL: "http://127.0.0.1:54329",
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_e2e_test_only",
        VITE_APP_URL: "http://127.0.0.1:5175",
        VITE_MAPTILER_API_KEY: "map-style-fixture-only",
      },
    },
    {
      command: "npm run dev -- --port 5173 --strictPort --mode smoke",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: false,
      env: {
        VITE_SUPABASE_URL: "",
        VITE_SUPABASE_PUBLISHABLE_KEY: "",
        VITE_MAPTILER_API_KEY: "",
      },
    },
    {
      command: "npm run dev -- --port 5174 --strictPort --mode mocked-e2e",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: false,
      // Deliberate TEST-ONLY configuration. All requests are intercepted by e2e fixtures.
      env: {
        VITE_SUPABASE_URL: "http://127.0.0.1:54329",
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_e2e_test_only",
        VITE_APP_URL: "http://127.0.0.1:5174",
        VITE_MAPTILER_API_KEY: "",
      },
    },
  ],
});
