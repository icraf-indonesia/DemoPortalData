/**
 * tests/js/browser-runtime.js
 * Common browser runtime helper for Playwright E2E tests.
 * Resolves Playwright Chromium and custom executable paths without hardcoded locations.
 */

const fs = require('node:fs');
const { chromium } = require('playwright');

/**
 * Returns custom Chromium executable path from process.env.PLAYWRIGHT_EXECUTABLE_PATH
 * if set and exists; otherwise returns undefined to allow Playwright's default bundled Chromium.
 */
function getChromiumExecutablePath() {
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH && fs.existsSync(process.env.PLAYWRIGHT_EXECUTABLE_PATH)) {
    return process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  }
  return undefined;
}

module.exports = {
  chromium,
  getChromiumExecutablePath
};
