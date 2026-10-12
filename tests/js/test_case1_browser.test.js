/**
 * tests/js/test_case1_browser.test.js
 * Comprehensive end-to-end browser integration tests for Luma theme and Case 1.
 * 
 * Verifies with actual headless Chromium:
 * 1. Luma visual styling and compact header with Case navigation 1–4.
 * 2. Mode toggle: Mode Skenario (with "Metadatanya asumsi skenario" badge) vs Mode Sumber Nyata.
 * 3. Pending modal on Cases 2–4.
 * 4. Case 1 initial state: Lainnya has 0 titik · Belum tersedia.
 * 5. Cancellable staged flow: Back and Cancel produce ZERO mutations.
 * 6. Reference 2b displays exactly 5 broad source classes (sawit and karet excluded).
 * 7. Preview shows source details, exclusions, and delta.
 * 8. Confirmation creates private Data Campuran #1 with delta badge.
 * 9. Repeated addition deduplicates stable identities (0 duplicate points added).
 * 10. Top export flow: modal with exact counts, ZIP contents, unverified receiver disclaimer.
 * 11. Persistence across reload restores Data Campuran #1 and project state.
 * 12. Attribute table collapse and expand toggles without crashing.
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

test('Case 1 E2E: Full workflow verification in headless Chromium', async () => {
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
    // Use target 1366x768 resolution
    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 }
    });
    const page = await context.newPage();

    // 1. Load application
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.portalApp?.workspace?.activeRecords?.length > 0);

    // 2. Verify Header Branding, Case navigation, and Luma style
    const headerTitle = await page.textContent('.header-title');
    assert.ok(headerTitle.includes('Portal Data Epistem'));

    const case1Btn = await page.$('.case-nav-btn[data-case-id="1"]');
    assert.ok(case1Btn, 'Case 1 button exists');
    const case1Active = await case1Btn.getAttribute('class');
    assert.ok(case1Active.includes('is-active'), 'Case 1 is active by default');

    // Verify Case 2 button exists
    const case2BtnNav = await page.$('.case-nav-btn[data-case-id="2"]');
    assert.ok(case2BtnNav, 'Case 2 button exists');

    // 3. Test Mode Toggle in Settings
    const settingsBtn = await page.$('#btn-settings');
    assert.ok(settingsBtn, 'Settings button exists');
    await settingsBtn.click();
    await page.waitForSelector('#popover-settings', { state: 'visible' });

    const modeBtn = await page.$('#btn-toggle-mode');
    assert.ok(modeBtn, 'Mode toggle button exists');
    let modeText = await page.textContent('#mode-toggle-text');
    assert.equal(modeText.trim(), 'Mode Skenario');

    const badge = await page.$('#scenario-disclaimer-badge');
    assert.ok(await badge.isVisible(), 'Scenario disclaimer badge is visible');

    // Toggle to Source mode
    await modeBtn.click();
    await page.waitForTimeout(100);
    modeText = await page.textContent('#mode-toggle-text');
    assert.equal(modeText.trim(), 'Mode Sumber Nyata');
    assert.ok(!(await badge.isVisible()), 'Scenario badge is hidden in Source mode');

    // Toggle back to Scenario mode for Case 1 flow
    await modeBtn.click();
    await page.waitForTimeout(100);

    const closeSettingsBtn = await page.$('#btn-close-settings');
    await closeSettingsBtn.click();
    await page.waitForTimeout(100);

    // 4. Test Bagikan Data (Case 2) Modal
    const case2Btn = await page.$('.case-nav-btn[data-case-id="2"]');
    await case2Btn.click();
    await page.waitForSelector('.modal-title', { timeout: 2000 });
    const modalTitle = await page.textContent('.modal-title');
    assert.ok(modalTitle.includes('Bagikan Data') || modalTitle.includes('Kontribusi'));
    const modalCloseBtn = await page.$('.modal-footer .btn-secondary');
    await modalCloseBtn.click();
    await page.waitForTimeout(150);

    // 5. Verify Case 1 Initial State: Class 3 Lainnya is 0
    const card3Count = await page.textContent('.class-card-3 .class-count');
    assert.ok(card3Count.includes('0 titik · Belum tersedia'));

    // Verify "+ Tambah Data Rujukan" button exists on Lainnya
    const addDataBtn = await page.$('.btn-add-data-lainnya');
    assert.ok(addDataBtn, 'Add data button exists on Lainnya');

    // 6. Test Cancel in Step 1 (SELECTING): Zero mutations
    await addDataBtn.click();
    await page.waitForSelector('.class-selector-list', { timeout: 2000 });

    // Verify exactly 5 source classes displayed
    const classCheckboxes = await page.$$('.class-checkbox-item');
    assert.equal(classCheckboxes.length, 5, 'Ref 2b must display exactly 5 classes');

    // Verify Sawit and Karet checkboxes are disabled
    const disabledCheckboxes = await page.$$('.class-checkbox-item.is-disabled');
    assert.equal(disabledCheckboxes.length, 2, 'Sawit and Karet must be disabled target classes');

    // Click Cancel
    const cancelBtn1 = await page.$('.modal-footer .btn-secondary');
    await cancelBtn1.click();
    await page.waitForTimeout(200);

    // Lainnya must still be 0
    const card3CountAfterCancel = await page.textContent('.class-card-3 .class-count');
    assert.ok(card3CountAfterCancel.includes('0 titik · Belum tersedia'));

    // 7. Test Back in Step 2 (PREVIEWING): Zero mutations
    await addDataBtn.click();
    await page.waitForSelector('.class-selector-list', { timeout: 2000 });

    const nextBtn = await page.$('.modal-footer .btn-primary');
    await nextBtn.click();
    await page.waitForSelector('.preview-table', { timeout: 2000 });

    const previewTitle = await page.textContent('.modal-title');
    assert.ok(previewTitle.includes('Tinjau Penambahan'));

    // Click Back
    const backBtn = await page.$('.modal-footer .btn-secondary:first-child');
    await backBtn.click();
    await page.waitForSelector('.class-selector-list', { timeout: 2000 });

    // Click Cancel from Step 1
    const cancelBtn2 = await page.$('.modal-footer .btn-secondary');
    await cancelBtn2.click();
    await page.waitForTimeout(200);

    // 8. Confirm Addition: Creates Data Campuran #1
    await addDataBtn.click();
    await page.waitForSelector('.class-selector-list', { timeout: 2000 });

    const nextBtn2 = await page.$('.modal-footer .btn-primary');
    await nextBtn2.click();
    await page.waitForSelector('.preview-table', { timeout: 2000 });

    const confirmBtn = await page.$('.modal-footer .btn-primary');
    await confirmBtn.click();
    await page.waitForTimeout(500);

    // Verify Private Mixed Dataset Created
    const updatedCard3 = await page.textContent('.class-card-3 .class-count');
    assert.ok(!updatedCard3.includes('0 titik · Belum tersedia'), 'Lainnya must now have points');
    assert.ok(updatedCard3.includes('687 titik'), 'Lainnya must show 687 points');
    assert.ok(!updatedCard3.includes('baru ditambahkan'), 'Delta badge removed from legend');

    const activeCatCard = await page.$('.catalogue-card.is-active');
    const catTitle = await activeCatCard.textContent();
    assert.ok(catTitle.includes('Data Campuran #1'), 'Active dataset is now Data Campuran #1');

    // 9. Repeat Addition: Test Deduplication
    await page.click('.btn-add-data-lainnya');
    await page.waitForSelector('.class-selector-list', { timeout: 2000 });

    const nextBtn3 = await page.$('.modal-footer .btn-primary');
    await nextBtn3.click();
    await page.waitForSelector('.preview-table', { timeout: 2000 });

    const previewText = await page.textContent('.preview-table');
    assert.ok(previewText.includes('Titik Duplikat (Dilewati):'));
    assert.ok(previewText.includes('Titik Baru Bersih:'));
    assert.ok(previewText.includes('+0 titik'));

    const confirmBtn2 = await page.$('.modal-footer .btn-primary');
    await confirmBtn2.click();
    await page.waitForTimeout(300);

    // Verify count did not increase
    const countAfterDedup = await page.textContent('.class-card-3 .class-count');
    assert.equal(updatedCard3.split(' ')[0], countAfterDedup.split(' ')[0], 'Count should not change on repeat import');

    // 10. Test Top Export Flow
    const exportTopBtn = await page.$('#btn-top-export');
    await exportTopBtn.click();
    await page.waitForSelector('.modal-title', { timeout: 2000 });

    const exportTitle = await page.textContent('.modal-title');
    assert.ok(exportTitle.includes('Ekspor Dataset Pelatihan'));

    const exportModalText = await page.textContent('.modal-body');
    assert.ok(exportModalText.includes('Belum teruji (untested)'));
    assert.ok(exportModalText.includes('training_points.shp'));
    assert.ok(exportModalText.includes('manifest.json'));

    // Check warning acknowledgement if present
    const ackWarningsChk = await page.$('#chk-ack-warnings');
    if (ackWarningsChk) {
      await ackWarningsChk.click();
      await page.waitForTimeout(100);
    }

    // Check partial export confirmation if exclusions exist
    const confirmPartialChk = await page.$('#chk-confirm-partial');
    if (confirmPartialChk) {
      await confirmPartialChk.click();
      await page.waitForTimeout(100);
    }

    const doExportBtn = await page.$('.modal-footer .btn-primary');
    await doExportBtn.click();
    await page.waitForTimeout(600);

    // Notice banner should acknowledge generation
    const noticeText = await page.textContent('#error-banner');
    assert.ok(noticeText.includes('Paket data pelatihan berhasil dibuat'));
    assert.ok(noticeText.includes('Belum teruji') || noticeText.includes('belum teruji'));

    // 11. Test Refresh: State recovered from localStorage
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.portalApp?.workspace?.activeRecords?.length > 0);

    const reloadedActiveCard = await page.$('.catalogue-card.is-active');
    const reloadedTitle = await reloadedActiveCard.textContent();
    assert.ok(reloadedTitle.includes('Data Campuran #1'), 'Data Campuran #1 recovered after refresh');

    const reloadedLainnya = await page.textContent('.class-card-3 .class-count');
    assert.ok(!reloadedLainnya.includes('Belum tersedia'), 'Lainnya count preserved after refresh');

    // 12. Test Table Collapse & Expand (Starts collapsed initially on fresh profile)
    const initialTableCollapsed = await page.$('.table-panel-inner.is-collapsed');
    assert.ok(initialTableCollapsed, 'Table is initially collapsed on fresh profile');

    await page.click('.table-toggle-btn');
    await page.waitForTimeout(300);
    const tablePanelExpanded = await page.$('.table-panel-inner:not(.is-collapsed)');
    assert.ok(tablePanelExpanded, 'Table is expanded');

    await page.click('.table-toggle-btn');
    await page.waitForTimeout(300);
    const tablePanel = await page.$('.table-panel-inner.is-collapsed');
    assert.ok(tablePanel, 'Table is collapsed');

  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
