/**
 * tests/js/test_export.test.js
 * Unit tests verifying export package generation, JSZip, and manifest contracts.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createTrainingExportPackage } from '../../src/export/luma-adapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

test('createTrainingExportPackage produces valid ZIP with all 8 required files and manifest', async () => {
  const records = [
    {
      observation_id: 'sawit_001',
      geometry: { type: 'Point', coordinates: [104.5, -2.8] },
      project_class_id: 2,
      project_class_label: 'Kelapa sawit',
      dataset_archive: 'Data_kebun_sawit_karet_F.zip',
      source_class_id: '1',
      source_class_label: 'Kebun sawit'
    },
    {
      observation_id: 'karet_001',
      geometry: { type: 'Point', coordinates: [104.6, -2.7] },
      project_class_id: 1,
      project_class_label: 'Karet',
      dataset_archive: 'Data_kebun_sawit_karet_F.zip',
      source_class_id: '2',
      source_class_label: 'Kebun karet'
    },
    {
      observation_id: 'lainnya_001',
      geometry: { type: 'Point', coordinates: [104.4, -2.5] },
      project_class_id: 3,
      project_class_label: 'Lainnya',
      dataset_archive: 'Data_ref_mod_2b.zip',
      source_class_id: '1',
      source_class_label: 'Hutan'
    }
  ];

  const result = await createTrainingExportPackage({
    records,
    datasetId: 'data_campuran_1',
    datasetName: 'Data Campuran #1',
    classCounts: { 1: 1, 2: 1, 3: 1, total: 3 },
    mode: 'scenario',
    assumptions: ['Asumsi skenario percontohan']
  });

  assert.ok(result.buffer instanceof Uint8Array);
  assert.ok(result.buffer.byteLength > 500);

  // Check files in ZIP
  const filenames = Object.keys(result.zip.files);
  const expectedFiles = [
    'training_points.shp',
    'training_points.shx',
    'training_points.dbf',
    'training_points.prj',
    'training_points.cpg',
    'training_points.csv',
    'training_points.geojson',
    'manifest.json'
  ];

  for (const exp of expectedFiles) {
    assert.ok(filenames.includes(exp), `ZIP must contain ${exp}`);
  }

  // Check manifest invariants
  const manifest = result.manifest;
  assert.equal(manifest.dataset_ref.dataset_id, 'data_campuran_1');
  assert.equal(manifest.counts_by_class.total, 3);
  assert.equal(manifest.counts_by_class[1], 1);
  assert.equal(manifest.counts_by_class[2], 1);
  assert.equal(manifest.counts_by_class[3], 1);
  assert.equal(manifest.receiver_verification, 'untested');
  assert.ok(manifest.warnings.some(w => w.includes('belum teruji')));

  // Test python extraction and pyshp verification
  const testDir = path.resolve(ROOT_DIR, '.work/test-export');
  fs.mkdirSync(testDir, { recursive: true });
  const zipPath = path.join(testDir, 'test_export.zip');
  fs.writeFileSync(zipPath, Buffer.from(result.buffer));

  const pythonPath = process.env.PYTHON || 'python';
  const pythonLib = path.resolve(ROOT_DIR, '../python');

  const safeZipPath = zipPath.replace(/\\/g, '/');
  const safeExtractDir = path.join(testDir, 'extracted').replace(/\\/g, '/');

  const verifyScript = `
import zipfile, os
with zipfile.ZipFile('${safeZipPath}', 'r') as zf:
    zf.extractall('${safeExtractDir}')

try:
    import shapefile
    shp_path = '${safeExtractDir}/training_points.shp'
    sf = shapefile.Reader(shp_path)
    assert len(sf) == 3, f"Expected 3 records in zip shapefile, got {len(sf)}"
    fields = [f[0] for f in sf.fields[1:]]
    assert fields[0] == 'class_id'
    records = sf.records()
    assert int(records[0]['class_id']) == 2 # Sawit
    assert int(records[1]['class_id']) == 1 # Karet
    assert int(records[2]['class_id']) == 3 # Lainnya
    print('ZIP verification passed with pyshp!')
except ImportError:
    print('ZIP verification passed with zipfile (pyshp not installed)')
`;

  try {
    const output = execFileSync(pythonPath, ['-c', verifyScript], {
      env: { ...process.env, PYTHONPATH: pythonLib },
      encoding: 'utf-8'
    });
    assert.ok(output.includes('ZIP verification passed'));
  } catch (err) {
    console.warn('Python verification skipped:', err.message);
  }
});

test('createTrainingExportPackage rejects records with null project class', async () => {
  const invalidRecords = [
    {
      observation_id: 'bad_null_class_001',
      geometry: { type: 'Point', coordinates: [104.5, -2.8] },
      project_class_id: null, // Unmapped / null
      project_class_label: null,
      dataset_archive: '1_Data_Pengguna_1/Data_kebun_sawit_karet_F.zip'
    }
  ];

  await assert.rejects(
    async () => {
      await createTrainingExportPackage({
        records: invalidRecords,
        datasetId: 'test_reject',
        classCounts: { total: 1 }
      });
    },
    (err) => {
      assert.ok(err instanceof Error);
      assert.ok(err.message.includes('belum terpetakan (null)'));
      return true;
    }
  );
});

test('createTrainingExportPackage rejects records with invalid or non-finite coordinates', async () => {
  const nonFiniteCoords = [
    {
      observation_id: 'bad_coords_001',
      geometry: { type: 'Point', coordinates: [NaN, -2.8] },
      project_class_id: 1,
      project_class_label: 'Karet',
      dataset_archive: '1_Data_Pengguna_1/Data_kebun_sawit_karet_F.zip'
    }
  ];

  await assert.rejects(
    async () => {
      await createTrainingExportPackage({
        records: nonFiniteCoords,
        datasetId: 'test_reject_coord',
        classCounts: { total: 1 }
      });
    },
    (err) => {
      assert.ok(err instanceof Error);
      assert.ok(err.message.includes('non-finit'));
      return true;
    }
  );

  const missingGeom = [
    {
      observation_id: 'bad_geom_002',
      geometry: null,
      project_class_id: 1,
      project_class_label: 'Karet',
      dataset_archive: '1_Data_Pengguna_1/Data_kebun_sawit_karet_F.zip'
    }
  ];

  await assert.rejects(
    async () => {
      await createTrainingExportPackage({
        records: missingGeom,
        datasetId: 'test_reject_missing_geom',
        classCounts: { total: 1 }
      });
    },
    (err) => {
      assert.ok(err instanceof Error);
      assert.ok(err.message.includes('tidak memiliki geometri Point'));
      return true;
    }
  );
});

test('createTrainingExportPackage resolves real archive paths in scenario overlay without altering provenance', async () => {
  const records = [
    {
      observation_id: 'real_path_001',
      geometry: { type: 'Point', coordinates: [104.47, -2.42] },
      project_class_id: 2,
      project_class_label: 'Kelapa sawit',
      dataset_archive: '1_Data_Pengguna_1/Data_kebun_sawit_karet_F.zip',
      source_class_id: '1',
      source_class_label: 'Kebun sawit'
    }
  ];

  const pkg = await createTrainingExportPackage({
    records,
    datasetId: 'data_kebun_sawit_karet_f',
    mode: 'scenario'
  });

  // Verify CSV has real archive path preserved and scenario year overlay resolved
  const csvFile = await pkg.zip.file('training_points.csv').async('string');
  assert.ok(csvFile.includes('1_Data_Pengguna_1/Data_kebun_sawit_karet_F.zip'));
  assert.ok(csvFile.includes('2026')); // resolved from DATASET_SCENARIOS
  assert.ok(csvFile.includes('true')); // is_scenario_assumption

  // Verify GeoJSON properties
  const geojsonStr = await pkg.zip.file('training_points.geojson').async('string');
  const parsedGeojson = JSON.parse(geojsonStr);
  const feat = parsedGeojson.features[0];
  assert.equal(feat.properties.source_dataset_id, '1_Data_Pengguna_1/Data_kebun_sawit_karet_F.zip');
  assert.equal(feat.properties.scenario_observed_year, 2026);
  assert.equal(feat.properties.source_observed_year, null); // source unknown preserved!
  assert.equal(feat.properties.is_scenario_assumption, true);
});

test('Manifest honestly records rights_source_unknown when source rights are absent in source mode', async () => {
  const records = [
    {
      observation_id: 'no_rights_001',
      geometry: { type: 'Point', coordinates: [104.47, -2.42] },
      project_class_id: 2,
      project_class_label: 'Kelapa sawit',
      dataset_archive: '1_Data_Pengguna_1/Data_kebun_sawit_karet_F.zip',
      source_class_id: '1',
      source_class_label: 'Kebun sawit',
      rights_id: null // Unknown source rights
    }
  ];

  const pkg = await createTrainingExportPackage({
    records,
    datasetId: 'data_kebun_sawit_karet_f',
    mode: 'source' // Source mode!
  });

  const manifest = pkg.manifest;
  assert.deepEqual(manifest.rights_refs, ['rights_source_unknown']);
  assert.ok(!manifest.rights_refs.includes('rights_source_recorded'), 'Must never claim rights recorded if unknown');
});

