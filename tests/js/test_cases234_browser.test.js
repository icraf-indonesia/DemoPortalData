/**
 * tests/js/test_cases234_browser.test.js
 * End-to-end browser integration tests covering Cases 2, 3, and 4 journeys,
 * basemap resilience, and deterministic reset in headless Chromium.
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

test('Cases 2–4 E2E: Full multi-case user journeys in headless Chromium', async () => {
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

    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 }
    });
    const page = await context.newPage();
    page.on('pageerror', err => console.error('PAGE ERROR:', err));
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    await page.route(/(cartocdn|tile\.openstreetmap|tiles\.maps\.eox\.at)/, route => route.abort());

    // 1. Load application
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.portalApp?.workspace?.activeRecords?.length > 0);

    // 2. Case 2: Open contribution modal & donate owned plantation observations
    const case2Btn = await page.$('.case-nav-btn[data-case-id="2"]');
    assert.ok(case2Btn, 'Case 2 navigation tab exists');
    await case2Btn.click();
    await page.waitForSelector('.modal-title', { timeout: 3000 });

    const c2Title = await page.textContent('.modal-title');
    assert.ok(c2Title.includes('Bagikan Data') || c2Title.includes('Kontribusi'), 'Case 2 contribution modal opened');

    const modalBodyText = await page.textContent('.modal-body');
    assert.ok(modalBodyText.includes('Observasi Milik Mandiri (Dapat Dikontribusikan)'), 'Owned observations detected');

    // Step 1 -> Click "Lanjutkan"
    const nextStep1Btn = await page.$('.modal-footer .btn-primary');
    assert.ok(nextStep1Btn, 'Lanjutkan button exists on Step 1');
    await nextStep1Btn.click();
    await page.waitForTimeout(200);

    // Step 2 -> Verify Ekstraksi Primitives page and table
    const step2Title = await page.textContent('.modal-title');
    assert.ok(step2Title.includes('Ekstraksi Primitives'), 'Step 2 Ekstraksi Primitives opened');
    const tableRows = await page.$$('#primitives-table-body tr');
    assert.ok(tableRows.length > 0, 'Primitives table has rows');

    // Click "Konfirmasi nilai primitives"
    const confirmPrimBtn = await page.$('.modal-footer .btn-primary');
    assert.ok(confirmPrimBtn, 'Konfirmasi nilai primitives button exists on Step 2');
    await confirmPrimBtn.click();
    await page.waitForTimeout(200);

    // Step 3 -> Penyelarasan Taksonomi & Publikasi
    const karetPicker = await page.$('#cw-select-karet');
    const sawitPicker = await page.$('#cw-select-sawit');
    assert.ok(karetPicker, 'Visible Karet taxonomy picker rendered');
    assert.ok(sawitPicker, 'Visible Kelapa sawit taxonomy picker rendered');

    // Fill required declaration inputs (default blank / unchecked)
    await page.fill('#pub-account-name', 'User A');
    await page.fill('#pub-institution', 'ICRAF Indonesia');
    await page.fill('#pub-email', 'usera@example.org');
    await page.check('#pub-responsibility');

    // Click "Konfirmasi & Bagikan Data"
    const donateBtn = await page.$('.modal-footer .btn-primary');
    await donateBtn.click();
    await page.waitForFunction(() => {
      const el = document.getElementById('error-banner');
      return el && el.textContent && el.textContent.includes('data_kontribusi_mandiri');
    }, { timeout: 4000 });

    // Verify donation notice banner
    const c2Notice = await page.textContent('#error-banner');
    assert.ok(c2Notice.includes('Berhasil menyumbangkan') || c2Notice.includes('Berhasil membagikan'), 'Donation notice displayed');
    assert.ok(c2Notice.includes('data_kontribusi_mandiri'), 'Target collection ID mentioned');

    // 3. Case 2: On-screen map sampling tool
    const samplingBtn = await page.$('#btn-toggle-sampling');
    assert.ok(samplingBtn, 'Map sampling button exists');
    await samplingBtn.click();
    await page.waitForTimeout(200);

    const samplingActive = await samplingBtn.getAttribute('class');
    assert.ok(samplingActive.includes('is-active'), 'Sampling mode is activated');

    // Click on map to trigger sampling draft
    const mapEl = await page.$('#map');
    await page.evaluate(() => {
      window.portalApp.mapView.map.fire('click', { latlng: window.L.latLng(-2.88, 104.5) });
    });
    await page.waitForSelector('#sample-class-select', { timeout: 3000 });

    const samplingModalTitle = await page.textContent('.modal-title');
    assert.ok(samplingModalTitle.includes('Sampling Titik Baru'), 'Sampling form modal opened');

    // Submit complete sampling observation
    await page.selectOption('#sample-class-select', '1');
    await page.fill('#sample-year-input', '2026');
    await page.fill('#sample-imgref-input', 'EOX Sentinel-2 Cloudless 2025');
    await page.fill('#sample-reason-input', 'Pola tajuk tajam dan jarak tanam teratur perkebunan karet.');
    await page.fill('#sample-uncert-input', '±15m');

    const submitSampleBtn = await page.$('.modal-footer .btn-primary');
    await submitSampleBtn.click();
    await page.waitForTimeout(400);

    const sampleNotice = await page.textContent('#error-banner');
    assert.ok(sampleNotice.includes('Titik sampling baru berhasil disimpan'), 'Sampling point saved');
    assert.ok(sampleNotice.includes('Prioritas Telaah Tinggi'), 'High priority assigned');

    // 4. Case 3: Forestry workspace (Role B) and partner data reuse
    const case3Btn = await page.$('.case-nav-btn[data-case-id="3"]');
    assert.ok(case3Btn, 'Case 3 button exists');
    await case3Btn.click();
    await page.waitForSelector('.modal-title', { timeout: 3000 });

    const c3Title = await page.textContent('.modal-title');
    assert.ok(c3Title.includes('Data Mitra') || c3Title.includes('Penggunaan Ulang'), 'Case 3 modal opened');

    // Verify discovered partner datasets include data_sawah and Case 2 donation
    const partnerSelect = await page.$('.modal-body select');
    const partnerSelectHtml = await partnerSelect.innerHTML();
    assert.ok(partnerSelectHtml.includes('data_sawah'), 'Discovered partner paddy dataset');
    assert.ok(partnerSelectHtml.includes('data_kontribusi_mandiri'), 'Discovered Case 2 donated dataset');

    // Check preview table and attribution ledger
    await page.waitForSelector('.preview-table', { timeout: 2000 });
    const c3PreviewTable = await page.textContent('.preview-table');
    assert.ok(c3PreviewTable.includes('Tambahan Bersih Non-hutan:'), 'Non-hutan net addition shown');

    const c3Ledger = await page.textContent('.modal-body');
    assert.ok(c3Ledger.includes('Buku Besar Atribusi Sumber'), 'Attribution ledger displayed');

    // Confirm partner reuse
    const commitPartnerBtn = await page.$('.modal-footer .btn-primary');
    await commitPartnerBtn.click();
    await page.waitForTimeout(500);

    // Verify forestry workspace updated
    const c3Notice = await page.textContent('#error-banner');
    assert.ok(c3Notice.includes('Berhasil memproyeksikan'), 'Forestry projection confirmed');

    const c3PanelTitle = await page.textContent('.panel-title');
    assert.equal(c3PanelTitle.trim(), 'Skema Klasifikasi', 'Skema Klasifikasi panel title displayed');

    const nonHutanCount = await page.textContent('.class-card-2 .class-count');
    assert.ok(!nonHutanCount.includes('0 titik · Belum tersedia'), 'Non-hutan class now has points');
    assert.ok(!nonHutanCount.includes('data mitra'), 'Delta badge removed for partner data');

    // 5. Case 4: Independent blind review (Role C)
    const case4Btn = await page.$('.case-nav-btn[data-case-id="4"]');
    assert.ok(case4Btn, 'Case 4 button exists');
    await case4Btn.click();
    await page.waitForSelector('.modal-title', { timeout: 3000 });

    const c4Title = await page.textContent('.modal-title');
    assert.ok(c4Title.includes('Telaah Mutu') || c4Title.includes('Penelaahan Mutu'), 'Case 4 review modal opened');

    // Verify blind review card masks initial class and shows high priority screen point
    const firstReviewCard = await page.$('.blind-review-card:first-child');
    assert.ok(firstReviewCard, 'Blind review card exists');
    const cardText = await firstReviewCard.textContent();
    assert.ok(cardText.includes('Prioritas Tinggi (Sampling Layar)'), 'Case 2 screen sample prioritized at top');
    assert.ok(cardText.includes('Penelaahan Buta (Blind Review)'), 'Blind review banner displayed');

    // Submit review as Penelaah 1
    await page.selectOption('.blind-review-card:first-child .rev-class-sel', '3'); // Kebun karet
    await page.fill('.blind-review-card:first-child .rev-reason-inp', 'Tajuk seragam perkebunan karet teridentifikasi jelas.');
    await page.fill('.blind-review-card:first-child .rev-evidence-inp', 'Citra satelit Sentinel-2 resolusi tinggi 2025.');

    const sendReviewBtn1 = await page.$('.blind-review-card:first-child .send-rev-btn');
    assert.ok(sendReviewBtn1, 'Submit review button exists');
    await sendReviewBtn1.click();
    await page.waitForTimeout(300);

    const afterVote1Text = await page.textContent('.blind-review-card:first-child');
    assert.ok(afterVote1Text.includes('Ulasan Terkirim'), 'Review submission recorded for Penelaah 1');

    // Switch simulated reviewer to Penelaah 2 (Ir. Siti)
    const reviewerSelect = await page.$('#sim-reviewer-select');
    await reviewerSelect.selectOption('penelaah_2');
    await page.waitForTimeout(300);

    // Penelaah 2 submits agreeing review
    await page.selectOption('.blind-review-card:first-child .rev-class-sel', '3'); // Kebun karet
    await page.fill('.blind-review-card:first-child .rev-reason-inp', 'Konfirmasi struktur kanopi monokultur karet.');
    await page.fill('.blind-review-card:first-child .rev-evidence-inp', 'Verifikasi independen citra EOX Sentinel-2.');

    const sendReviewBtn2 = await page.$('.blind-review-card:first-child .send-rev-btn');
    assert.ok(sendReviewBtn2, 'Review form available for Penelaah 2');
    await sendReviewBtn2.click();
    await page.waitForTimeout(400);

    // Verify consensus reached (Tier 2 Agreed Candidate) and adoption button rendered
    const adoptCandidateBtn = await page.$('.btn-adopt-candidate');
    assert.ok(adoptCandidateBtn, 'Adoption button appeared upon 2 agreeing independent reviews');

    // Select explicit actor (mandatory) and fill adoption reason
    await page.selectOption('.adopt-actor-select', 'admin');
    await page.fill('.adopt-reason-input', 'Adopsi resmi konsensus dua penelaah independen.');
    await adoptCandidateBtn.click();
    await page.waitForTimeout(300);

    const adoptNotice = await page.textContent('#error-banner');
    assert.ok(adoptNotice.includes('berhasil diadopsi'), 'Adoption event successfully recorded');

    // Close review modal
    const closeRevModalBtn = await page.$('.modal-footer .btn-secondary');
    await closeRevModalBtn.click();
    await page.waitForTimeout(200);

    // 6. Basemap selection via floating layer menu
    const layerMenuBtn = await page.$('#btn-layer-menu');
    assert.ok(layerMenuBtn, 'Floating layer selector button exists');
    await layerMenuBtn.click();
    await page.waitForSelector('#popover-layer-menu', { state: 'visible' });

    const eoxCard = await page.$('#popover-layer-menu .basemap-card[data-provider="eox"]');
    assert.ok(eoxCard, 'EOX 2025 basemap card exists');
    await eoxCard.click();
    await page.waitForTimeout(300);
    assert.ok((await eoxCard.getAttribute('class')).includes('is-active'), 'EOX basemap is active');

    const osmCard = await page.$('#popover-layer-menu .basemap-card[data-provider="osm"]');
    await osmCard.click();
    await page.waitForTimeout(200);
    assert.ok((await osmCard.getAttribute('class')).includes('is-active'), 'OSM basemap is active');

    // Close layer menu
    await layerMenuBtn.click();
    await page.waitForTimeout(100);

    // 7. Deterministic Reset Demo via Settings
    const settingsBtn = await page.$('#btn-settings');
    assert.ok(settingsBtn, 'Settings button exists');
    await settingsBtn.click();
    await page.waitForSelector('#popover-settings', { state: 'visible' });

    const resetBtn = await page.$('#btn-reset-demo');
    assert.ok(resetBtn, 'Reset demo button exists');
    await resetBtn.click();
    await page.waitForSelector('.modal-title', { timeout: 2000 });

    const resetTitle = await page.textContent('.modal-title');
    assert.ok(resetTitle.includes('Konfirmasi Reset'), 'Reset confirmation dialog opened');

    const confirmResetBtn = await page.$('.modal-footer .btn-primary');
    await confirmResetBtn.click();
    await page.waitForTimeout(500);

    const resetNotice = await page.textContent('#error-banner');
    assert.ok(resetNotice.includes('berhasil direset ke kondisi awal'), 'Reset confirmed');

    // Verify workspace restored to clean Case 1 state
    const restoredTitle = await page.textContent('.panel-title');
    assert.equal(restoredTitle.trim(), 'Skema Klasifikasi', 'Panel title is Skema Klasifikasi');

    const restoredClass3Count = await page.textContent('.class-card-3 .class-count');
    assert.ok(restoredClass3Count.includes('0 titik · Belum tersedia'), 'Lainnya reset to 0 titik');

  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
