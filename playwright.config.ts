import { defineConfig, devices } from '@playwright/test';

const PORT = 5173;

/** Три обязательных вьюпорта (§10). */
const viewports = [
  {
    name: 'phone-portrait',
    use: {
      ...devices['Pixel 7'],
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    },
  },
  {
    name: 'phone-landscape',
    use: {
      ...devices['Pixel 7 landscape'],
      viewport: { width: 844, height: 390 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    },
  },
  {
    name: 'desktop',
    use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } },
  },
];

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    browserName: 'chromium',
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  projects: [
    ...viewports.map((v) => ({ ...v, testIgnore: /screens\.spec\.ts|video\.spec\.ts/ })),
    ...viewports.map((v) => ({
      ...v,
      name: `screens-${v.name}`,
      testMatch: /screens\.spec\.ts/,
    })),
    // Видео прохождения для контрольных точек (§10). DPR 1 — быстрее программный рендер,
    // а разрешение записи всё равно равно CSS-размеру вьюпорта.
    {
      name: 'video-desktop',
      testMatch: /video\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        video: { mode: 'on', size: { width: 1280, height: 720 } },
      },
    },
    {
      name: 'video-phone',
      testMatch: /video\.spec\.ts/,
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
        video: { mode: 'on', size: { width: 390, height: 844 } },
      },
    },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
