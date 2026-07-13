const path = require('node:path');
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  testMatch: 'core-web-vitals.spec.js',
  timeout: 30000,
  retries: 0,
  reporter: [['list']],
  use: { headless: true },
  webServer: {
    command: 'python -m http.server 4173 --bind 127.0.0.1',
    cwd: path.join(__dirname, '..'),
    url: 'http://127.0.0.1:4173/tests/fixtures/slideshow-interaction.html',
    reuseExistingServer: true,
    timeout: 30000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
