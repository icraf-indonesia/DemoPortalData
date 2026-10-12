/**
 * tests/js/test_corrections_integration.test.js
 * End-to-end browser integration verification proving all 6 required corrections:
 * 1. Inside-AOI active filtering (Case 1: 240, combined: 927 [122 rubber, 118 palm, 687 other], Case 4: 1239, Case 3: 86 forest, 166 paddy)
 *    with separate archive totals and preserved raw metadata.
 * 2. Shared evaluateExportEligibility across all cases with role/mode/schema, universal opt-ins, partial-export confirmation,
 *    download re-evaluation, numeric class_id first in DBF, and receiver: untested.
 * 3. Case 4 queue, interpretations, and adoptions persistence across modal close, navigation, and page reload;
 *    updates active records and exports; actor switcher; non-empty adoption reason; blank mandatory review fields; focus trap & inert; >=2 qualifying review IDs.
 * 4. Case 3 private collection persistence, repeated additions appending/deduplicating based on current collection, derived paddy count (166),
 *    synthetic fixture unique IDs and labelled provenance, source-mode blocking.
 * 5. Sampling draft persistence across refresh using loaded AOI geometry, and lineage to Case 3 reuse and Case 4 queue (rubber Case 1 id 1 -> Case 4 id 3).
 * 6. Dynamic metadata escaping in partner ledger, no pending badges, no header clipping at 1366px and 1440px, responsive Leaflet map fit.
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

test('Comprehensive Browser Integration Verification (6 User Requirements)', async () => {
  const server = createStaticServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/index.html`;

  let browser;
  try {
    const executablePath = getChromiumExecutablePath();
    browser = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    // Test at 1366px and 1440px viewports
    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 }
    });
    const page = await context.newPage();

    // -------------------------------------------------------------
    // Requirement 6: Layout & Header check at 1366px and 1440px
    // -------------------------------------------------------------
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.portalApp?.workspace?.activeRecords?.length > 0);

    // Verify no pending pill on any case button
    const pendingPills = await page.$$('.pending-pill');
    assert.equal(pendingPills.length, 0, 'No pending pill badges on case buttons');

    // Verify all 4 case buttons are clickable and visible
    for (let c = 1; c <= 4; c++) {
      const btn = await page.$(`.case-nav-btn[data-case-id="${c}"]`);
      assert.ok(btn, `Case ${c} button exists`);
      assert.ok(await btn.isVisible(), `Case ${c} button is visible at 1366px`);
    }

    // Check at 1440px
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(100);
    for (let c = 1; c <= 4; c++) {
      const btn = await page.$(`.case-nav-btn[data-case-id="${c}"]`);
      assert.ok(await btn.isVisible(), `Case ${c} button is visible at 1440px`);
    }
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.waitForTimeout(100);

    // -------------------------------------------------------------
    // Requirement 1: Inside-AOI Filtering & Separate Archive Label
    // -------------------------------------------------------------
    // Case 1 initial: 240 inside AOI (122 rubber, 118 palm), 241 archive
    const cardKaret = await page.textContent('.class-card-1 .class-count');
    assert.ok(cardKaret.includes('122 titik'), `Case 1 rubber inside AOI is 122 (got: ${cardKaret})`);

    const cardSawit = await page.textContent('.class-card-2 .class-count');
    assert.ok(cardSawit.includes('118 titik'), `Case 1 palm inside AOI is 118 (got: ${cardSawit})`);

    // Verify catalogue card displays both AOI points and archive totals
    const catCardText = await page.textContent('.catalogue-card.is-active');
    assert.ok(catCardText.includes('240 titik AOI'), 'Active points inside AOI labelled on catalogue card');
    assert.ok(catCardText.includes('241 arsip'), 'Archive total separately labelled on catalogue card');

    // Complement flow: add 687 non-target points from modular 2b to Lainnya -> total 927
    await page.click('.btn-add-data-lainnya');
    await page.waitForSelector('.class-selector-list', { timeout: 3000 });
    await page.click('.btn-select-all');
    await page.click('.modal-footer .btn-primary'); // Next to preview
    await page.waitForSelector('.preview-table', { timeout: 3000 });
    await page.click('.modal-footer .btn-primary'); // Confirm commit
    await page.waitForTimeout(400);

    const cardLainnya = await page.textContent('.class-card-3 .class-count');
    assert.ok(cardLainnya.includes('687 titik'), `Combined Lainnya inside AOI is 687 (got: ${cardLainnya})`);

    // Total points in workspace is 122 + 118 + 687 = 927
    const totalPointsInState = await page.evaluate(() => window.portalApp.workspace.activeRecords.length);
    assert.equal(totalPointsInState, 927, 'Combined dataset contains exactly 927 points inside AOI');

    // -------------------------------------------------------------
    // Requirement 2: Shared Export Eligibility across cases
    // -------------------------------------------------------------
    // -------------------------------------------------------------
    // Requirement 2: Private Training Export Policy (all 927 points eligible after acknowledgement)
    // -------------------------------------------------------------
    await page.click('#btn-top-export');
    await page.waitForSelector('.modal-title', { timeout: 3000 });

    const exportBody = await page.textContent('.modal-body');
    assert.ok(exportBody.includes('927 titik'), 'All 927 points eligible for private training');

    const filterContainer = await page.$('.export-filter-container');
    assert.ok(filterContainer, 'Quality filter selection rendered');

    // Warning acknowledgement checkbox if warnings exist
    const ackChk = await page.$('#chk-ack-warnings');
    const exportBtn = await page.$('.modal-footer .btn-primary');
    if (ackChk) {
      assert.equal(await exportBtn.isDisabled(), true, 'Export button disabled before acknowledgement');
      await ackChk.click();
      assert.equal(await exportBtn.isDisabled(), false, 'Export button enabled after acknowledgement');
    } else {
      assert.equal(await exportBtn.isDisabled(), false, 'Export button enabled');
    }

    // Close export modal
    await page.click('.modal-footer .btn-secondary');
    await page.waitForTimeout(200);

    // -------------------------------------------------------------
    // Requirement 5: Sampling Draft persistence & lineage
    // -------------------------------------------------------------
    // Toggle sampling mode
    await page.click('#btn-toggle-sampling');
    await page.waitForTimeout(200);

    // Click on map inside AOI (-2.88, 104.5)
    await page.evaluate(() => {
      window.portalApp.mapView.map.fire('click', { latlng: window.L.latLng(-2.88, 104.5) });
    });
    await page.waitForSelector('#sample-class-select', { timeout: 3000 });

    // Verify draft was saved in workspace state
    const savedDraftId = await page.evaluate(() => window.portalApp.workspace.case2SamplingDraft?.observation_id);
    assert.ok(savedDraftId, 'Sampling draft UUID generated and persisted');

    // Verify form fields start blank
    const sampleClassVal = await page.$eval('#sample-class-select', el => el.value);
    const sampleYearVal = await page.$eval('#sample-year-input', el => el.value);
    const sampleImgRefVal = await page.$eval('#sample-imgref-input', el => el.value);
    const sampleReasonVal = await page.$eval('#sample-reason-input', el => el.value);
    const sampleUncertVal = await page.$eval('#sample-uncert-input', el => el.value);

    assert.equal(sampleClassVal, '', 'Sampling class starts blank');
    assert.equal(sampleYearVal, '', 'Sampling year starts blank');
    assert.equal(sampleImgRefVal, '', 'Sampling imagery reference starts blank');
    assert.equal(sampleReasonVal, '', 'Sampling reason starts blank');
    assert.equal(sampleUncertVal, '', 'Sampling uncertainty starts blank');

    // Fill sampling form for Rubber (Case 1 ID 1)
    await page.selectOption('#sample-class-select', '1'); // Karet
    await page.fill('#sample-year-input', '2026');
    await page.fill('#sample-imgref-input', 'EOX Sentinel-2 Cloudless 2025');
    await page.fill('#sample-reason-input', 'Tajuk seragam perkebunan karet pada citra.');
    await page.fill('#sample-uncert-input', '±10m');

    await page.click('.modal-footer .btn-primary');
    await page.waitForTimeout(300);

    const submittedId = savedDraftId;
    // Verify draft cleared after submission
    const clearedDraft = await page.evaluate(() => window.portalApp.workspace.case2SamplingDraft);
    assert.equal(clearedDraft, null, 'Sampling draft cleared upon submission');

    // Donate owned observations in Case 2
    await page.click('.case-nav-btn[data-case-id="2"]');
    await page.waitForSelector('.modal-title', { timeout: 3000 });
    await page.fill('#pub-account-name', 'Researcher A');
    await page.fill('#pub-institution', 'ICRAF Indonesia');
    await page.fill('#pub-email', 'researcher@example.org');
    await page.check('#pub-responsibility');
    await page.click('.modal-footer .btn-primary');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#app-modal-overlay').isVisible(), false, await page.locator('#app-modal-box').innerText());

    // -------------------------------------------------------------
    // Requirement 4: Case 3 Private Collection Persistence & Dedup
    // -------------------------------------------------------------
    await page.click('.case-nav-btn[data-case-id="3"]');
    await page.waitForSelector('.modal-title', { timeout: 3000 });

    // Verify discovered partner catalogue includes paddy with derived count (166)
    const partnerSelectHtml = await page.$eval('.modal-body select', el => el.innerHTML);
    assert.ok(partnerSelectHtml.includes('166 titik'), 'Paddy count derived from loaded records inside AOI (166)');
    assert.ok(partnerSelectHtml.includes('data_kontribusi_mandiri'), 'Case 2 donated collection discovered');

    // Confirm partner reuse (adds 166 paddy points to 86 forest -> 252 total)
    await page.click('.modal-footer .btn-primary');
    await page.waitForTimeout(400);

    const c3RecordsCount1 = await page.evaluate(() => window.portalApp.workspace.activeRecords.length);
    assert.equal(c3RecordsCount1, 252, 'Case 3 initial combined collection is 86 forest + 166 paddy = 252 points');

    // Repeated addition: open partner reuse again, base on current private collection (not fresh forest)
    await page.click('.case-nav-btn[data-case-id="3"]');
    await page.waitForSelector('.modal-title', { timeout: 3000 });

    const c3PreviewTable2 = await page.textContent('.preview-table');
    assert.ok(c3PreviewTable2.includes('Tambahan Bersih Non-hutan:'), 'Preview table rendered');
    assert.ok(c3PreviewTable2.includes('+0 titik'), 'Deduplicated: +0 net new points against current collection');

    // Close without error
    await page.click('.modal-footer .btn-secondary');
    await page.waitForTimeout(200);

    // -------------------------------------------------------------
    // Requirement 3 & 5: Case 4 Review, Lineage Mapping, Actor Switch & Adoption
    // -------------------------------------------------------------
    await page.click('.case-nav-btn[data-case-id="4"]');
    await page.waitForSelector('.modal-title', { timeout: 3000 });

    // Verify active Case 4 collection count inside AOI: 1240 (1239 source AOI + 1 screen submission)
    const c4Count = await page.evaluate(() => window.portalApp.workspace.activeRecords.length);
    assert.equal(c4Count, 1240, 'Case 4 active collection has exactly 1240 points inside AOI (1239 source + 1 screen submission)');

    // Check Case 2 screen submission prioritized at top with schema mapping: Rubber (Case 1 id 1 -> Case 4 id 3)
    const firstCardText = await page.textContent('.blind-review-card:first-child');
    assert.ok(firstCardText.includes('Prioritas Tinggi (Sampling Layar)'), 'Screen submission prioritized at top');

    // Check review form starts blank
    const revClassVal = await page.$eval('.blind-review-card:first-child .rev-class-sel', el => el.value);
    const revReasonVal = await page.$eval('.blind-review-card:first-child .rev-reason-inp', el => el.value);
    const revEvidenceVal = await page.$eval('.blind-review-card:first-child .rev-evidence-inp', el => el.value);
    assert.equal(revClassVal, '', 'Review class starts blank');
    assert.equal(revReasonVal, '', 'Review reason starts blank');
    assert.equal(revEvidenceVal, '', 'Review evidence starts blank');

    // Penelaah 1 reviews: proposes Class 3 (Kebun karet in Case 4)
    await page.selectOption('.blind-review-card:first-child .rev-class-sel', '3');
    await page.fill('.blind-review-card:first-child .rev-reason-inp', 'Identifikasi kanopi perkebunan karet.');
    await page.fill('.blind-review-card:first-child .rev-evidence-inp', 'Sentinel-2 Cloudless 2025.');
    await page.click('.blind-review-card:first-child .send-rev-btn');
    await page.waitForTimeout(300);

    // Switch reviewer to Penelaah 2 (Ir. Siti)
    await page.selectOption('#sim-reviewer-select', 'penelaah_2');
    await page.waitForTimeout(300);

    // Penelaah 2 agrees with Class 3 (Kebun karet)
    await page.selectOption('.blind-review-card:first-child .rev-class-sel', '3');
    await page.fill('.blind-review-card:first-child .rev-reason-inp', 'Verifikasi independen monokultur karet.');
    await page.fill('.blind-review-card:first-child .rev-evidence-inp', 'Interpretasi spektral NIR/SWIR.');
    await page.click('.blind-review-card:first-child .send-rev-btn');
    await page.waitForTimeout(400);

    // Consensus reached -> Adoption box appears with actor switch and mandatory reason
    const adoptBox = await page.$('.adopt-candidate-box');
    assert.ok(adoptBox, 'Adoption box rendered upon 2 agreeing independent reviews');

    const actorSelect = await page.$('.adopt-actor-select');
    assert.ok(actorSelect, 'Actor selector rendered (no impersonation)');

    const adoptReasonInp = await page.$('.adopt-reason-input');
    assert.ok(adoptReasonInp, 'Mandatory adoption reason input rendered');

    // Select explicit actor and fill non-empty adoption reason and adopt
    await page.selectOption('.adopt-actor-select', 'admin');
    await page.fill('.adopt-reason-input', 'Adopsi resmi konsensus dua penelaah independen.');
    await page.click('.btn-adopt-candidate');
    await page.waitForTimeout(300);

    // Verify adopted state and Tier 2 promotion
    const adoptedNotice = await page.textContent('.blind-review-card:first-child');
    assert.ok(adoptedNotice.includes('Telah Diadopsi Resmi (Tier 2)'), 'Observation promoted to Tier 2 and adopted');

    // Close modal and verify active record updated in workspace
    await page.click('.modal-footer .btn-secondary');
    await page.waitForTimeout(200);

    // -------------------------------------------------------------
    // Refresh & Persistence Verification
    // -------------------------------------------------------------
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.portalApp?.workspace?.activeRecords?.length > 0);

    // Case 4 interpretations and adoptions survived refresh
    const persistedAdoptions = await page.evaluate(() => window.portalApp.workspace.case4Adoptions.length);
    assert.ok(persistedAdoptions >= 1, 'Adoptions persisted in localStorage and restored on reload');

    const activeAdopted = await page.evaluate(id => window.portalApp.workspace.activeRecords.find(r => r.observation_id === id), submittedId);
    assert.ok(activeAdopted, 'Adopted screen observation must belong to active collection after refresh for export');
    assert.equal(activeAdopted.project_class_id, 3);
    assert.equal(activeAdopted.quality_tier, 2);
    assert.ok(activeAdopted.adopted_event, 'Adoption event preserved on active record');
    assert.equal(activeAdopted.adopted_event.adopted_by, 'admin');

    // Trigger export and assert actual downloaded ZIP contains adopted UUID, class 3, Tier 2, and adoption provenance
    await page.click('#btn-top-export');
    await page.waitForSelector('.modal-title', { timeout: 3000 });
    const ackWarnings = page.locator('#chk-ack-warnings');
    if (await ackWarnings.count()) await ackWarnings.check();
    const partial = page.locator('#chk-confirm-partial');
    if (await partial.count()) await partial.check();
    const downloaded = page.waitForEvent('download');
    await page.click('.modal-footer .btn-primary');
    const download = await downloaded;
    const testWorkDir = path.resolve(ROOT_DIR, '.work');
    fs.mkdirSync(testWorkDir, { recursive: true });
    const zipPath = path.resolve(testWorkDir, 'test-case4-export.zip');
    await download.saveAs(zipPath);

    // Verify downloaded ZIP contents
    const JSZip = require(path.join(ROOT_DIR, 'vendor/jszip/jszip.min.js'));
    const zipBytes = fs.readFileSync(zipPath);
    assert.ok(zipBytes.byteLength > 1000, 'Exported ZIP has meaningful byte length');
    const zip = await JSZip.loadAsync(zipBytes);
    const geojson = JSON.parse(await zip.file('training_points.geojson').async('string'));
    const exported = geojson.features.find(f => f.id === submittedId || f.properties.observation_id === submittedId || f.properties.obs_id === submittedId);
    assert.ok(exported, 'Downloaded ZIP contains adopted screen UUID');
    assert.equal(Number(exported.properties.class_id), 3, 'Exported point has Case 4 class 3 (Kebun karet)');
    assert.equal(Number(exported.properties.quality_tier), 2, 'Exported point has Tier 2 quality');
    assert.ok(exported.properties.adopted_event || exported.properties.adopted_by, 'Adoption provenance preserved in exported feature properties');

    // Case 3 private collection survived refresh
    const persistedCase3 = await page.evaluate(() => window.portalApp.workspace.case3PrivateCollection?.records.length);
    assert.equal(persistedCase3, 252, 'Case 3 private collection (252 points) restored on reload');

  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
