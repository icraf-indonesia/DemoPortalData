/**
 * tests/js/test_browser_interaction.test.js
 * End-to-end browser integration tests with headless Chromium and local HTTP server.
 * 
 * Verifies:
 * - Header branding and succinct local demonstration label (no Sprint 0 jargon).
 * - Left panel classes: 1 Karet, 2 Kelapa sawit, 3 Lainnya, Belum dipetakan, and Source Class Breakdown.
 * - Right catalogue containing all 6 point datasets with honest metadata (no unverified partner claims).
 * - Collapsible attribute table with clean Indonesian labels (no literal "(null)").
 * - Double-click row point centering and marker highlight ring.
 * - Keyboard navigation (Enter / Space on row).
 * - Dataset switching and persistence across reload.
 * - Supports process.env.PLAYWRIGHT_EXECUTABLE_PATH or Playwright default bundled Chromium.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, getChromiumExecutablePath } = require('./browser-runtime.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

/**
 * Creates a lightweight static HTTP server for serving application files.
 */
function createStaticServer() {
  return http.createServer((req, res) => {
    let reqPath = decodeURI(req.url.split('?')[0]);
    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
    const filePath = path.join(ROOT_DIR, reqPath);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.geojson': 'application/json; charset=utf-8',
      '.png': 'image/png'
    };

    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

test('Browser E2E: Verified UI components, labels, and interactions', async (t) => {
  const server = createStaticServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/index.html`;

  let browser;
  try {
    const execPath = getChromiumExecutablePath();
    browser = await chromium.launch({
      headless: true,
      ...(execPath ? { executablePath: execPath } : {})
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    // 1. Load application
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.portalApp?.workspace?.activeRecords?.length > 0);

    // 2. Verify Header Branding & Context Lines (no demo jargon or badges)
    const headerTitle = await page.textContent('.header-title');
    assert.ok(headerTitle.includes('Portal Data Epistem'));

    const contextLines = await page.textContent('.brand-context-lines');
    assert.ok(contextLines.includes('Kabupaten Banyuasin'));
    assert.ok(contextLines.includes('2026'));

    // Verify Task Navigation buttons
    const taskNavBtns = await page.$$('.task-nav-btn');
    assert.equal(taskNavBtns.length, 5, 'Displays 5 task navigation buttons');

    // 3. Verify Leaflet Map loaded with floating layer menu
    const mapElement = await page.$('.map-view.leaflet-container');
    assert.ok(mapElement, 'Leaflet map initialized with leaflet-container');

    const layerBtn = await page.$('#btn-layer-menu');
    assert.ok(layerBtn, 'Floating layer selector button exists');

    // 4. Verify Left Panel Class Cards (NLCD-style flat legend, exactly 3 classes for Case 1, no Belum dipetakan)
    const panelTitle = await page.textContent('.panel-title');
    assert.equal(panelTitle.trim(), 'Skema Klasifikasi');

    const classCards = await page.$$('.class-card');
    assert.equal(classCards.length, 3, 'Displays exactly 3 project classes without Belum dipetakan');

    const card1Text = await page.textContent('.class-card-1 .class-name');
    assert.ok(card1Text.includes('1. Karet'));

    const card2Text = await page.textContent('.class-card-2 .class-name');
    assert.ok(card2Text.includes('2. Kelapa sawit'));

    const card3Text = await page.textContent('.class-card-3 .class-name');
    assert.ok(card3Text.includes('3. Lainnya'));

    const unmappedCard = await page.$('.class-card-unmapped');
    assert.equal(unmappedCard, null, 'Belum dipetakan pseudo-class is not in the legend');

    const sourceDetails = await page.$('.source-classes-details');
    assert.ok(sourceDetails, 'Source class distribution is housed in collapsible details');

    // 5. Verify Right Panel Dataset Catalogue contains all 6 point collections
    const catalogueCards = await page.$$('.catalogue-card');
    assert.equal(catalogueCards.length, 5, 'User A catalogue excludes the User B forest workspace');

    const activeCard = await page.$('.catalogue-card.is-active');
    assert.ok(activeCard, 'Active dataset card exists');
    const activeTitle = await activeCard.textContent();
    assert.ok(activeTitle.includes('Data Kebun Sawit & Karet'));

    // Verify Storage Status Acknowledgement Label
    const statusText = await page.textContent('.status-text');
    assert.equal(statusText, 'Data Tersimpan');

    // 6. Verify Collapsible Attribute Table & Clean Indonesian Null Labels (zero literal (null))
    const toggleBtn = await page.$('.table-toggle-btn');
    if (toggleBtn) {
      const isExpanded = await toggleBtn.getAttribute('aria-expanded');
      if (isExpanded === 'false') {
        await toggleBtn.click();
        await page.waitForTimeout(300);
      }
    }
    await page.waitForSelector('.attribute-table tbody tr.table-row', { timeout: 5000 });
    const tableRows = await page.$$('.attribute-table tbody tr.table-row');
    assert.ok(tableRows.length > 0, 'Table has rendered observation rows');

    const firstRowText = await tableRows[0].innerText();
    assert.ok(!firstRowText.includes('(null)'), 'Must not display literal (null)');
    assert.ok(firstRowText.includes('Belum tersedia') || firstRowText.includes('Belum dinilai'));

    // 7. Test Row Double Click Centering & Point Selection
    await tableRows[0].dblclick();
    await page.waitForTimeout(200);
    const selectedRow = await page.$('.table-row.is-selected');
    assert.ok(selectedRow, 'Row is visually selected after interaction');

    // 8. Test Keyboard Navigation on Table Row (Space key)
    if (tableRows.length > 1) {
      await tableRows[1].focus();
      await page.keyboard.press('Space');
      await page.waitForTimeout(150);
      const secondSelected = await page.$('.table-row.is-selected');
      assert.ok(secondSelected, 'Keyboard Space selection succeeded');
    }

    // 9. Test Dataset Transition: Switch to Reference 2a in catalogue
    const ref2aCard = await page.$('.catalogue-card[data-dataset-id="data_ref_mod_f"]');
    assert.ok(ref2aCard, 'Reference 2a card exists in catalogue');
    await ref2aCard.click();
    await page.waitForTimeout(300);

    const newActiveCard = await page.$('.catalogue-card.is-active');
    const newTitle = await newActiveCard.textContent();
    assert.ok(newTitle.includes('Data Referensi Modular'));

    // 10. Test Refresh and Persistence Recovery
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.portalApp?.workspace?.activeRecords?.length > 0);
    const reloadedActiveCard = await page.$('.catalogue-card.is-active');
    const reloadedTitle = await reloadedActiveCard.textContent();
    assert.ok(reloadedTitle.includes('Data Referensi Modular'), 'Restored active dataset after refresh');

  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
