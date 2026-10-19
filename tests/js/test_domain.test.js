/**
 * tests/js/test_domain.test.js
 * Automated unit tests for domain records and taxonomy logic using node:test.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeObservation, validateObservationInvariants } from '../../src/domain/records.js';
import {
  PROJECT_CLASSES,
  UNMAPPED_CLASS,
  getProjectClass,
  computeClassCounts,
  resolveSourceToProjectClass
} from '../../src/domain/taxonomy.js';

test('normalizeObservation generates stable archive-hash + record-index IDs', () => {
  const feature = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [104.5, -2.8] },
    properties: {
      source_record_index: 42,
      dataset_archive: '1_Data_Pengguna_1/Data_kebun_sawit_karet_F.zip',
      dataset_sha256: 'a1b2c3d4e5f67890abcdef1234567890',
      project_class_id: 1,
      project_class_label: 'Karet',
      source_class_id: '2',
      source_class_label: 'Kebun karet',
      raw_attributes: { Id_LULC: 2, LULC: 'Kebun karet' }
    }
  };

  const obs = normalizeObservation(feature);
  assert.equal(obs.observation_id, 'a1b2c3d4e5f6_000042');
  assert.equal(obs.source_record_index, 42);
  assert.deepEqual(obs.geometry.coordinates, [104.5, -2.8]);
  assert.equal(obs.project_class_id, 1);
  assert.equal(obs.project_class_label, 'Karet');
  assert.equal(obs.source_class_id, '2');
  assert.equal(obs.source_class_label, 'Kebun karet');
  assert.deepEqual(obs.raw_attributes, { Id_LULC: 2, LULC: 'Kebun karet' });
});

test('normalizeObservation rejects non-finite coordinates at data boundary', () => {
  const malformed = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [NaN, -2.8] },
    properties: {
      source_record_index: 0,
      dataset_archive: 'test.zip',
      dataset_sha256: 'a1b2c3d4e5f67890'
    }
  };
  assert.throws(() => normalizeObservation(malformed), /Non-finite point coordinates/);
});

test('normalizeObservation rejects missing provenance at data boundary', () => {
  const missingProv = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [104.5, -2.8] },
    properties: {
      source_record_index: 0
    }
  };
  assert.throws(() => normalizeObservation(missingProv), /Missing or invalid dataset SHA256/);
});

test('normalizeObservation preserves null project class without default Lainnya fallback', () => {
  const feature = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [104.2, -2.5] },
    properties: {
      source_record_index: 0,
      dataset_archive: '2a_Data_Referensi_Modular/Data_ref_mod_F.zip',
      dataset_sha256: '93d6f5f871102ae5f83f',
      source_point_id: 'Titik_1',
      project_class_id: null,
      project_class_label: null
    }
  };

  const obs = normalizeObservation(feature);
  assert.equal(obs.project_class_id, null);
  assert.equal(obs.project_class_label, null);
  assert.equal(obs.source_point_id, 'Titik_1');
  assert.equal(obs.identity_basis, 'native_id');
  // Unknown dates, methods, contributors, rights, and quality MUST remain null
  assert.equal(obs.observed_time, null);
  assert.equal(obs.method, 'unknown');
  assert.equal(obs.contributor_id, null);
  assert.equal(obs.rights_id, null);
  assert.equal(obs.quality_tier, null);
  assert.deepEqual(obs.evidence_refs, []);
  assert.equal(validateObservationInvariants(obs), true);
});

test('PROJECT_CLASSES and UNMAPPED_CLASS defined correctly', () => {
  assert.equal(PROJECT_CLASSES[1].label, 'Kebun sawit');
  assert.equal(PROJECT_CLASSES[1].colour, '#D81C5C');

  assert.equal(PROJECT_CLASSES[2].label, 'Kebun karet');
  assert.equal(PROJECT_CLASSES[2].colour, '#761C97');

  assert.equal(PROJECT_CLASSES[3].label, 'Lainnya');
  assert.equal(PROJECT_CLASSES[3].colour, '#6E6E6E');

  assert.equal(UNMAPPED_CLASS.label, 'Belum dipetakan');
  assert.equal(UNMAPPED_CLASS.colour, '#90A4AE');
  assert.equal(getProjectClass(null).label, 'Belum dipetakan');
});

test('computeClassCounts aggregates project classes, unmapped, and source breakdown', () => {
  const sampleRecords = [
    { project_class_id: 1, source_class_label: 'Kebun sawit' },
    { project_class_id: 1, source_class_label: 'Kebun sawit' },
    { project_class_id: 2, source_class_label: 'Kebun karet' },
    { project_class_id: null, source_class_label: 'Hutan' },
    { project_class_id: null, source_class_label: 'Hutan' }
  ];

  const counts = computeClassCounts(sampleRecords);
  assert.equal(counts[1], 2);
  assert.equal(counts[2], 1);
  assert.equal(counts[3], 0);
  assert.equal(counts.unmapped, 2);
  assert.equal(counts.total, 5);
  assert.equal(counts.sourceClasses['Kebun sawit'], 2);
  assert.equal(counts.sourceClasses['Kebun karet'], 1);
  assert.equal(counts.sourceClasses['Hutan'], 2);
});

test('resolveSourceToProjectClass maps ONLY plantation and leaves others null', () => {
  // Plantation: 1=Sawit -> Project 1, 2=Karet -> Project 2
  const sawitRes = resolveSourceToProjectClass('Data_kebun_sawit_karet_F', { Id_LULC: 1 });
  assert.equal(sawitRes.project_class_id, 1);
  assert.equal(sawitRes.project_class_label, 'Kebun sawit');

  const karetRes = resolveSourceToProjectClass('Data_kebun_sawit_karet_F', { Id_LULC: 2 });
  assert.equal(karetRes.project_class_id, 2);
  assert.equal(karetRes.project_class_label, 'Kebun karet');

  // Any other source or class: null (no fallback Lainnya)
  const ref2b = resolveSourceToProjectClass('Data_ref_mod_2b', { Id_LULCrcl: 1, LULCrcl: 'Hutan' });
  assert.equal(ref2b.project_class_id, null);
  assert.equal(ref2b.project_class_label, null);

  const ref2a = resolveSourceToProjectClass('Data_ref_mod_F', { Id_drm: 1, Dt_ref_mod: 'Titik_1' });
  assert.equal(ref2a.project_class_id, null);
  assert.equal(ref2a.project_class_label, null);
});

test('EPISTEM_MASTER_TAXONOMY defines 24 Indonesian LULC leaf classes and crosswalk', async () => {
  const { EPISTEM_MASTER_TAXONOMY, getTaxonomyLeaves, DEFAULT_EPISTEM_CROSSWALK } = await import('../../src/domain/epistem-taxonomy.js');
  const leaves = getTaxonomyLeaves(EPISTEM_MASTER_TAXONOMY);
  assert.equal(leaves.length, 24, 'Must have 24 leaf classes');

  // Verify Indonesian names
  const karetLeaf = leaves.find(l => l.code === '1132');
  assert.ok(karetLeaf);
  assert.equal(karetLeaf.name, 'Monokultur Karet');

  const sawitLeaf = leaves.find(l => l.code === '1133');
  assert.ok(sawitLeaf);
  assert.equal(sawitLeaf.name, 'Monokultur Kelapa Sawit');

  const hutanLahanKering = leaves.find(l => l.code === '1111');
  assert.ok(hutanLahanKering);
  assert.equal(hutanLahanKering.name, 'Hutan Lahan Kering Primer');

  const sawah = leaves.find(l => l.code === '1220');
  assert.ok(sawah);
  assert.equal(sawah.name, 'Sawah');

  // Crosswalk matches
  assert.equal(DEFAULT_EPISTEM_CROSSWALK[1].name, 'Monokultur Kelapa Sawit');
  assert.equal(DEFAULT_EPISTEM_CROSSWALK[2].name, 'Monokultur Karet');
});

