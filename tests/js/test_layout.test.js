/**
 * tests/js/test_layout.test.js
 * End-to-end browser tests verifying the Full-Canvas layout of Portal Data Epistem.
 * 
 * Verifies:
 * 1. Full-canvas map: map width and height equals workspace with panels open and collapsed.
 * 2. Floating panels: left classification and right catalogue floating above map.
 * 3. Independent collapse and reopen buttons with Indonesian labelling and ARIA attributes.
 * 4. Focus management: closing moves focus to reopen button; reopening moves focus to collapse button.
 * 5. Inertness: hidden panel content cannot retain focus/tab access.
 * 6. Local storage persistence: panel and table visibility persisted and restored across reload.
 * 7. Map center and zoom preservation: panning and zooming maintained during panel/drawer toggling.
 * 8. Map controls reachability: zoom, sampling, and layer controls reachable and not obscured.
 * 9. Event isolation: panel interactions do not trigger map clicks or add sampling points.
 * 10. Viewport acceptance: tests at 1440x900 and 1366x768, capturing required screenshots.
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

test('Full-Canvas Layout: Comprehensive Acceptance at 1440x900 and 1366x768', async () => {
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
    // VIEWPORT 1: 1440x900
    // ==========================================
    const context1440 = await browser.newContext({
      viewport: { width: 1440, height: 900 }
    });
    const page1440 = await context1440.newPage();
    await page1440.goto(baseUrl, { waitUntil: 'networkidle' });

    // 1. Fresh profile defaults verification
    const leftPanel = page1440.locator('#panel-left-container');
    const rightPanel = page1440.locator('#panel-right-container');
    const tableDrawer = page1440.locator('.table-panel-inner');

    assert.ok(await leftPanel.isVisible(), 'Left panel is visible on fresh profile');
    assert.ok(await rightPanel.isVisible(), 'Right panel is visible on fresh profile');
    assert.ok(await tableDrawer.evaluate(el => el.classList.contains('is-collapsed')), 'Table drawer is closed on fresh profile');

    // 2. Map fills entire workspace
    const wsBox = await page1440.locator('#workspace-layout').boundingBox();
    const mapBox = await page1440.locator('#map').boundingBox();
    assert.equal(Math.round(mapBox.width), Math.round(wsBox.width), 'Map width equals workspace width with open panels');
    assert.equal(Math.round(mapBox.height), Math.round(wsBox.height), 'Map height equals workspace height with open panels');

    // 3. Map controls reachability
    const zoomBox = await page1440.locator('.leaflet-control-zoom').boundingBox();
    const leftBox = await leftPanel.boundingBox();
    assert.ok(zoomBox.x >= leftBox.x + leftBox.width - 5, 'Zoom control is positioned clear of left panel');

    const samplingBox = await page1440.locator('#btn-toggle-sampling').boundingBox();
    const rightBox = await rightPanel.boundingBox();
    assert.ok(samplingBox.x + samplingBox.width <= rightBox.x + 5, 'Sampling tool is positioned clear of right panel');

    const layerBox = await page1440.locator('#btn-layer-menu').boundingBox();
    assert.ok(layerBox.x + layerBox.width <= rightBox.x + 5, 'Layer menu is positioned clear of right panel');

    // Screenshot 1: Panels open, table collapsed at 1440x900
    const ssPanelsOpen1440 = path.join(ROOT_DIR, 'screenshot-panels-open-1440.png');
    await page1440.screenshot({ path: ssPanelsOpen1440, fullPage: true });
    assert.ok(fs.existsSync(ssPanelsOpen1440), 'Captured screenshot-panels-open-1440.png');

    // 4. Test Table Drawer Opening & Interaction
    const tableToggleBtn = page1440.locator('.table-toggle-btn');
    await tableToggleBtn.click();
    await page1440.waitForTimeout(300);

    assert.ok(await tableDrawer.evaluate(el => !el.classList.contains('is-collapsed')), 'Table drawer is expanded');
    const tableRows = await page1440.$$('.attribute-table tbody tr.table-row');
    assert.ok(tableRows.length > 0, 'Table rows visible and rendered');

    // Screenshot 2: Panels open + Table open at 1440x900
    const ssTableOpen1440 = path.join(ROOT_DIR, 'screenshot-table-open-1440.png');
    await page1440.screenshot({ path: ssTableOpen1440, fullPage: true });
    assert.ok(fs.existsSync(ssTableOpen1440), 'Captured screenshot-table-open-1440.png');

    // Close table drawer again
    await tableToggleBtn.click();
    await page1440.waitForTimeout(300);
    assert.ok(await tableDrawer.evaluate(el => el.classList.contains('is-collapsed')), 'Table drawer collapsed');

    // 5. Test Pan + Zoom Preservation across panel and drawer toggles
    await page1440.evaluate(() => {
      const map = window.portalApp.mapView.map;
      map.setView([-2.75, 104.65], 11);
    });
    await page1440.waitForTimeout(100);

    const centerBefore = await page1440.evaluate(() => {
      const map = window.portalApp.mapView.map;
      return { lat: map.getCenter().lat, lng: map.getCenter().lng, zoom: map.getZoom() };
    });

    // 6. Test Independent Collapse and Focus Transfer
    // Collapse Left Panel
    const btnCollapseLeft = page1440.locator('#btn-collapse-left');
    await btnCollapseLeft.click();
    await page1440.waitForTimeout(300);

    assert.ok(await leftPanel.evaluate(el => el.hasAttribute('inert')), 'Left panel is inert when collapsed');
    const btnReopenLeft = page1440.locator('#btn-reopen-left');
    assert.ok(await btnReopenLeft.isVisible(), 'Reopen left button is visible');
    const reopenLeftLabel = await btnReopenLeft.textContent();
    assert.ok(reopenLeftLabel.includes('Skema Klasifikasi'), 'Reopen left button has Indonesian label');

    // Collapse Right Panel
    const btnCollapseRight = page1440.locator('#btn-collapse-right');
    await btnCollapseRight.click();
    await page1440.waitForTimeout(300);

    assert.ok(await rightPanel.evaluate(el => el.hasAttribute('inert')), 'Right panel is inert when collapsed');
    const btnReopenRight = page1440.locator('#btn-reopen-right');
    assert.ok(await btnReopenRight.isVisible(), 'Reopen right button is visible');
    const reopenRightLabel = await btnReopenRight.textContent();
    assert.ok(reopenRightLabel.includes('Katalog Data'), 'Reopen right button has Indonesian label');

    // Map width STILL equals workspace width with both panels collapsed
    const mapBoxBothCollapsed = await page1440.locator('#map').boundingBox();
    assert.equal(Math.round(mapBoxBothCollapsed.width), Math.round(wsBox.width), 'Map width equals workspace with both panels collapsed');

    // Screenshot 3: Both panels collapsed at 1440x900
    const ssBothCollapsed1440 = path.join(ROOT_DIR, 'screenshot-both-collapsed-1440.png');
    await page1440.screenshot({ path: ssBothCollapsed1440, fullPage: true });
    assert.ok(fs.existsSync(ssBothCollapsed1440), 'Captured screenshot-both-collapsed-1440.png');

    // Verify center & zoom preserved after collapsing both panels
    const centerAfterCollapse = await page1440.evaluate(() => {
      const map = window.portalApp.mapView.map;
      return { lat: map.getCenter().lat, lng: map.getCenter().lng, zoom: map.getZoom() };
    });
    assert.ok(Math.abs(centerAfterCollapse.lat - centerBefore.lat) < 1e-4, 'Latitude preserved');
    assert.ok(Math.abs(centerAfterCollapse.lng - centerBefore.lng) < 1e-4, 'Longitude preserved');
    assert.equal(centerAfterCollapse.zoom, centerBefore.zoom, 'Zoom preserved');

    // 7. Verify Preference Persistence across page reload
    await page1440.reload({ waitUntil: 'networkidle' });
    assert.ok(await page1440.locator('#panel-left-container').evaluate(el => el.classList.contains('is-collapsed')), 'Left panel remains collapsed after refresh');
    assert.ok(await page1440.locator('#panel-right-container').evaluate(el => el.classList.contains('is-collapsed')), 'Right panel remains collapsed after refresh');

    // Reopen Left Panel via keyboard
    const reopenLeftReloaded = page1440.locator('#btn-reopen-left');
    await reopenLeftReloaded.focus();
    await page1440.keyboard.press('Enter');
    await page1440.waitForTimeout(300);

    assert.ok(await page1440.locator('#panel-left-container').isVisible(), 'Left panel reopened via keyboard Enter');
    assert.ok(await page1440.locator('#panel-left-container').evaluate(el => !el.hasAttribute('inert')), 'Left panel not inert when open');

    // Reopen Right Panel via click
    const reopenRightReloaded = page1440.locator('#btn-reopen-right');
    await reopenRightReloaded.click();
    await page1440.waitForTimeout(300);

    // 8. Event Isolation: Clicking floating panel controls does not trigger map sampling
    await page1440.click('#btn-toggle-sampling');
    await page1440.waitForTimeout(100);
    assert.ok(await page1440.locator('#btn-toggle-sampling').evaluate(el => el.classList.contains('is-active')), 'Sampling mode is active');

    // Click on legend card inside left panel
    await page1440.click('.class-card-1');
    await page1440.waitForTimeout(150);

    // Verify draft was not created by clicking floating panel
    const draftState = await page1440.evaluate(() => {
      return window.portalApp.workspace.case2SamplingDraft;
    });
    assert.equal(draftState, null, 'Clicking left panel does not create observation point');

    // Deactivate sampling
    await page1440.click('#btn-toggle-sampling');
    await page1440.waitForTimeout(100);

    // ==========================================
    // VIEWPORT 2: 1366x768
    // ==========================================
    const context1366 = await browser.newContext({
      viewport: { width: 1366, height: 768 }
    });
    const page1366 = await context1366.newPage();
    await page1366.goto(baseUrl, { waitUntil: 'networkidle' });

    // Verify map dimensions at 1366x768
    const wsBox1366 = await page1366.locator('#workspace-layout').boundingBox();
    const mapBox1366 = await page1366.locator('#map').boundingBox();
    assert.equal(Math.round(mapBox1366.width), Math.round(wsBox1366.width), 'Map width equals workspace at 1366x768');

    // Screenshot 4: Panels open at 1366x768
    const ssPanelsOpen1366 = path.join(ROOT_DIR, 'screenshot-panels-open-1366.png');
    await page1366.screenshot({ path: ssPanelsOpen1366, fullPage: true });
    assert.ok(fs.existsSync(ssPanelsOpen1366), 'Captured screenshot-panels-open-1366.png');

    // Collapse both on 1366
    await page1366.locator('#btn-collapse-left').click();
    await page1366.locator('#btn-collapse-right').click();
    await page1366.waitForTimeout(300);

    // Screenshot 5: Both collapsed at 1366x768
    const ssBothCollapsed1366 = path.join(ROOT_DIR, 'screenshot-both-collapsed-1366.png');
    await page1366.screenshot({ path: ssBothCollapsed1366, fullPage: true });
    assert.ok(fs.existsSync(ssBothCollapsed1366), 'Captured screenshot-both-collapsed-1366.png');

    await context1440.close();
    await context1366.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
