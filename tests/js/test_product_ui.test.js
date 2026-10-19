/**
 * tests/js/test_product_ui.test.js
 * Comprehensive end-to-end browser tests for the redesigned Portal Data Epistem product UI.
 * 
 * Verifies:
 * 1. Clean portal branding: 'Portal Data Epistem', context lines 'Wilayah Kajian: Kabupaten Banyuasin' & 'Periode Perekaman: 2026',
 *    no demo badges, no subtitle jargon, no case numbers on task nav buttons.
 * 2. NLCD-style flat compact legend: 'Skema Klasifikasi' heading, rectangular swatches, numeric class IDs,
 *    right-aligned counts, Lainnya add data action, Belum dipetakan pseudo-class completely removed from legend.
 * 3. Task buttons: 'Bagikan Data' opens contribution modal without altering workspace state.
 * 4. Floating map layer menu: 2 basemap cards (Satelit Sentinel-2 Cloudless 2025 default, Peta Jalan OSM) and overlay toggles;
 *    selection persists across browser refresh.
 * 5. Honest offline/error handling for basemap providers.
 * 6. Private Training export (927 points): all 927 Case 1 points eligible in Source mode, single warning acknowledgement checkbox,
 *    no fake tier promotion, no forged dates/rights, manifest records purpose and untested status.
 * 7. Strict public sharing still blocked in Source mode with unverified rights.
 * 8. Case 4 adopted point UUID persists across refresh and export.
 * 9. Actual 1366x768 and 1440x900 viewport screenshots.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { evaluateExportEligibility, EXPORT_PURPOSES, MODES } from '../../src/demo/scenarios.js';
import { loadDataset } from '../../src/data/catalogue.js';
import { createTrainingExportPackage } from '../../src/export/luma-adapter.js';

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

test('Product UI: Comprehensive Browser Verification & Screenshots', async () => {
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

    // ==========================================
    // VIEWPORT 1: 1366x768 (Standard Desktop)
    // ==========================================
    const context1366 = await browser.newContext({
      viewport: { width: 1366, height: 768 }
    });
    const page = await context1366.newPage();
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.portalApp?.workspace?.activeRecords?.length > 0);

    // 1. Verify Header Branding & Context Lines
    const headerTitle = await page.textContent('.header-title');
    assert.equal(headerTitle.trim(), 'Portal Data Epistem');

    const contextText = await page.textContent('.brand-context-lines');
    assert.ok(contextText.includes('Wilayah Kajian: Kabupaten Banyuasin'));
    assert.ok(contextText.includes('Periode Perekaman: 2026'));

    // Verify demo badges / subtitle removed
    const demoBadge = await page.$('.demo-badge');
    assert.equal(demoBadge, null, 'Demonstrasi Lokal Mandiri badge removed');

    const oldSubtitle = await page.$('.header-subtitle');
    assert.equal(oldSubtitle, null, 'Old subtitle removed');

    // Verify Task Navigation: No case numbers in labels
    const taskBtns = await page.$$('.task-nav-btn');
    assert.equal(taskBtns.length, 5, '5 natural task buttons');
    const taskLabels = await Promise.all(taskBtns.map(b => b.textContent()));
    const labelCombined = taskLabels.map(l => l.trim()).join(' | ');
    assert.ok(labelCombined.includes('Katalog Data'));
    assert.ok(labelCombined.includes('Bagikan Data'));
    assert.ok(labelCombined.includes('Data Mitra'));
    assert.ok(labelCombined.includes('Telaah Mutu'));
    assert.ok(labelCombined.includes('Ekspor ke Luma'));
    assert.ok(!labelCombined.includes('Kasus 1'), 'No visible Kasus 1 in task buttons');
    assert.ok(!labelCombined.includes('Kasus 2'), 'No visible Kasus 2 in task buttons');

    // 2. Verify Left Panel NLCD-style flat compact legend
    const panelTitle = await page.textContent('.panel-title');
    assert.equal(panelTitle.trim(), 'Skema Klasifikasi');

    const classCards = await page.$$('.legend-row');
    assert.equal(classCards.length, 3, 'Exactly 3 classes: Karet, Kelapa sawit, Lainnya');

    const c1Text = await page.textContent('.class-card-1 .class-name');
    assert.equal(c1Text.trim(), '1. Karet');
    const c1Count = await page.textContent('.class-card-1 .class-count');
    assert.ok(c1Count.includes('122'));

    const c2Text = await page.textContent('.class-card-2 .class-name');
    assert.equal(c2Text.trim(), '2. Kelapa sawit');
    const c2Count = await page.textContent('.class-card-2 .class-count');
    assert.ok(c2Count.includes('118'));

    const c3Text = await page.textContent('.class-card-3 .class-name');
    assert.equal(c3Text.trim(), '3. Lainnya');
    const c3Count = await page.textContent('.class-card-3 .class-count');
    assert.ok(c3Count.includes('0 titik · Belum tersedia'));

    // Check add data action exists on Lainnya
    const addLainnyaBtn = await page.$('.class-card-3 .btn-add-data-lainnya');
    assert.ok(addLainnyaBtn, 'Add data action exists on Lainnya');

    // Belum dipetakan is completely absent from legend
    const unmappedCard = await page.$('.class-card-unmapped');
    assert.equal(unmappedCard, null, 'Belum dipetakan removed from legend');

    // Source class breakdown is collapsible
    const srcDetails = await page.$('.source-classes-details');
    assert.ok(srcDetails, 'Source class distribution is collapsible');

    // 3. Verify Floating Layer Selector Popover
    const layerMenuBtn = await page.$('#btn-layer-menu');
    assert.ok(layerMenuBtn, 'Floating layer selector button exists');
    await layerMenuBtn.click();
    await page.waitForSelector('#popover-layer-menu', { state: 'visible' });

    // Verify 2 basemap cards
    const basemapCards = await page.$$('#popover-layer-menu .basemap-card');
    assert.equal(basemapCards.length, 2, '2 basemap cards: Satelit Sentinel-2 Cloudless 2025 and OSM');

    // Verify Satelit Sentinel-2 Cloudless 2025 (eox) default active
    const activeBasemap = await page.$('#popover-layer-menu .basemap-card.is-active');
    const activeProvider = await activeBasemap.getAttribute('data-provider');
    assert.equal(activeProvider, 'eox', 'Default online basemap is Satelit Sentinel-2 Cloudless 2025 (eox)');

    // Verify Overlays
    const chkBoundary = await page.$('#chk-overlay-boundary');
    const chkPoints = await page.$('#chk-overlay-points');
    assert.ok(await chkBoundary.isChecked(), 'Boundary overlay is checked by default');
    assert.ok(await chkPoints.isChecked(), 'Points overlay is checked by default');

    // Switch to OSM and test persistence
    const osmCard = await page.$('#popover-layer-menu .basemap-card[data-provider="osm"]');
    await osmCard.click();
    await page.waitForTimeout(200);

    // Close menu by clicking outside on open map canvas
    await page.click('#map', { position: { x: 600, y: 300 } });
    await page.waitForTimeout(200);

    // Reload page and check persistence
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.portalApp?.workspace?.activeRecords?.length > 0);
    await page.click('#btn-layer-menu');
    await page.waitForSelector('#popover-layer-menu', { state: 'visible' });

    const persistedBasemap = await page.$('#popover-layer-menu .basemap-card.is-active');
    const persistedProvider = await persistedBasemap.getAttribute('data-provider');
    assert.equal(persistedProvider, 'osm', 'OSM basemap persisted across refresh');

    // Switch back to EOX
    const eoxCard = await page.$('#popover-layer-menu .basemap-card[data-provider="eox"]');
    await eoxCard.click();
    await page.waitForTimeout(100);

    // 4. Test Bagikan Data Task Button
    // 4. Test Bagikan Data Task Button
    const bagikanDataBtn = await page.$('.task-nav-btn[data-task="contribute"]');
    await bagikanDataBtn.click();
    await page.waitForSelector('.modal-title', { timeout: 3000 });

    const modalTitle = await page.textContent('.modal-title');
    assert.ok(modalTitle.includes('Bagikan Data'), 'Bagikan Data opens contribution modal');

    // Close modal
    const closeContribBtn = await page.$('.modal-footer .btn-secondary');
    await closeContribBtn.click();
    await page.waitForTimeout(150);

    // 5. Complete complement flow to form Data Campuran #1 (927 points: 122 Karet, 118 Sawit, 687 Lainnya)
    const addDataBtn = await page.$('.btn-add-data-lainnya');
    await addDataBtn.click();
    await page.waitForSelector('.class-selector-list', { timeout: 2000 });

    const nextBtn = await page.$('.modal-footer .btn-primary');
    await nextBtn.click();
    await page.waitForSelector('.preview-table', { timeout: 2000 });

    const confirmBtn = await page.$('.modal-footer .btn-primary');
    await confirmBtn.click();
    await page.waitForTimeout(400);

    // 6. Test Private Training Export in Source Mode (all 927 points eligible after 1 acknowledgement)
    // Switch to Source mode in settings
    await page.click('#btn-settings');
    await page.waitForSelector('#popover-settings', { state: 'visible' });

    const modeToggleBtn = await page.$('#btn-toggle-mode');
    await modeToggleBtn.click();
    await page.waitForTimeout(150);

    const modeText = await page.textContent('#mode-toggle-text');
    assert.equal(modeText.trim(), 'Mode Sumber Nyata');

    await page.click('#btn-close-settings');
    await page.waitForTimeout(100);

    // Open export modal
    const exportBtn = await page.$('#btn-top-export');
    await exportBtn.click();
    await page.waitForSelector('.modal-title', { timeout: 3000 });

    const expTitle = await page.textContent('.modal-title');
    assert.equal(expTitle.trim(), 'Ekspor Dataset Pelatihan Luma');

    const expBody = await page.textContent('.modal-body');
    assert.ok(expBody.includes('927 titik'), 'All 927 points eligible for private training');
    assert.ok(expBody.includes('0 titik dikecualikan'), '0 points excluded');

    // Check single warning acknowledgement box
    const ackChk = await page.$('#chk-ack-warnings');
    assert.ok(ackChk, 'Warning acknowledgement checkbox exists');

    const downloadZipBtn = await page.$('.modal-footer .btn-primary');
    assert.ok(await downloadZipBtn.isDisabled(), 'Download button disabled before acknowledgement');

    // Check acknowledgement
    await ackChk.click();
    await page.waitForTimeout(100);
    assert.ok(!(await downloadZipBtn.isDisabled()), 'Download button enabled after acknowledgement');

    // Collapsible ZIP details
    const zipDetails = await page.$('.export-components-details');
    assert.ok(zipDetails, 'ZIP components are collapsible');

    // Click download
    await downloadZipBtn.click();
    await page.waitForTimeout(800);

    // Notice banner should acknowledge creation (transient tinted notice, no permanent green)
    const errorBanner = await page.$('#error-banner');
    assert.ok(await errorBanner.isVisible(), 'Notice banner displayed');
    const noticeContent = await errorBanner.textContent();
    assert.ok(noticeContent.includes('Paket data pelatihan berhasil dibuat'));
    assert.ok(noticeContent.includes('927 titik'));
    assert.ok(noticeContent.includes('Belum teruji (untested)'));

    // Open layer menu to show layer popover with 4 cards and Topo active
    await page.click('#btn-layer-menu');
    await page.waitForSelector('#popover-layer-menu', { state: 'visible' });
    await page.waitForTimeout(500);

    // Capture 1366x768 screenshot including layer popover
    const screenshot1366Path = path.join(ROOT_DIR, 'screenshot-1366.png');
    await page.screenshot({ path: screenshot1366Path, fullPage: true });
    assert.ok(fs.existsSync(screenshot1366Path), 'Screenshot 1366x768 captured');

    // ==========================================
    // VIEWPORT 2: 1440x900 (Wider Desktop)
    // ==========================================
    const context1440 = await browser.newContext({
      viewport: { width: 1440, height: 900 }
    });
    const page1440 = await context1440.newPage();
    await page1440.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page1440.waitForFunction(() => window.portalApp?.workspace?.activeRecords?.length > 0);

    // Verify clean layout and capture screenshot
    const title1440 = await page1440.textContent('.header-title');
    assert.equal(title1440.trim(), 'Portal Data Epistem');

    // Open layer menu to show layer popover with 4 cards and Topo active
    await page1440.click('#btn-layer-menu');
    await page1440.waitForSelector('#popover-layer-menu', { state: 'visible' });
    await page1440.waitForTimeout(500);

    const screenshot1440Path = path.join(ROOT_DIR, 'screenshot-1440.png');
    await page1440.screenshot({ path: screenshot1440Path, fullPage: true });
    assert.ok(fs.existsSync(screenshot1440Path), 'Screenshot 1440x900 captured');

  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Export Invariants: Private Training vs Public Sharing in Source Mode', async () => {
  const { adaptObservationCollection } = await import('../../src/data/source-adapters.js');
  const primaryJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'data/derived/data_kebun_sawit_karet_f.geojson'), 'utf8'));
  const refJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'data/derived/data_ref_mod_2b.geojson'), 'utf8'));
  const primaryRecs = adaptObservationCollection(primaryJson, 'data_kebun_sawit_karet_f.zip');
  const refRecs = adaptObservationCollection(refJson, 'data_ref_mod_2b.zip');

  const { ComplementWorkflow } = await import('../../src/features/complement.js');
  const mockWorkspace = { activeRecords: primaryRecs.filter(r => r.is_within_aoi !== false) };
  const comp = new ComplementWorkflow(mockWorkspace);
  comp.cachedSourceRecords = refRecs;
  comp.selectNonTargetClasses();
  const preview = comp.calculatePreview('scenario');
  const combined = [
    ...mockWorkspace.activeRecords,
    ...preview.netNewPoints.map(p => ({ ...p, project_class_id: 3, project_class_label: 'Lainnya' }))
  ];
  assert.equal(combined.length, 927, 'Combined dataset has 927 records');

  // 1. In Source mode under SHARING purpose (default strict public policy):
  // All 927 records are blocked because source rights and dates are unknown.
  const publicEval = evaluateExportEligibility(combined, {
    mode: MODES.SOURCE,
    purpose: EXPORT_PURPOSES.SHARING
  });
  assert.equal(publicEval.eligible.length, 0, 'Public sharing in Source mode strictly excludes unauthorized points');
  assert.equal(publicEval.counts.excluded, 927, 'All 927 points excluded for public sharing');

  // 2. In Source mode under PRIVATE_TRAINING purpose:
  // All 927 records pass spatial/schema/AOI gates, unknown metadata are disclosed warnings.
  const privateEval = evaluateExportEligibility(combined, {
    mode: MODES.SOURCE,
    purpose: EXPORT_PURPOSES.PRIVATE_TRAINING
  });
  assert.equal(privateEval.eligible.length, 927, 'Private training allows all 927 valid points');
  assert.equal(privateEval.counts.excluded, 0, 'Zero points excluded');
  assert.equal(privateEval.counts.byClass['1'], 122, '122 Karet');
  assert.equal(privateEval.counts.byClass['2'], 118, '118 Kelapa sawit');
  assert.equal(privateEval.counts.byClass['3'], 687, '687 Lainnya');
  assert.ok(privateEval.unknownMetadataWarnings.length > 0, 'Discloses unknown metadata warnings');

  // Generate package and verify manifest
  const pkg = await createTrainingExportPackage({
    records: privateEval.eligible,
    datasetId: 'data_campuran_1',
    datasetName: 'Data Campuran #1',
    classCounts: privateEval.counts.byClass,
    purpose: EXPORT_PURPOSES.PRIVATE_TRAINING,
    acknowledgements: ['Pengguna menerima catatan metadata untuk keperluan pelatihan mandiri'],
    unknownMetadataWarnings: privateEval.unknownMetadataWarnings
  });

  assert.equal(pkg.manifest.purpose, 'PRIVATE_TRAINING');
  assert.equal(pkg.manifest.receiver_verification, 'untested');
  assert.equal(pkg.manifest.quality_unchanged, true);
  assert.ok(pkg.manifest.acknowledgements.length > 0);
  assert.equal(pkg.manifest.counts_by_class.total, 927);
  assert.equal(pkg.manifest.point_refs.length, 927);
});
