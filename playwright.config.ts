import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    locale: "it-IT",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          executablePath: process.env.MYCOTRAIL_CHROMIUM_EXECUTABLE,
        },
      },
    },
    {
      name: "mobile-webkit",
      use: {
        ...devices["iPhone 14 Pro Max"],
        launchOptions: {
          executablePath: process.env.MYCOTRAIL_WEBKIT_EXECUTABLE,
        },
      },
    },
    {
      name: "android-narrow",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 360, height: 800 },
        launchOptions: {
          executablePath: process.env.MYCOTRAIL_CHROMIUM_EXECUTABLE,
        },
      },
    },
  ],
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
});
