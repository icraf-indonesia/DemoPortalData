/**
 * tests/js/test_primitives.test.js
 * Unit tests for primitives extraction, mapping, and publication integration.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractPrimitivesForRecords, derivePrimitivesForRecord, DEFAULT_PRIMITIVES_SAMPLES } from '../../src/features/primitives.js';
import { ContributionWorkflow } from '../../src/features/contribute.js';

test('extractPrimitivesForRecords maps sawit and karet records to their respective commodity primitives', () => {
  const ownedRecords = [
    { observation_id: 'sawit_01', project_class_id: 1, project_class_label: 'Kebun sawit' },
    { observation_id: 'sawit_02', project_class_id: 1, project_class_label: 'Kebun sawit' },
    { observation_id: 'karet_01', project_class_id: 2, project_class_label: 'Kebun karet' },
    { observation_id: 'karet_02', project_class_id: 2, project_class_label: 'Kebun karet' }
  ];

  const result = extractPrimitivesForRecords(ownedRecords);
  assert.equal(result.length, 4);

  // Check sawit items
  assert.equal(result[0].classLabel, 'Kebun sawit');
  assert.equal(result[0].observation_id, 'sawit_01');
  assert.ok(result[0].waterbody === 0 || result[0].waterbody === 1);
  assert.ok(result[0].tree_dominance === 0 || result[0].tree_dominance === 1);
  assert.ok(result[0].vegetation_height >= 0 && result[0].vegetation_height <= 50);

  // Check karet items
  assert.equal(result[2].classLabel, 'Kebun karet');
  assert.equal(result[2].observation_id, 'karet_01');
  assert.ok(result[2].waterbody === 0 || result[2].waterbody === 1);
  assert.ok(result[2].tree_dominance === 0 || result[2].tree_dominance === 1);
  assert.ok(result[2].vegetation_height >= 0 && result[2].vegetation_height <= 50);
});

test('createPublishedPackage attaches primitives to records and raw_properties', () => {
  const workflow = new ContributionWorkflow();
  const owned = [
    {
      observation_id: 'obs_sample_01',
      dataset_archive: '1_Data_Pengguna_1/Data_kebun_sawit_karet_F.zip',
      project_class_id: 1,
      project_class_label: 'Kebun sawit',
      source_schema_id: 'schema_pengguna_plantation_v1',
      is_user_owned: true,
      geometry: { type: 'Point', coordinates: [104.5, -2.5] }
    }
  ];

  const primitivesMap = {
    obs_sample_01: {
      waterbody: 1,
      tree_dominance: 1,
      vegetation_height: 18
    }
  };

  const declarations = {
    title: 'Test Published Package',
    accountName: 'Peneliti Uji',
    owningInstitution: 'Instansi Perkebunan A',
    technicalEmail: 'uji@example.org',
    confirmedYear: 2026,
    acquisitionMethod: 'Survei GPS Lapangan',
    responsibilityAccepted: true,
    primitivesMap
  };

  const pkg = workflow.createPublishedPackage(owned, declarations);
  assert.equal(pkg.records.length, 1);
  const rec = pkg.records[0];

  assert.deepEqual(rec.primitives, {
    waterbody: 1,
    tree_dominance: 1,
    vegetation_height: 18
  });
  assert.equal(rec.raw_properties.waterbody_, 1);
  assert.equal(rec.raw_properties.tree_domin, 1);
  assert.equal(rec.raw_properties.vegetation, 18);
  assert.deepEqual(rec.publication_metadata.primitives, rec.primitives);
});

test('derivePrimitivesForRecord derives components across all classes and honors z_coordinate', () => {
  // 1. Sawit with native z_coordinate
  const sawitRec = {
    observation_id: 'sawit_z_01',
    project_class_id: 1,
    project_class_label: 'Kebun sawit',
    raw_attributes: { z_coordinate: 6.5359 }
  };
  const primSawit = derivePrimitivesForRecord(sawitRec);
  assert.ok(primSawit.waterbody === 0 || primSawit.waterbody === 1);
  assert.ok(primSawit.tree_dominance === 0 || primSawit.tree_dominance === 1);
  assert.equal(primSawit.vegetation_height, 7); // rounded 6.5359

  // 2. Hutan with native z_coordinate
  const hutanRec = {
    observation_id: 'hutan_z_01',
    project_class_id: 4,
    project_class_label: 'Hutan',
    raw_attributes: { z_coordinate: 26.7536 }
  };
  const primHutan = derivePrimitivesForRecord(hutanRec);
  assert.ok(primHutan.waterbody === 0 || primHutan.waterbody === 1);
  assert.ok(primHutan.tree_dominance === 0 || primHutan.tree_dominance === 1);
  assert.equal(primHutan.vegetation_height, 27); // rounded 26.7536

  // 3. Sawah with native z_coordinate
  const sawahRec = {
    observation_id: 'sawah_z_01',
    project_class_id: 5,
    project_class_label: 'Sawah',
    raw_attributes: { z_coordinate: 2.2115 }
  };
  const primSawah = derivePrimitivesForRecord(sawahRec);
  assert.ok(primSawah.waterbody === 0 || primSawah.waterbody === 1);
  assert.ok(primSawah.tree_dominance === 0 || primSawah.tree_dominance === 1);
  assert.equal(primSawah.vegetation_height, 2); // rounded 2.2115

  // 4. Native 2b record with explicit raw properties
  const mod2bRec = {
    observation_id: 'mod2b_01',
    raw_properties: {
      waterbody_: 0,
      tree_domin: 1,
      vegetation: 14
    }
  };
  const primMod = derivePrimitivesForRecord(mod2bRec);
  assert.equal(primMod.waterbody, 0);
  assert.equal(primMod.tree_dominance, 1);
  assert.equal(primMod.vegetation_height, 14);

  // 5. Pre-attached primitives
  const preRec = {
    observation_id: 'pre_01',
    primitives: {
      waterbody: 1,
      tree_dominance: 0,
      vegetation_height: 12
    }
  };
  const primPre = derivePrimitivesForRecord(preRec);
  assert.equal(primPre.waterbody, 1);
  assert.equal(primPre.tree_dominance, 0);
  assert.equal(primPre.vegetation_height, 12);
});
