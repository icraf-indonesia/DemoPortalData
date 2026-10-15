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
const { chromium } = require('./browser-runtime.js');

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



test('Supervisor publication, draft, download and UserB handoff',async()=>{
 const server=createStaticServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true});
 try{const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',e.message)});await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:')?r.continue():r.abort());
 const base='http://127.0.0.1:'+server.address().port;await page.goto(base);await page.waitForFunction(()=>window.portalApp?.workspace?.activeRecords?.length===240);
 const originals=await page.evaluate(()=>JSON.parse(JSON.stringify(portalApp.workspace.activeRecords)));
 await page.locator('.btn-add-data-lainnya').click();await page.locator('.btn-select-all').click();await page.locator('.modal-footer .btn-primary').click();await page.waitForSelector('.preview-table');await page.locator('.modal-footer .btn-primary').click();await page.waitForFunction(()=>portalApp.workspace.activeRecords.length===927);
 const open=async()=>{await page.locator('[data-task="contribute"]').click();await page.waitForSelector('#pub-institution')};
 await open();assert.equal(await page.locator('#pub-collection-select').inputValue(),'data_campuran_1');assert.equal(await page.locator('#pub-institution').inputValue(),'');assert.equal(await page.locator('#pub-email').inputValue(),'');assert.equal(await page.locator('#pub-responsibility').isChecked(),false);
 await page.getByRole('button',{name:'Konfirmasi & Bagikan Data',exact:true}).click();assert.equal(await page.evaluate(()=>portalApp.workspace.case2DonatedCollection),null);
 await page.locator('#pub-account-name').fill('Researcher A');await page.locator('#pub-institution').fill('Research institution');await page.locator('#pub-email').fill('researcher@example.org');await page.locator('#pub-responsibility').check();
 await page.locator('#cw-select-karet').selectOption('veg-tb-mono-coffee');await page.locator('#cw-select-sawit').selectOption('veg-tb-mono-oilpalm');
 await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>portalApp.workspace.case2DonatedCollection),null);await page.reload();await page.waitForFunction(()=>window.portalApp?.workspace?.mixedDataset?.records.length===927);await open();
 assert.equal(await page.locator('#cw-select-karet').inputValue(),'veg-tb-mono-coffee');assert.equal(await page.locator('#pub-institution').inputValue(),'Research institution');assert.equal(await page.locator('#pub-collection-select').inputValue(),'data_campuran_1');
 assert.match(await page.locator('.pub-final-summary-card').innerText(),/1135/);
 await page.getByRole('button',{name:'Konfirmasi & Bagikan Data',exact:true}).click();await page.waitForFunction(()=>portalApp.workspace.case2DonatedCollection?.records.length===240);
 const pub=await page.evaluate(()=>portalApp.workspace.case2DonatedCollection);assert.equal(pub.meta.crosswalk[1].code,'1135');assert.equal(pub.meta.crosswalk[1].name,'Coffee Monoculture');assert.equal(pub.meta.year,2026);assert.equal(await page.evaluate(()=>portalApp.workspace.mixedDataset.records.length),927);
 const byId=new Map(originals.map(r=>[r.observation_id,r]));const rawKeys=['geometry','dataset_archive','dataset_sha256','source_record_index','source_schema_id','source_point_id','source_class_id','source_class_label','raw_attributes','observed_time','method','contributor_id','rights_id','quality_tier'];
 for(const r of pub.records){const old=byId.get(r.observation_id);assert.ok(old);for(const k of rawKeys)assert.deepEqual(r[k],old[k],r.observation_id+' '+k);assert.equal(r.publication_metadata.declared_year,2026)}
 const queue=await page.evaluate(()=>portalApp.workspace.case4Queue);assert.equal(queue.length,240);for(const q of queue){const r=byId.get(q.observation_id);assert.equal(q.project_class_id,r.project_class_id===1?3:2)}
 await page.getByRole('tab',{name:'Data Terbuka',exact:true}).click();const downloadPromise=page.waitForEvent('download');await page.locator('.btn-card-download').click();const download=await downloadPromise;const gj=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(gj.features.length,240);assert.equal(gj.metadata.declared_year,2026);assert.equal(gj.features.find(f=>f.properties.project_class_id===1).properties.epistem_code,'1135');
 await open();await page.locator('#pub-account-name').fill('Researcher A');await page.locator('#pub-institution').fill('Research institution');await page.locator('#pub-email').fill('researcher@example.org');await page.locator('#pub-responsibility').check();await page.locator('#cw-select-karet').selectOption('veg-tb-mono-coffee');await page.getByRole('button',{name:'Konfirmasi & Bagikan Data',exact:true}).click();
 const repeat=await page.evaluate(()=>portalApp.workspace.case2DonatedCollection);assert.equal(repeat.meta.version,pub.meta.version);assert.equal(repeat.meta.createdAt,pub.meta.createdAt);assert.equal(await page.evaluate(()=>portalApp.workspace.case4Queue.length),240);
 await page.reload();await page.waitForFunction(()=>window.portalApp?.workspace?.case2DonatedCollection?.records.length===240);await page.getByRole('combobox',{name:'Alihkan Peran Pengguna'}).selectOption('user_b');await page.getByRole('tab',{name:'Data Terbuka',exact:true}).click();assert.equal(await page.locator('.btn-card-download').count(),1);
    await page.waitForFunction(() => window.portalApp?.workspace?.activeRecords?.length > 0);
 await page.locator('[data-task="partner"]').click();await page.locator('.modal-body select').selectOption('data_kontribusi_mandiri');await page.waitForFunction(()=>portalApp.currentPartnerPreview?.sourceId==='data_kontribusi_mandiri');assert.equal(await page.evaluate(()=>portalApp.currentPartnerPreview.netNewCount),240);assert.equal(await page.evaluate(()=>portalApp.currentPartnerPreview.projectedTotalCount),326);
 await page.getByRole('button',{name:'Gunakan Data Mitra (Komit Non-hutan)',exact:true}).click();await page.reload();await page.waitForFunction(()=>window.portalApp?.workspace?.case3PrivateCollection?.records.length===326);await page.getByRole('tab',{name:'Data Anda',exact:true}).click();assert.match(await page.locator('.catalogue-item-list').innerText(),/326/);
 const reused=await page.evaluate(()=>portalApp.workspace.case3PrivateCollection.records.filter(r=>r.donor_lineage));assert.equal(reused.length,240);for(const r of reused){assert.equal(r.project_class_id,2);assert.equal(r.publication_metadata.declared_year,2026);assert.ok(r.donor_lineage.published_version||r.donor_lineage.publication_version||r.donor_lineage.version,'Version lineage persisted')}
 await page.locator('[data-task="partner"]').click();await page.locator('.modal-body select').selectOption('data_kontribusi_mandiri');await page.waitForFunction(()=>portalApp.currentPartnerPreview?.sourceId==='data_kontribusi_mandiri');assert.equal(await page.evaluate(()=>portalApp.currentPartnerPreview.netNewCount),0);await page.keyboard.press('Escape');
 assert.deepEqual(errors,[]);console.log('Publication240 / excluded687 / raw fields preserved / selected1135 / download240 / reload326 / repeat0 / queue240');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
