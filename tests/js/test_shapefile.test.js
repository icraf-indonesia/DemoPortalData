/**
 * tests/js/test_shapefile.test.js
 * Unit tests verifying binary shapefile writer against ESRI specification and python pyshp.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { generatePointShapefile } from '../../src/export/shapefile.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

test('generatePointShapefile creates valid binary buffers', () => {
  const records = [
    { coordinates: [104.5, -2.8], class_id: 1, class_name: 'Karet', obs_id: 'obs_001' },
    { coordinates: [104.8, -2.6], class_id: 2, class_name: 'Kelapa sawit', obs_id: 'obs_002' },
    { coordinates: [104.2, -2.5], class_id: 3, class_name: 'Lainnya', obs_id: 'obs_003' }
  ];

  const shpPackage = generatePointShapefile(records);
  assert.ok(shpPackage.shp instanceof Uint8Array);
  assert.ok(shpPackage.shx instanceof Uint8Array);
  assert.ok(shpPackage.dbf instanceof Uint8Array);
  assert.ok(shpPackage.prj.includes('WGS_1984'));
  assert.equal(shpPackage.cpg, 'UTF-8');

  // Verify .shp header
  // 100 bytes header + 3 * 28 bytes = 184 bytes
  assert.equal(shpPackage.shp.byteLength, 184);

  // File Code at byte 0-3 is 9994
  const shpView = new DataView(shpPackage.shp.buffer, shpPackage.shp.byteOffset, shpPackage.shp.byteLength);
  assert.equal(shpView.getInt32(0, false), 9994);
  assert.equal(shpView.getInt32(32, true), 1); // Point

  // Verify .shx length: 100 + 3 * 8 = 124 bytes
  assert.equal(shpPackage.shx.byteLength, 124);

  // Verify .dbf record count
  const dbfView = new DataView(shpPackage.dbf.buffer, shpPackage.dbf.byteOffset, shpPackage.dbf.byteLength);
  assert.equal(dbfView.getUint32(4, true), 3); // 3 records
});

test('generatePointShapefile is parseable by pyshp and matches values exactly', () => {
  const records = [
    { coordinates: [104.5123, -2.8456], class_id: 1, class_name: 'Karet', obs_id: 'obs_karet_1' },
    { coordinates: [104.6789, -2.7123], class_id: 2, class_name: 'Kelapa sawit', obs_id: 'obs_sawit_1' },
    { coordinates: [104.4321, -2.5678], class_id: 3, class_name: 'Lainnya', obs_id: 'obs_lainnya_1' }
  ];

  const shpPackage = generatePointShapefile(records);

  // Write temporary test files inside .work/test-shp (not polluting data/derived)
  const testDir = path.resolve(ROOT_DIR, '.work/test-shp');
  fs.mkdirSync(testDir, { recursive: true });

  const shpPath = path.join(testDir, 'test_output.shp');
  const shxPath = path.join(testDir, 'test_output.shx');
  const dbfPath = path.join(testDir, 'test_output.dbf');

  fs.writeFileSync(shpPath, Buffer.from(shpPackage.shp));
  fs.writeFileSync(shxPath, Buffer.from(shpPackage.shx));
  fs.writeFileSync(dbfPath, Buffer.from(shpPackage.dbf));

  // Run python script using pyshp from .work/python
  const pythonPath = '/opt/homebrew/Caskroom/miniconda/base/bin/python';
  const pythonLib = path.resolve(ROOT_DIR, '../python');

  const script = `
import shapefile, sys, json
sf = shapefile.Reader('${shpPath}')
assert len(sf) == 3, f"Expected 3 records, got {len(sf)}"
fields = [f[0] for f in sf.fields[1:]]
assert fields[0] == 'class_id', f"First field must be class_id, got {fields[0]}"
assert fields[1] == 'class_name'
assert fields[2] == 'obs_id'

records = []
for shape_rec in sf.shapeRecords():
    records.append({
        'coords': shape_rec.shape.points[0],
        'class_id': int(shape_rec.record['class_id']),
        'class_name': shape_rec.record['class_name'].strip(),
        'obs_id': shape_rec.record['obs_id'].strip()
    })
print(json.dumps(records))
`;

  const output = execFileSync(pythonPath, ['-c', script], {
    env: { ...process.env, PYTHONPATH: pythonLib },
    encoding: 'utf-8'
  });

  const parsed = JSON.parse(output.trim());
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].class_id, 1);
  assert.equal(parsed[0].class_name, 'Karet');
  assert.equal(parsed[0].obs_id, 'obs_karet_1');
  assert.ok(Math.abs(parsed[0].coords[0] - 104.5123) < 1e-6);
  assert.ok(Math.abs(parsed[0].coords[1] - (-2.8456)) < 1e-6);

  assert.equal(parsed[1].class_id, 2);
  assert.equal(parsed[1].class_name, 'Kelapa sawit');

  assert.equal(parsed[2].class_id, 3);
  assert.equal(parsed[2].class_name, 'Lainnya');
});
